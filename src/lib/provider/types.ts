/** One file to write, relative to the database repo's root. Text or binary — always base64. */
export interface FileChange {
  path: string;
  contentsBase64: string;
}

export interface CommitRequest {
  message: string;
  files: FileChange[];
  /** Paths (relative to the repo root) to delete in the same commit — orphaned photos, mainly. */
  deletions?: string[];
  /** The commit the editor was loaded from. If the repo moved on since, the save is refused. */
  baseSha?: string | null;
}

export interface CommitResult {
  provider: "local-fs" | "github";
  commitUrl?: string;
  commitSha?: string;
}

export class ConflictError extends Error {}

/**
 * Everything the admin panel needs from the database goes through this interface; the provider is
 * picked by one env var (DATA_PROVIDER), so nothing in app/, components/ or store/ knows where files live.
 */
export interface DataProvider {
  readonly kind: "local-fs" | "github";
  /** UTF-8 content of a file, or null when it does not exist. */
  readText(path: string): Promise<string | null>;
  /** Every file below `prefix` (recursive), as repo-relative paths. */
  listFiles(prefix: string): Promise<string[]>;
  /** Identifier of the current state of the data (git commit SHA); null when unknown. */
  getHeadSha(): Promise<string | null>;
  /** Writes every change in one atomic commit (or one local write pass in dev). */
  commit(request: CommitRequest): Promise<CommitResult>;
  /** Binary content of a file (photos), or null. Only needed in local mode, where nothing else serves them. */
  readBinary?(path: string): Promise<Uint8Array | null>;
}
