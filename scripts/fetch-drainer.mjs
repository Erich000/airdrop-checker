#!/usr/bin/env node
// Download the claim script into vendor/drainer.js and fingerprint it.
// Usage: node scripts/fetch-drainer.mjs --url https://example.com/script.js

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TARGET = resolve(ROOT, "vendor/drainer.js");
const DIGEST = resolve(ROOT, "vendor/drainer.sha256");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : (process.argv[index + 1] || "").trim();
}

const url = arg("--url");
if (!url) {
  console.error("missing --url\nusage: node scripts/fetch-drainer.mjs --url <script-url>");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error(`not a valid URL: ${url}`);
  process.exit(1);
}
if (!/^https?:$/.test(parsed.protocol)) {
  console.error(`unsupported protocol: ${parsed.protocol}`);
  process.exit(1);
}

try {
  const existing = await readFile(TARGET, "utf8");
  if (existing.length > 0) {
    console.error(`refusing to overwrite ${TARGET}\nrun with a fresh path or delete it first`);
    process.exit(1);
  }
} catch {
  /* no existing file, fine */
}

const response = await fetch(url, { redirect: "follow" });
if (!response.ok) {
  console.error(`download failed: HTTP ${response.status}`);
  process.exit(1);
}

const body = await response.text();
if (body.trim().length === 0) {
  console.error("downloaded file is empty");
  process.exit(1);
}

await mkdir(dirname(TARGET), { recursive: true });
await writeFile(TARGET, body, "utf8");

const sha256 = createHash("sha256").update(body).digest("hex");
await writeFile(DIGEST, `${sha256}  drainer.js\n`, "utf8");

console.log(`saved vendor/drainer.js (${body.length} bytes)`);
console.log(`sha256 ${sha256}`);
