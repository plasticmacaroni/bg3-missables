# Test fixtures and save-data regression tests

## Why this exists

User checklist progress is stored in browser localStorage under the jStorage
key `bg3_profiles`. The current item IDs are derived from the first 50
characters of bullet text — meaning **any rename to a bullet silently orphans
that user's check**.

To prevent users from losing days of progress when checklist.md changes, we
plan to migrate to stable UUIDs assigned per bullet (one-time migration, then
locked). The fixtures here are the canonical input for verifying that
migration — and any future migration — preserves user data.

## Files

- `fixtures/legacy-save-v0.json` — frozen save snapshot in pre-UUID format.
  Treat this file as immutable. Do not hand-edit. It represents what real
  users have in their browsers today.
- `fixtures/legacy-save-v0.manifest.json` — human-readable manifest of which
  items are in the fixture, which sections they came from, and which
  profiles checked them. For inspection only — the JSON is the source of
  truth.
- `../scripts/build-test-fixture.js` — generator script. Mirrors the ID
  derivation logic in `js/main.js`. Re-run only if the bullet-parsing logic
  in main.js changes BEFORE the UUID migration ships. After migration ships,
  this script becomes a historical artifact — leave it alone.

## The contract

Any future migration (whether to UUIDs or beyond) MUST satisfy the following
when fed `fixtures/legacy-save-v0.json` as input:

1. **Profile structure preserved** — both `Default Profile` and `Tav Tester`
   must still exist after migration, with their respective `checklistData`
   maps.
2. **Boolean values preserved** — every `true` value in the input must remain
   `true` in the output (under whatever the new key is). Same for `false`.
3. **Items still in checklist.md remain checked** — for any input key whose
   bullet text still exists in the current checklist.md, the migration must
   produce a new key that resolves to that same bullet, with the boolean
   carried over.
4. **Orphans dropped** — input keys whose bullet text no longer exists in
   checklist.md may be dropped silently. Output should not retain dead keys.
5. **Schema version bumped** — output should mark itself with a schema
   version so the migration is idempotent (running it twice does nothing on
   the second pass).

## Running the regression test (when migration ships)

The migration code does not exist yet. When it does, this section will fill
in with concrete commands. The expected shape is roughly:

```
node scripts/run-migration-test.js test/fixtures/legacy-save-v0.json
```

…which loads the fixture, runs the migration, and asserts contract items 1–5.

## Updating

**Don't.** This fixture represents user state from a known version of the
site. Editing it invalidates every assertion built on top.

If the site's bullet-parsing logic changes before UUID migration ships,
regenerate the fixture by running:

```
node scripts/build-test-fixture.js
```

After UUID migration ships, leave both the fixture and the script frozen.
