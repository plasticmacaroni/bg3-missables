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

  // Static aliases: legacy save keys produced by an EARLIER deployed version
  // whose broken parenthesized links left a stray ")" in the rendered text,
  // shifting the derived key (e.g. "Dog_Collar__C2__" with a trailing "_").
  // Those links were later fixed, which changes the parse-derived key — so we
  // map the historical keys onto the same UUIDs to guarantee no checkmark is
  // orphaned for users migrating from the pre-fix content. Lives here (not in
  // main.js) so both the browser and run-migration-test.js apply it. Values
  // are bare UUIDs; translateKey adds the SAVE_KEY_PREFIX.
  var LEGACY_KEY_ALIASES = {
    "playthrough_Githyanki_Greatsword__Psionic__": "46c491b8-6239-48b5-9300-2e55b70a820f",
    "playthrough_Paid_the_Price__-_accept_Auntie_Ethel_s_deal_to_re": "4eff1e74-df7b-4447-b9df-27e8a384333e",
    "playthrough_BOOOAL_s_Benediction__-_sacrifice_a_companion_to_B": "61b61926-558b-4114-8d7f-6259b1b05d82",
    "playthrough_Drow_Studded_Leather_Armour__R1__": "6558a71a-7ca5-4c32-87d2-d03d0dbdb9a0",
    "playthrough_Dog_Collar__C2__": "0a1d5437-10f1-4f5c-b7dd-99510a24b5bd",
    "playthrough_Sentient_Amulet__R1__": "ed97252d-fcaf-44a0-90df-936b999c6436",
    "playthrough_Mind_Flayer_Parasite_Specimen_-_from_Malik__when_k": "4b7d6974-b511-4926-8cff-ea0412c6bf56",
    "playthrough_Artificial_Leech__U1__": "4e95eb6c-e1ac-444f-8f1a-03e0aca27f05",
    "playthrough_Bonesaw__U1__": "9d36a249-823f-4c9e-a65c-30ce95fd0939",
    "playthrough_Syringe__U1__": "61a0fd08-25a1-4280-a6d2-84894e949f39",
    "playthrough_Trepan__U1__": "14476ec2-17a9-4660-8fc1-4f2ba2c3ad9a",
    "playthrough_Bonesaw__C1__": "c655ceb6-4c90-403f-8954-d712aafe1418",
    "playthrough_Syringe__C1__": "252bafc2-35d5-4134-8d27-081b859e6e7b",
    "playthrough_Trepan__C1__": "1612a669-bd56-40fc-ab6b-3ccd5c310e5e",
    "playthrough_Dark_Justiciar_Gauntlets__R1__": "cac6bb38-65d9-4b46-9c75-58d002028a07",
    "playthrough_Dark_Justiciar_Half-Plate__R1__": "82bce5ad-e927-498d-a43d-bb5bfd02c5cf",
    "playthrough_Dark_Justiciar_Gauntlets__U1__": "7675adef-17bd-4b39-9c03-6d698ced6714",
    "playthrough_Shortsword__Yurgir__": "14408a59-8a81-432b-969a-747a8c1dde17",
    "playthrough_Dark_Justiciar_Half-Plate__VR1__": "f4bc02a9-acb2-45b5-97e2-f5c68fce1b8f",
    "playthrough_Sweet_Stone_Features__-_pay_Boney_5000_gold_to_hav": "34ddc36a-783f-4df6-bc2c-50960ae37bd2",
    "playthrough_Eternal_Carafe_of_Wine__Or_Sometimes_Acid__": "775d707f-6d29-4e8e-b40d-7ab44a40369f",
    "playthrough_If_you_obtained_a_funny_amulet__in_Act_1__visit_th": "a7b5b5ed-7f6b-4a0c-8543-d0d078453a4a",
    "playthrough_Sentient_Amulet__Very_Rare__": "a75b08b3-340f-459c-9492-9fb8afdd64bc",
    "playthrough_Counting_House_Safe_n_2_Key_": "6059c6e9-02d6-4e50-9daa-a3a0ed4f7017",
    "playthrough_Shield__VR1__": "d55394ab-f9eb-4203-8a9b-ab4238f17783",
    "playthrough_Salty_Scimitar_rrr__": "a2a542c6-3e0b-4e68-8d2a-07e77d115a8f",
    "playthrough_Artificial_Leech__C1__": "dd27457d-a3ef-4f65-8f9f-533aba5dc744",
    "playthrough_Greatclub__C1__": "9b9a1ce6-173f-46e6-87fa-a47a972283ff",
  };

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

    // Seed historical broken-link aliases beneath the parse-derived map, so a
    // current bullet's clean key always wins on collision while pre-fix keys
    // still resolve to the right UUID.
    var effectiveMap = {};
    Object.keys(LEGACY_KEY_ALIASES).forEach(function (k) {
      effectiveMap[k] = LEGACY_KEY_ALIASES[k];
    });
    Object.keys(oldToNewMap || {}).forEach(function (k) {
      effectiveMap[k] = oldToNewMap[k];
    });

    Object.keys(profilesByName).forEach(function (profileName) {
      var profile = profilesByName[profileName] || {};
      var oldChecklistData = profile.checklistData || {};
      var newChecklistData = {};

      Object.keys(oldChecklistData).forEach(function (oldKey) {
        var value = oldChecklistData[oldKey];
        var newKey = translateKey(oldKey, effectiveMap);
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
    LEGACY_KEY_ALIASES: LEGACY_KEY_ALIASES,
  };
});
