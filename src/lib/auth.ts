export const AUTH_COOKIE = "club_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function hashPassword(password: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(password)));
}

function equalStrings(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function passwordIsValid(password: string): Promise<boolean> {
  const configuredHash = process.env.ADMIN_PASSWORD_HASH;
  if (!configuredHash) throw new Error("ADMIN_PASSWORD_HASH is not configured.");
  return equalStrings(await hashPassword(password), configuredHash.trim().toLowerCase());
}

export async function createSessionCookie(): Promise<string> {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) throw new Error("AUTH_SESSION_SECRET is not configured.");
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${expires}.${process.env.ADMIN_PASSWORD_HASH?.trim().toLowerCase() ?? ""}`;
  return `${expires}.${await hmac(secret, payload)}`;
}

export async function isValidSession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const secret = process.env.AUTH_SESSION_SECRET;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim().toLowerCase();
  if (!secret || !passwordHash) return false;
  const separator = value.indexOf(".");
  if (separator <= 0) return false;
  const expires = Number(value.slice(0, separator));
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return false;
  const payload = `${expires}.${passwordHash}`;
  const expected = await hmac(secret, payload);
  return equalStrings(value.slice(separator + 1), expected);
}

function cookieValue(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}

export async function requestHasValidSession(request: Request): Promise<boolean> {
  return isValidSession(cookieValue(request.headers.get("cookie"), AUTH_COOKIE));
}

export function sessionCookieHeader(value: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${AUTH_COOKIE}=${value}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${AUTH_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;
}
