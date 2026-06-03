/**
 * Storage migration: legacy text-derived save keys → stable UUID keys, in
 * the SAME format used by main.js for DOM `data-id` and checkbox `id`
 * (i.e., `playthrough_${UUID}`).
 *
 * Usable in two environments:
 *   - Browser via <script src="js/migrate.js"></script> — exposes
 *     window.bg3Migrate.migrateSaveToUUIDs.
 *   - Node via require('./migrate') — used by scripts/run-migration-test.js.
 *
 * Pure function. No DOM, no jStorage, no I/O. Caller is responsible for
 * loading the envelope with $.jStorage.get and persisting the result with
 * $.jStorage.set.
 *
 * Schema versions:
 *   v0 — pre-migration. Keys look like `playthrough_<sanitized text>` with
 *        an optional `_N` duplicate suffix.
 *   v1 — buggy intermediate (shipped briefly during initial Phase 1 dev).
 *        Keys look like a bare UUID (`558e97ff-...`). The bug was that
 *        main.js's data-id used `playthrough_${UUID}` so the lookup missed.
 *        v1 saves are recovered by re-prefixing keys with `playthrough_`.
 *   v2 — correct. Keys look like `playthrough_${UUID}` matching DOM data-id.
 *
 * Idempotency: if the input envelope's schemaVersion is >= CURRENT_VERSION,
 * the function returns it referentially unchanged.
 *
 * Orphan policy: keys with no oldToNewMap entry AND not in any UUID format
 * are dropped silently.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.bg3Migrate = factory();
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
  var CURRENT_VERSION = 2;
  var SAVE_KEY_PREFIX = "playthrough_";

  // Strict UUID 8-4-4-4-12 hex pattern (matches v1, v3, v4, v5)
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var PREFIXED_UUID_RE = /^playthrough_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function isBareUuid(key) {
    return UUID_RE.test(key);
  }

  function isPrefixedUuid(key) {
    return PREFIXED_UUID_RE.test(key);
  }

  /**
   * Translate a single checklistData key to its v2 equivalent.
   * Returns the new key, or null if the key is an orphan to be dropped.
   */
  function translateKey(oldKey, oldToNewMap) {
    if (isPrefixedUuid(oldKey)) {
      // Already correct v2 format — preserve as-is.
      return oldKey;
    }
    if (isBareUuid(oldKey)) {
      // v1 buggy state — re-prefix to match DOM data-id format.
      return SAVE_KEY_PREFIX + oldKey;
    }
    // v0 legacy text-derived id — translate via the parse-time map.
    var mapped = oldToNewMap[oldKey];
    if (typeof mapped === "string" && mapped.length > 0) {
      // Map values are bare UUIDs; add the prefix to match DOM data-id.
      // Defensive: if a caller already supplied the prefix, don't double-prefix.
      return mapped.indexOf(SAVE_KEY_PREFIX) === 0
        ? mapped
        : SAVE_KEY_PREFIX + mapped;
    }
    return null;
  }

  /**
   * @param {object} envelope The bg3_profiles envelope:
   *   { current, bg3_profiles, schemaVersion? }
   * @param {object} oldToNewMap Map from legacy "playthrough_<text>" key
   *   to its raw UUID (no prefix). Built by main.js during the parse pass.
   * @returns {object} Migrated envelope at schemaVersion === CURRENT_VERSION.
   *   Returns the input object unchanged (===) if already at current version.
   */
  function migrateSaveToUUIDs(envelope, oldToNewMap) {
    if (!envelope || typeof envelope !== "object") {
      return {
        current: "Default Profile",
        bg3_profiles: { "Default Profile": { checklistData: {}, hidePreferences: {} } },
        schemaVersion: CURRENT_VERSION,
      };
    }

    var existingVersion = (envelope.schemaVersion | 0) || 0;
    if (existingVersion >= CURRENT_VERSION) {
      return envelope;
    }

    var profilesByName = envelope.bg3_profiles || {};
    var migratedProfiles = {};

    Object.keys(profilesByName).forEach(function (profileName) {
      var profile = profilesByName[profileName] || {};
      var oldChecklistData = profile.checklistData || {};
      var newChecklistData = {};

      Object.keys(oldChecklistData).forEach(function (oldKey) {
        var value = oldChecklistData[oldKey];
        var newKey = translateKey(oldKey, oldToNewMap || {});
        if (newKey !== null) {
          newChecklistData[newKey] = value;
        }
        // null = orphan — drop silently per project policy
      });

      // Preserve everything else on the profile (custom fields if any),
      // overwrite checklistData, ensure hidePreferences exists.
      var migratedProfile = {};
      Object.keys(profile).forEach(function (k) {
        if (k === "checklistData" || k === "hidePreferences") return;
        migratedProfile[k] = profile[k];
      });
      migratedProfile.checklistData = newChecklistData;
      migratedProfile.hidePreferences = profile.hidePreferences && typeof profile.hidePreferences === "object"
        ? profile.hidePreferences
        : {};

      migratedProfiles[profileName] = migratedProfile;
    });

    var result = {};
    // Preserve other top-level fields (e.g. `current`)
    Object.keys(envelope).forEach(function (k) {
      if (k === "bg3_profiles" || k === "schemaVersion") return;
      result[k] = envelope[k];
    });
    result.bg3_profiles = migratedProfiles;
    result.schemaVersion = CURRENT_VERSION;

    if (typeof result.current !== "string" || !migratedProfiles[result.current]) {
      // Fall back to the first profile name if `current` is missing or stale
      var firstName = Object.keys(migratedProfiles)[0];
      if (firstName) result.current = firstName;
    }

    return result;
  }

  return {
    migrateSaveToUUIDs: migrateSaveToUUIDs,
    translateKey: translateKey,
    isBareUuid: isBareUuid,
    isPrefixedUuid: isPrefixedUuid,
    CURRENT_VERSION: CURRENT_VERSION,
    SAVE_KEY_PREFIX: SAVE_KEY_PREFIX,
  };
});
