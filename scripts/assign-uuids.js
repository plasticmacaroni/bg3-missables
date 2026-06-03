#!/usr/bin/env node
/*
 * Walks checklist.md and appends `<!--uuid:UUID-V4-->` to any bullet line
 * missing one. Idempotent — bullets that already have a UUID comment are
 * left untouched.
 *
 * Usage:
 *   node scripts/assign-uuids.js          # write missing UUIDs in place
 *   node scripts/assign-uuids.js --lint   # exit 1 if any bullet missing
 *   node scripts/assign-uuids.js --check  # alias for --lint
 *   node scripts/assign-uuids.js --dry    # report what would change without writing
 *
 * The UUID comment is appended with one leading space and placed at the
 * end of the line. Display and legacy-id derivation in main.js / parse-
 * checklist.js strip the comment + surrounding whitespace before rendering
 * or hashing, so adding it does not change the bullet's legacy text-id.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO_ROOT = path.resolve(__dirname, "..");
const CHECKLIST_PATH = path.join(REPO_ROOT, "checklist.md");

const UUID_COMMENT_RE = /<!--uuid:([0-9a-fA-F-]{6,})-->/;
// Bullets: top-level "- foo" or indented (tabs / 2-space pairs) "  - foo"
const BULLET_RE = /^(?:\t| {2})*-\s/;

function generateUuid() {
  // Node 14.17+ has crypto.randomUUID; older versions fall back to webcrypto.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  if (crypto.webcrypto && typeof crypto.webcrypto.randomUUID === "function") {
    return crypto.webcrypto.randomUUID();
  }
  throw new Error("No randomUUID available; require Node 14.17+");
}

function processLines(lines) {
  let added = 0;
  let missing = 0;
  const annotated = lines.map((line) => {
    if (!BULLET_RE.test(line)) return line;
    if (UUID_COMMENT_RE.test(line)) return line;
    missing++;
    added++;
    // Append UUID comment after a single space, preserving any trailing
    // whitespace by inserting BEFORE it (none typically present, but safe).
    const m = line.match(/^(.*?)(\s*)$/);
    const body = m ? m[1] : line;
    const trailingWs = m ? m[2] : "";
    return `${body} <!--uuid:${generateUuid()}-->${trailingWs}`;
  });
  return { annotated, added, missing };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const lintMode = args.has("--lint") || args.has("--check");
  const dryRun = args.has("--dry") || args.has("--dry-run");

  const original = fs.readFileSync(CHECKLIST_PATH, "utf8");
  const lines = original.split("\n");
  const { annotated, missing } = processLines(lines);

  if (lintMode) {
    if (missing > 0) {
      console.error(
        `lint failed: ${missing} bullet(s) missing UUID comment in checklist.md`
      );
      process.exit(1);
    }
    console.log(`lint passed: all bullets have UUID comments`);
    process.exit(0);
  }

  if (missing === 0) {
    console.log(`no-op: all bullets already have UUID comments`);
    return;
  }

  if (dryRun) {
    console.log(`dry-run: would assign UUIDs to ${missing} bullet(s)`);
    return;
  }

  fs.writeFileSync(CHECKLIST_PATH, annotated.join("\n"));
  console.log(`assigned UUIDs to ${missing} bullet(s)`);
}

main();
