#!/usr/bin/env node
/*
 * Generates a frozen "legacy save" fixture in the pre-UUID storage format.
 *
 * This fixture is the canonical input for verifying the future text-ID -> UUID
 * migration. NEVER edit the output JSON by hand once committed; regenerate via
 * this script (and only when the legacy-format definition itself changes,
 * which should be never after migration ships).
 *
 * The bullet-id derivation lives in scripts/parse-checklist.js — both this
 * script AND scripts/run-migration-test.js consume that single source of
 * truth. After migration ships, freeze parse-checklist.js along with this
 * fixture.
 */

const fs = require("fs");
const path = require("path");
const { parseChecklist } = require("./parse-checklist");

const REPO_ROOT = path.resolve(__dirname, "..");
const CHECKLIST_PATH = path.join(REPO_ROOT, "checklist.md");
const OUT_PATH = path.join(REPO_ROOT, "test/fixtures/legacy-save-v0.json");
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  "test/fixtures/legacy-save-v0.manifest.json"
);

function pickRepresentative(items) {
  // Spread sample across sections, levels, duplicates, and item types.
  const bySection = new Map();
  for (const it of items) {
    if (!bySection.has(it.section)) bySection.set(it.section, []);
    bySection.get(it.section).push(it);
  }

  const picked = [];
  // Take up to 3 from each section: 2 top-level + 1 nested where available
  for (const [, list] of bySection) {
    const top = list.filter((x) => x.level === 0).slice(0, 2);
    const nested = list.filter((x) => x.level > 0).slice(0, 1);
    picked.push(...top, ...nested);
  }

  // Add several known-duplicate IDs (any item whose legacyId has _N suffix)
  const dupes = items.filter((x) => /_\d+$/.test(x.legacyId)).slice(0, 5);
  for (const d of dupes) if (!picked.includes(d)) picked.push(d);

  // Add a sampling of items containing rarity tokens
  const wantTokens = [
    "::item_legendary::",
    "::item_veryrare::",
    "::ability::",
    "::missable::",
  ];
  for (const tok of wantTokens) {
    const match = items.find((x) => x.bulletBody.includes(tok));
    if (match && !picked.includes(match)) picked.push(match);
  }

  return picked;
}

function main() {
  const md = fs.readFileSync(CHECKLIST_PATH, "utf8");
  const items = parseChecklist(md);

  const sample = pickRepresentative(items);

  // Two profiles: Default Profile gets ~67% of sample checked,
  // Tav Tester gets ~20% — distinct distributions to verify per-profile isolation
  const defaultChecks = {};
  const tavChecks = {};
  sample.forEach((it, i) => {
    defaultChecks[it.legacyId] = i % 3 !== 0;
    tavChecks[it.legacyId] = i % 5 === 0;
  });

  const fixture = {
    current: "Default Profile",
    bg3_profiles: {
      "Default Profile": { checklistData: defaultChecks },
      "Tav Tester": { checklistData: tavChecks },
    },
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(fixture, null, 2) + "\n");

  const manifest = {
    generatedFrom: "checklist.md",
    totalItemsParsed: items.length,
    totalSampled: sample.length,
    sections: [...new Set(items.map((i) => i.section))],
    sample: sample.map((it) => ({
      section: it.section,
      level: it.level,
      legacyId: it.legacyId,
      preview: it.rawLine.slice(0, 80),
      checkedInDefault: defaultChecks[it.legacyId],
      checkedInTav: tavChecks[it.legacyId],
    })),
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    `Parsed ${items.length} items across ${manifest.sections.length} sections`
  );
  console.log(`Sampled ${sample.length} items into fixture`);
  console.log(
    `Default Profile: ${Object.values(defaultChecks).filter(Boolean).length} checked`
  );
  console.log(`Tav Tester: ${Object.values(tavChecks).filter(Boolean).length} checked`);
  console.log(`Wrote: ${OUT_PATH}`);
}

main();
