import { ConflictError, type CommitRequest, type CommitResult, type DataProvider } from "./types";

/** Overridable (GitHub Enterprise, or a mock server in tests). */
const API = process.env.GITHUB_API_URL?.replace(/\/$/, "") || "https://api.github.com";

interface Config {
  token?: string;
  owner: string;
  repo: string;
  branch: string;
}

function readConfig(): Config {
  const databaseRepo = process.env.DATABASE_REPO?.trim();
  if (!databaseRepo) throw new Error("DATABASE_REPO is required when DATA_PROVIDER=github (see .env.example).");
  const [owner, repo] = databaseRepo.split("/");
  if (!owner || !repo) throw new Error(`DATABASE_REPO must look like "owner/name", got "${databaseRepo}".`);
  return {
    token: process.env.GITHUB_TOKEN?.trim() || undefined,
    owner,
    repo,
    branch: process.env.DATABASE_BRANCH?.trim() || "main",
  };
}

export class GithubProvider implements DataProvider {
  readonly kind = "github" as const;
  private config = readConfig();

  private get repoPath(): string {
    return `/repos/${this.config.owner}/${this.config.repo}`;
  }

  private headers(extra: HeadersInit = {}): HeadersInit {
    return {
      Accept: "application/vnd.github+json",
      "User-Agent": "programming-club-admin",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
      ...extra,
    };
  }

  private async json<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: this.headers({ ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) }),
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      throw new Error(`GitHub returned invalid JSON (${res.status} ${res.statusText}): ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const message = parsed && typeof parsed === "object" && "message" in parsed ? String((parsed as { message: unknown }).message) : text.slice(0, 200);
      throw new Error(`GitHub API ${res.status} ${res.statusText}: ${message || "empty response"}`);
    }
    if (parsed === undefined) throw new Error(`GitHub returned an empty response for ${path}.`);
    return parsed as T;
  }

  async readText(file: string): Promise<string | null> {
    const url = `${API}${this.repoPath}/contents/${file.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(this.config.branch)}`;
    // The "raw" media type returns the file itself (works for files above 1 MB too).
    const res = await fetch(url, { headers: this.headers({ Accept: "application/vnd.github.raw+json" }), cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText} while reading ${file}`);
    return res.text();
  }

  async listFiles(prefix: string): Promise<string[]> {
    const tree = await this.json<{ tree: { path: string; type: string }[]; truncated?: boolean }>(
      `${this.repoPath}/git/trees/${encodeURIComponent(this.config.branch)}?recursive=1`,
      { cache: "no-store" },
    );
    const dir = prefix.endsWith("/") ? prefix : `${prefix}/`;
    return tree.tree.filter((e) => e.type === "blob" && e.path.startsWith(dir)).map((e) => e.path).sort();
  }

  async getHeadSha(): Promise<string | null> {
    const ref = await this.json<{ object: { sha: string } }>(`${this.repoPath}/git/ref/heads/${encodeURIComponent(this.config.branch)}`, { cache: "no-store" });
    return ref.object.sha;
  }

  /**
   * One atomic commit holding every JSON and photo change.
   *
   * The Git Database API is used (blobs → tree → commit → fast-forward ref update) instead of GraphQL's
   * createCommitOnBranch, which would send large photos as query variables. Readers only see the new
   * files after the final ref update.
   */
  async commit(request: CommitRequest): Promise<CommitResult> {
    if (!this.config.token) throw new Error("GITHUB_TOKEN is required to save when DATA_PROVIDER=github.");
    const head = await this.getHeadSha();
    if (!head) throw new Error("Could not read the current commit of the database repo.");
    if (request.baseSha && request.baseSha !== head) {
      throw new ConflictError("The database changed since you opened it (someone else saved, or a file was edited on GitHub). Reload the page, then redo your edit.");
    }
    const headCommit = await this.json<{ tree: { sha: string } }>(`${this.repoPath}/git/commits/${head}`);

    // Deleting a path that is not in the tree makes GitHub reject the whole commit, so only delete what exists.
    const wanted = request.deletions ?? [];
    const existing = wanted.length ? new Set(await this.listFiles("photos")) : new Set<string>();
    const deletions = wanted.filter((p) => existing.has(p));

    const blobs = await Promise.all(
      request.files.map(async (file) => {
        const blob = await this.json<{ sha: string }>(`${this.repoPath}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({ content: file.contentsBase64, encoding: "base64" }),
        });
        return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
      }),
    );
    const tree = await this.json<{ sha: string }>(`${this.repoPath}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: headCommit.tree.sha,
        tree: [...blobs, ...deletions.map((path) => ({ path, mode: "100644", type: "blob", sha: null }))],
      }),
    });
    const commit = await this.json<{ sha: string; html_url: string }>(`${this.repoPath}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message: request.message, tree: tree.sha, parents: [head] }),
    });
    await this.json(`${this.repoPath}/git/refs/heads/${encodeURIComponent(this.config.branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    return { provider: "github", commitSha: commit.sha, commitUrl: commit.html_url };
  }
}
