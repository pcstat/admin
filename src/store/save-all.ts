"use client";

import { dirtyCodes, useCertificatesStore } from "./certificates-store";
import { useContentStore } from "./content-store";

/**
 * The panel keeps two kinds of edits in two repositories: website content (the database) and certificates (the registry).
 * One Save button saves whichever has changes — the database first, then the registry.
 */
export async function saveAll(): Promise<boolean> {
  const content = useContentStore.getState();
  const certs = useCertificatesStore.getState();
  let ok = true;
  if (content.dirty) ok = (await content.save()) && ok;
  if (dirtyCodes(certs).length > 0) ok = (await certs.save()) && ok;
  return ok;
}

export const anyUnsaved = () => useContentStore.getState().dirty || dirtyCodes(useCertificatesStore.getState()).length > 0;
