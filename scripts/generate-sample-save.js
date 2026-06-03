#!/usr/bin/env node
/*
 * Builds a small, hand-curated v0 legacy save for end-to-end migration
 * testing. Output goes to test/fixtures/sample-legacy-save.json — separate
 * from the FROZEN test/fixtures/legacy-save-v0.json regression fixture.
 *
 * The output shape matches what the import flow accepts (no schemaVersion
 * field — schemaVersion absent ⇒ treat as v0). When the user imports this
 * file in the browser and reloads, the live migration converts the keys to
 * playthrough_<uuid> and bumps schemaVersion to 2. The chosen items appear
 * checked in the UI for verification.
 *
 * Two orphan keys are included to exercise the drop-silently policy.
 */

const fs = require("fs");
const path = require("path");
const { parseChecklist } = require("./parse-checklist");

const REPO_ROOT = path.resolve(__dirname, "..");
const CHECKLIST_PATH = path.join(REPO_ROOT, "checklist.md");
const OUT_PATH = path.join(REPO_ROOT, "test/fixtures/sample-legacy-save.json");

// Match by exact substring within the bullet body. Each entry will be looked
// up in the parsed items in document order — the first match wins. Pick
// distinct, easy-to-verify items spread across acts.
const TARGETS = [
  // Getting Started
  "If you see a \"tie up any loose ends\" warning",
  "Always crouch when stealing",
  // Act 1 — legendary deluxe item
  "Mask of the Shapeshifter",
  // Act 1 — quest progression
  "Start the quest [Daughter of Darkness]",
  // Act 1 — common pickup
  "Chain Shirt (Shadowheart)",
  // Act 1 — recognizable rare
  "Champion's Chain",
  // Act 1 — a specific NPC missable
  "Cap of Wrath",
  // Act 2 — easily-spotted
  "Holy Lance Helm",
  // Act 1 — Druid Grove area
  "Crusher's Ring",
  // Act 1 — Underdark
  "Caustic Band",
];

// Two orphan keys (text-derived ids that don't match any current bullet).
// Exercises the drop-silently policy — they should NOT appear after migration.
const ORPHAN_LEGACY_IDS = [
  "playthrough_THIS_BULLET_NEVER_EXISTED_in_the_chec",
  "playthrough_Removed_in_some_prior_release_xyz_pla",
];

function main() {
  const md = fs.readFileSync(CHECKLIST_PATH, "utf8");
  const items = parseChecklist(md);

  const checklistData = {};
  const matched = [];
  const missed = [];

  for (const target of TARGETS) {
    const found = items.find((it) => it.bulletBody.includes(target));
    if (found) {
      checklistData[found.legacyId] = true;
      matched.push({ target, legacyId: found.legacyId, uuid: found.uuid });
    } else {
      missed.push(target);
    }
  }

  if (missed.length > 0) {
    console.error(
      `WARN: ${missed.length} target(s) did not match any bullet:`,
      missed
    );
  }

  // Two orphans — these should be dropped on migration
  for (const orphan of ORPHAN_LEGACY_IDS) {
    checklistData[orphan] = true;
  }

  const fixture = {
    // Intentionally NO schemaVersion field — that's what makes this a v0
    // legacy save. The browser's migration will detect (schemaVersion||0)===0
    // and run the v0→v2 path, mapping legacy text-ids to playthrough_<uuid>
    // and dropping orphans.
    current: "Legacy Test Profile",
    bg3_profiles: {
      "Legacy Test Profile": {
        checklistData: checklistData,
      },
    },
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(fixture, null, 2) + "\n");

  console.log(`wrote ${OUT_PATH}`);
  console.log(`  ${matched.length} live items + ${ORPHAN_LEGACY_IDS.length} orphans`);
  console.log("");
  console.log("Items expected to appear checked after import + reload:");
  matched.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.target}`);
    console.log(`      legacyId: ${m.legacyId}`);
    console.log(`      uuid:     ${m.uuid}`);
  });
  console.log("");
  console.log("Orphan keys (must be dropped silently after migration):");
  ORPHAN_LEGACY_IDS.forEach((k) => console.log(`  - ${k}`));
}

main();
