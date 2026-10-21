import fs from "node:fs/promises";
import path from "node:path";
import type { CommitRequest, CommitResult, DataProvider } from "./types";

/**
 * Stand-in for the database repo while developing: a plain folder laid out exactly like it
 * (database.json, executives.json, members/…, photos/…).
 */
export class LocalFsProvider implements DataProvider {
  readonly kind = "local-fs" as const;
  private root: string;

  /** `dir` defaults to DATA_LOCAL_DIR (the database stand-in); the certificate registry passes its own folder. */
  constructor(dir?: string) {
    this.root = path.resolve(/* turbopackIgnore: true */ process.cwd(), /* turbopackIgnore: true */ dir || process.env.DATA_LOCAL_DIR || "local-data");
  }

  /** Resolves a repo-relative path and refuses anything that escapes the data folder. */
  private resolve(relative: string): string {
    const full = path.resolve(this.root, relative);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) throw new Error(`Path outside the data folder: ${relative}`);
    return full;
  }

  async readText(file: string): Promise<string | null> {
    try {
      return await fs.readFile(this.resolve(file), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async readBinary(file: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await fs.readFile(this.resolve(file)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(this.resolve(dir), { withFileTypes: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
        throw err;
      }
      for (const entry of entries) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) await walk(rel);
        else out.push(rel);
      }
    };
    await walk(prefix.replace(/\/$/, ""));
    return out.sort();
  }

  async getHeadSha(): Promise<string | null> {
    return null; // no commits locally
  }

  async commit(request: CommitRequest): Promise<CommitResult> {
    for (const change of request.files) {
      const dest = this.resolve(change.path);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, Buffer.from(change.contentsBase64, "base64"));
    }
    for (const file of request.deletions ?? []) {
      try {
        await fs.unlink(this.resolve(file));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err; // already gone is fine
      }
    }
    return { provider: "local-fs" };
  }
}
