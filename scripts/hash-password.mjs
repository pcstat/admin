#!/usr/bin/env node
/**
 * Prints the two login secrets this admin panel needs.
 *
 *   pnpm hash-password            → asks for the password (input is hidden)
 *   pnpm hash-password "my pass"  → uses the given password
 *
 * Copy the output into .env.local (local) or into Cloudflare secrets (production).
 */
import { createHash, randomBytes } from "node:crypto";
import readline from "node:readline";

async function askHidden(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (text) => {
    if (text.includes(question)) rl.output.write(text);
  };
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = process.argv[2] ?? (await askHidden("Admin password: "));
if (!password) {
  console.error("A password is required.");
  process.exit(1);
}

console.log("\nADMIN_PASSWORD_HASH=" + createHash("sha256").update(password).digest("hex"));
console.log("AUTH_SESSION_SECRET=" + randomBytes(32).toString("base64url"));
console.log("\nChanging AUTH_SESSION_SECRET (or the password) signs everybody out.");
