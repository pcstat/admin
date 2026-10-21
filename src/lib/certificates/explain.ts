import { getCertificatesLocation } from "../database-config";
import { getCertificatesProvider } from "../provider";

/**
 * Turns a failure of the certificate registry into a message that says WHICH repository was tried and what usually
 * causes it. GitHub's bare "404 Not Found" gives no hint, and it has four common causes.
 */
export function explainRegistryError(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err)).replace(/\.$/, "");
  try {
    if (getCertificatesProvider().kind !== "github") return raw;
    const { owner, name, branch } = getCertificatesLocation();
    const where = `${owner}/${name}, branch “${branch}”`;
    if (/\b404\b/.test(raw)) {
      return `Could not read the certificate registry (${where}): ${raw}. GitHub answers 404 when the repository does not exist, when it is still empty (the files of certificates.patch were not pushed to this branch yet), when the branch name is wrong, or when the token has no access to this repository — a fine-grained token has to list ${owner}/${name} as well as the database.`;
    }
    if (/\b40[13]\b/.test(raw)) {
      return `Could not read the certificate registry (${where}): ${raw}. Check GITHUB_TOKEN (or CERTIFICATES_TOKEN): it must be valid and allowed to read and write contents of ${owner}/${name}.`;
    }
    return `Could not read the certificate registry (${where}): ${raw}.`;
  } catch {
    return raw;
  }
}
