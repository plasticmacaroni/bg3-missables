#!/usr/bin/env node
/*
 * Regression test for the save migration (legacy text-id → playthrough_UUID).
 *
 * Loads the frozen pre-UUID save fixture (test/fixtures/legacy-save-v0.json),
 * builds the legacy→UUID map from the current checklist.md, runs
 * bg3Migrate.migrateSaveToUUIDs against it, and asserts:
 *
 *   1. Profile structure preserved.
 *   2. Booleans preserved under PREFIXED UUID keys (i.e. "playthrough_<uuid>")
 *      matching the DOM data-id format used by main.js.
 *   3. Orphans dropped.
 *   4. schemaVersion === CURRENT_VERSION on output.
 *   5. hidePreferences: {} initialized per profile.
 *   6. Idempotency on second run.
 *   7. v1 buggy-state recovery: bare UUID keys get re-prefixed (covers the
 *      brief intermediate ship that produced bare-UUID storage).
 *
 * Exits 0 on pass, 1 on first failure.
 */

const fs = require("fs");
const path = require("path");
const { parseChecklist } = require("./parse-checklist");
const {
  migrateSaveToUUIDs,
  CURRENT_VERSION,
  SAVE_KEY_PREFIX,
} = require("../js/migrate");

const REPO_ROOT = path.resolve(__dirname, "..");
const CHECKLIST_PATH = path.join(REPO_ROOT, "checklist.md");
const FIXTURE_PATH = path.join(
  REPO_ROOT,
  "test/fixtures/legacy-save-v0.json"
);

function fail(message, extra) {
  console.error("FAIL: " + message);
  if (extra !== undefined) console.error(extra);
  process.exit(1);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function main() {
  const md = fs.readFileSync(CHECKLIST_PATH, "utf8");
  const items = parseChecklist(md);

  const oldToNewMap = {};
  let itemsWithUuid = 0;
  for (const it of items) {
    if (it.uuid) {
      oldToNewMap[it.legacyId] = it.uuid;
      itemsWithUuid++;
    }
  }

  if (itemsWithUuid === 0) {
    fail("no UUIDs found in checklist.md — run scripts/assign-uuids.js first");
  }
  if (itemsWithUuid !== items.length) {
    fail(
      `${items.length - itemsWithUuid} bullet(s) missing UUID comment; run scripts/assign-uuids.js`
    );
  }

  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  const inputProfiles = deepClone(fixture.bg3_profiles);

  const migrated = migrateSaveToUUIDs(deepClone(fixture), oldToNewMap);

  // --- Assertion 1: profile structure preserved ---
  const inputProfileNames = Object.keys(inputProfiles).sort();
  const outputProfileNames = Object.keys(migrated.bg3_profiles).sort();
  if (JSON.stringify(inputProfileNames) !== JSON.stringify(outputProfileNames)) {
    fail(
      "profile structure not preserved",
      `input: ${JSON.stringify(inputProfileNames)}\noutput: ${JSON.stringify(outputProfileNames)}`
    );
  }

  // --- Assertion 2 (KEY FORMAT): every preserved value lives under
  //     SAVE_KEY_PREFIX + UUID, not bare UUID and not legacy text-id ---
  let preservedCount = 0;
  let droppedOrphanCount = 0;

  for (const profileName of inputProfileNames) {
    const inputData = inputProfiles[profileName].checklistData || {};
    const outputData = (migrated.bg3_profiles[profileName] || {}).checklistData || {};

    for (const oldKey of Object.keys(inputData)) {
      const rawUuid = oldToNewMap[oldKey];
      const expectedNewKey = rawUuid ? SAVE_KEY_PREFIX + rawUuid : null;
      const inputValue = inputData[oldKey];

      if (expectedNewKey) {
        if (!Object.prototype.hasOwnProperty.call(outputData, expectedNewKey)) {
          fail(
            `[${profileName}] legacy key "${oldKey}" missing from output under expected "${expectedNewKey}"`
          );
        }
        if (outputData[expectedNewKey] !== inputValue) {
          fail(
            `[${profileName}] value not preserved for "${oldKey}" → "${expectedNewKey}": expected ${inputValue}, got ${outputData[expectedNewKey]}`
          );
        }
        preservedCount++;
      } else {
        if (Object.prototype.hasOwnProperty.call(outputData, oldKey)) {
          fail(
            `[${profileName}] orphan key "${oldKey}" was not dropped from output`
          );
        }
        droppedOrphanCount++;
      }
    }

    // Output should not retain ANY legacy-shaped or bare-UUID keys
    for (const newKey of Object.keys(outputData)) {
      if (!newKey.startsWith(SAVE_KEY_PREFIX)) {
        fail(
          `[${profileName}] output key "${newKey}" missing required "${SAVE_KEY_PREFIX}" prefix`
        );
      }
      const afterPrefix = newKey.slice(SAVE_KEY_PREFIX.length);
      const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(afterPrefix);
      if (!looksLikeUuid) {
        fail(
          `[${profileName}] output key "${newKey}" is not playthrough_<uuid>`
        );
      }
    }
  }

  // --- Assertion 3 (already covered by orphan checks above) ---

  // --- Assertion 4: schemaVersion === CURRENT_VERSION ---
  if (migrated.schemaVersion !== CURRENT_VERSION) {
    fail(
      `schemaVersion not set correctly: expected ${CURRENT_VERSION}, got ${migrated.schemaVersion}`
    );
  }

  // --- Assertion 5: every profile has hidePreferences ---
  for (const profileName of outputProfileNames) {
    const profile = migrated.bg3_profiles[profileName];
    if (!profile.hidePreferences || typeof profile.hidePreferences !== "object") {
      fail(`[${profileName}] hidePreferences missing or wrong type`);
    }
  }

  // --- Assertion 6: idempotency on second run ---
  const firstPassJson = JSON.stringify(migrated);
  const secondPass = migrateSaveToUUIDs(migrated, oldToNewMap);
  if (JSON.stringify(secondPass) !== firstPassJson) {
    fail("migration is not idempotent: second run produced different output");
  }
  if (secondPass !== migrated) {
    fail(
      "migration is not idempotent: second run returned a new object (must return input ===)"
    );
  }

  // --- Assertion 7: v1 buggy-state recovery ---
  // Synthesize a v1 envelope: schemaVersion: 1, keys are bare UUIDs.
  const sampleUuid = items.find((it) => it.uuid).uuid;
  const sampleUuid2 = items.filter((it) => it.uuid)[1].uuid;
  const v1State = {
    current: "Default Profile",
    bg3_profiles: {
      "Default Profile": {
        checklistData: { [sampleUuid]: true, [sampleUuid2]: false },
        hidePreferences: { hideRare: true },
      },
    },
    schemaVersion: 1,
  };
  const recovered = migrateSaveToUUIDs(v1State, oldToNewMap);
  const recoveredData = recovered.bg3_profiles["Default Profile"].checklistData;
  const expectedKey1 = SAVE_KEY_PREFIX + sampleUuid;
  const expectedKey2 = SAVE_KEY_PREFIX + sampleUuid2;
  if (recoveredData[expectedKey1] !== true) {
    fail(
      `v1 recovery: expected "${expectedKey1}"=true, got ${JSON.stringify(recoveredData)}`
    );
  }
  if (recoveredData[expectedKey2] !== false) {
    fail(
      `v1 recovery: expected "${expectedKey2}"=false, got ${JSON.stringify(recoveredData)}`
    );
  }
  if (recovered.schemaVersion !== CURRENT_VERSION) {
    fail(`v1 recovery: schemaVersion not bumped to ${CURRENT_VERSION}`);
  }
  if (recovered.bg3_profiles["Default Profile"].hidePreferences.hideRare !== true) {
    fail("v1 recovery: hidePreferences not preserved");
  }

  console.log("PASS: migration regression");
  console.log(
    `  profiles preserved: ${outputProfileNames.length} (${outputProfileNames.join(", ")})`
  );
  console.log(`  legacy keys preserved → playthrough_<uuid>: ${preservedCount}`);
  console.log(`  orphan keys dropped: ${droppedOrphanCount}`);
  console.log(`  schemaVersion: ${migrated.schemaVersion}`);
  console.log(
    `  hidePreferences initialized on all ${outputProfileNames.length} profile(s)`
  );
  console.log(`  idempotent on second run: yes`);
  console.log(`  v1 buggy-state recovery: works (bare UUID re-prefixed)`);
  process.exit(0);
}

main();
