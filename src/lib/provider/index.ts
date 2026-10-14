import { GithubProvider } from "./github";
import { LocalFsProvider } from "./local-fs";
import type { DataProvider } from "./types";

let cached: DataProvider | null = null;

/**
 * DATA_PROVIDER=local  (default) → a folder on disk (DATA_LOCAL_DIR, default ./local-data).
 * DATA_PROVIDER=github           → the real database repo, via GITHUB_TOKEN / DATABASE_REPO.
 *
 * Every route talks to `getDataProvider()` only, so switching is an env-var change.
 */
export function getDataProvider(): DataProvider {
  if (cached) return cached;
  cached = process.env.DATA_PROVIDER === "github" ? new GithubProvider() : new LocalFsProvider();
  return cached;
}

export type { CommitRequest, CommitResult, DataProvider, FileChange } from "./types";
export { ConflictError } from "./types";
