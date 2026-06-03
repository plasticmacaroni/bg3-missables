/**
 * Shared checklist.md parser. Consumed by:
 *   - scripts/build-test-fixture.js (frozen — generates legacy-save-v0.json)
 *   - scripts/assign-uuids.js
 *   - scripts/run-migration-test.js
 *
 * Mirrors the bullet-id derivation rules used by js/main.js so legacy
 * text-derived IDs (the keys real users have in their browser saves)
 * stay in sync with the migration test fixture.
 *
 * Key invariants:
 *  1. Stripping a `<!--uuid:...-->` comment from a bullet must NOT change
 *     its legacy text-derived ID. The comment (with surrounding whitespace)
 *     is removed before the legacy-ID derivation runs.
 *  2. Duplicate-id suffix ordering matches main.js: items are walked in
 *     document order; the Nth occurrence of a given baseId becomes
 *     `playthrough_{baseId}_{N}` (zeroth has no suffix).
 *  3. The `::token::` → `<i>` replacements mirror main.js exactly.
 *
 * If main.js's parsing changes BEFORE the UUID migration ships, this file
 * must be updated to match — drift here breaks the migration test silently.
 * After migration ships, freeze this module along with the fixture.
 */

const TOKEN_TAGS = [
  // Order matters: longer tokens before shorter prefixes (item_legendary
  // before item_, etc.) so the regex doesn't eat the shorter form first.
  "missable",
  "item_ordinary",
  "item_common",
  "item_uncommon",
  "item_rare",
  "item_veryrare",
  "item_legendary",
  "item_story",
  "item",
  "ability",
  "task",
];

const UUID_COMMENT_RE = /\s*<!--uuid:([0-9a-fA-F-]{6,})-->\s*/;

function sanitize(s) {
  return s
    .split("")
    .map((c) => (/^[A-Za-z0-9\-_]$/.test(c) ? c : "_"))
    .join("");
}

/**
 * Derive the legacy text-ID baseId for a bullet body (already stripped of
 * the leading "- " marker). The UUID comment, if present, must be stripped
 * BEFORE calling this — the legacy ID derives from the same text the
 * pre-UUID site saw.
 *
 * Returns the un-prefixed, un-suffixed baseId. The caller assembles the
 * full `playthrough_baseId[_N]` form.
 */
function deriveLegacyBaseId(bulletBody) {
  let text = bulletBody.trim();

  if (!text.includes("::")) {
    text = "::task::" + text;
  }

  for (const tok of TOKEN_TAGS) {
    text = text.replace(new RegExp(`::${tok}::\\s*`, "g"), '<i class="bi"></i>');
  }

  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
  const stripped = text.replace(/(<([^>]+)>)/gi, "");
  return sanitize(stripped.slice(0, 50));
}

/**
 * Parse markdown into an array of items in document order.
 *
 * Each item: {
 *   section: string,        // most recent "# Header" text
 *   level: number,          // indent depth (chars of leading whitespace)
 *   rawLine: string,        // original line as-found
 *   bulletBody: string,     // raw bullet body with leading "- " stripped
 *   bulletBodyClean: string,// bulletBody with UUID comment + surrounding ws removed
 *   uuid: string|null,      // extracted UUID if comment present
 *   baseLegacyId: string,   // sanitize(slice50(rendered text))
 *   legacyId: string,       // final "playthrough_baseId[_N]" form
 * }
 */
function parseChecklist(markdown) {
  const lines = markdown.split("\n");
  const items = [];
  let section = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] || "";
    const trimmed = rawLine.trim();
    if (trimmed === "") continue;

    if (trimmed.startsWith("# ")) {
      section = trimmed.slice(2);
      continue;
    }

    const isBullet = trimmed.startsWith("- ") || /^(\t| {2})+\- /.test(rawLine);
    if (!isBullet) continue;

    const level = (rawLine.match(/^(?:\t| {2})*/) || [""])[0].length;
    const bulletBody = trimmed.slice(2);

    const uuidMatch = bulletBody.match(UUID_COMMENT_RE);
    const uuid = uuidMatch ? uuidMatch[1] : null;
    const bulletBodyClean = uuid
      ? bulletBody.replace(UUID_COMMENT_RE, "").replace(/\s+$/, "")
      : bulletBody;

    const baseLegacyId = deriveLegacyBaseId(bulletBodyClean);
    items.push({
      section,
      level,
      rawLine,
      bulletBody,
      bulletBodyClean,
      uuid,
      baseLegacyId,
      legacyId: null, // filled in after duplicate pass
    });
  }

  // Duplicate _N suffix in document order — mirrors main.js's listItemsArray walk
  const seenCount = {};
  for (const it of items) {
    const n = seenCount[it.baseLegacyId] || 0;
    it.legacyId =
      n === 0
        ? `playthrough_${it.baseLegacyId}`
        : `playthrough_${it.baseLegacyId}_${n}`;
    seenCount[it.baseLegacyId] = n + 1;
  }

  return items;
}

module.exports = {
  parseChecklist,
  deriveLegacyBaseId,
  sanitize,
  TOKEN_TAGS,
  UUID_COMMENT_RE,
};
