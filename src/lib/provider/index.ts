import { getCertificatesLocation } from "../database-config";
import { GithubProvider } from "./github";
import { LocalFsProvider } from "./local-fs";
import type { DataProvider } from "./types";

let cached: DataProvider | null = null;
let cachedCertificates: DataProvider | null = null;

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

/**
 * The certificate registry — a separate repository from the database, because there will be thousands of certificates.
 * DATA_PROVIDER=local → the folder CERTIFICATES_LOCAL_DIR (default ./local-certificates);
 * DATA_PROVIDER=github → the repo named by "certificates" in database.json, with GITHUB_TOKEN (or CERTIFICATES_TOKEN when
 * that repo needs a different token).
 */
export function getCertificatesProvider(): DataProvider {
  if (cachedCertificates) return cachedCertificates;
  if (process.env.DATA_PROVIDER === "github") {
    const { owner, name, branch } = getCertificatesLocation();
    cachedCertificates = new GithubProvider({ owner, name, branch, token: process.env.CERTIFICATES_TOKEN?.trim() || undefined, deletionPrefix: "sets" });
  } else {
    cachedCertificates = new LocalFsProvider(process.env.CERTIFICATES_LOCAL_DIR || "local-certificates");
  }
  return cachedCertificates;
}

export type { CommitRequest, CommitResult, DataProvider, FileChange } from "./types";
export { ConflictError } from "./types";
