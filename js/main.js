var profilesKey = 'bg3_profiles';
var FILTER_CLASSES = ["hide_ordinary", "hide_common", "hide_uncommon", "hide_rare", "hide_very_rare", "hide_legendary", "hide_story"];

// The 8 hide-toggle inputs and their corresponding hidePreferences keys.
// Module-scope so it's initialized before any ready-callback can run
// (jQuery 1.x fires already-ready callbacks synchronously, so anything
// referenced inside the ready block must be initialized first).
var HIDE_TOGGLES = [
  { id: "toggleHideCompleted",  prefKey: "hideCompleted"  },
  { id: "toggleHideOrdinary",   prefKey: "hideOrdinary"   },
  { id: "toggleHideCommon",     prefKey: "hideCommon"     },
  { id: "toggleHideUncommon",   prefKey: "hideUncommon"   },
  { id: "toggleHideRare",       prefKey: "hideRare"       },
  { id: "toggleHideVeryRare",   prefKey: "hideVeryRare"   },
  { id: "toggleHideLegendary",  prefKey: "hideLegendary"  },
  { id: "toggleHideStory",      prefKey: "hideStory"      },
];

function sanitize(s) {
  return s
    .split("")
    .map((char) => {
      // Regex tests for valid id characters
      return /^[A-Za-z0-9\-_]$/.test(char) ? char : "_";
    })
    .join("");
}

// Map from legacy text-derived save key (e.g. "playthrough_Foo_bar") to the
// stable UUID we now use as the canonical key. Populated during the
// generateTasks parse pass; consumed by bg3Migrate.migrateSaveToUUIDs
// before the profile checkboxes are wired up.
var oldToNewMap = {};

function generateTasks() {
  let markdownString = "none";
  // Reset the migration map on every (re)generation
  oldToNewMap = {};

  // Fetch the markdown content from checklist.md
  fetch("checklist.md")
    .then((response) => {
      // If fetching the markdown file was unsuccessful, throw an error
      if (!response.ok) {
        throw new Error(
          "Network response was not ok:",
          "/checklist.md",
          response
        );
      }
      return response.text(); // Return the content of the file as a string
    })
    .then((markdown) => {
      markdownString = markdown;
      const lines = markdownString.split("\n");
      let htmlOutput = "";
      // Tracks how many times each legacy baseId has been seen so we can
      // append the _N suffix in the SAME order the pre-UUID main.js did.
      // Required for the migration map to match real user save keys.
      const legacyCount = {};

      for (let i = 0; i < lines.length; i++) {
        // Remove leading and trailing spaces from the line
        let line = lines[i] ? lines[i].trim() : "";

        // Skip empty lines
        if (line === "") {
          continue;
        }

        // Calculate indentation level; 1 tab or 2 spaces equals 1 level
        const level = lines[i].match(/^(?:\t| {2})*/)[0].length;

        // Check if the line starts with '# ' indicating a header
        if (line.startsWith("# ")) {
          const headerText = line.substr(2);
          const idText = sanitize(headerText);
          htmlOutput += `</ul><h3 id="${idText}"><a href="#" data-bs-toggle="collapse" class="btn btn-primary btn-collapse btn-sm"></a>${headerText}</h3>\n`;
          htmlOutput += '<ul class="panel-collapse collapse show">\n';
        }
        // Check if the line starts with '- ' indicating a list item (main or sub-bullet based on indentation)
        else if (line.startsWith("- ") || /^(\t| {2})+\- /.test(lines[i])) {
          // Extract the text after '- ' and trim any leading/trailing spaces
          let listItemText = line.substr(2).trim();

          // Pull the inline `<!--uuid:UUID-->` annotation off the bullet
          // BEFORE any other text processing. Stripping it here keeps the
          // legacy text-id derivation byte-for-byte stable so the
          // legacy-save-v0 fixture continues to match real user saves.
          const uuidCommentRe = /\s*<!--uuid:([0-9a-fA-F-]+)-->\s*/;
          const uuidMatch = listItemText.match(uuidCommentRe);
          const itemUuid = uuidMatch ? uuidMatch[1] : null;
          if (itemUuid) {
            listItemText = listItemText.replace(uuidCommentRe, "").replace(/\s+$/, "");
          }

          // If there's no icon, default to ::task::
          if (!listItemText.includes("::")) {
            listItemText = "::task::" + listItemText;
          }

          // Replace ::missable:: with a clock icon, ::item:: with the gem icon, ::ability:: with mortarboard icon, and ::task::, if present or added above
          listItemText = listItemText.replace(
            /::missable::\s*/g,
            '<i class="bi bi-stopwatch text-danger"></i>'
          );
          listItemText = listItemText.replace(
            /::item::\s*/g,
            '<i class="bi bi-gem"></i>'
          );
          listItemText = listItemText.replace(
            /::item_ordinary::\s*/g,
            '<i class="bi bi-patch-minus"></i>'
          );
          listItemText = listItemText.replace(
            /::item_common::\s*/g,
            '<i class="bi bi-gem"></i>'
          );
          listItemText = listItemText.replace(
            /::item_uncommon::\s*/g,
            '<i class="bi bi-gem text-success"></i>'
          );
          listItemText = listItemText.replace(
            /::item_rare::\s*/g,
            '<i class="bi bi-gem text-primary"></i>'
          );
          listItemText = listItemText.replace(
            /::item_veryrare::\s*/g,
            '<i class="bi bi-gem text-danger"></i>'
          );
          listItemText = listItemText.replace(
            /::item_legendary::\s*/g,
            '<i class="bi bi-gem text-warning"></i>'
          );
          listItemText = listItemText.replace(
            /::item_story::\s*/g,
            '<i class="bi bi-book text-danger"></i>'
          );
          listItemText = listItemText.replace(
            /::ability::\s*/g,
            '<i class="bi bi-mortarboard"></i>'
          );
          listItemText = listItemText.replace(
            /::task::\s*/g,
            '<i class="bi bi-clipboard-check"></i>'
          );

          // Convert markdown-style links to HTML links
          const linkPattern = /\[(.*?)\]\((.*?)\)/g;
          listItemText = listItemText.replace(
            linkPattern,
            '<a href="$2" target="_blank">$1</a>'
          );

          // Derive the legacy text-id (sanitize+slice50 of the rendered text
          // sans HTML). This was the data-id format used pre-UUID and is the
          // key real users have in their browser saves.
          const listItemTextWithoutTags = listItemText.replace(
            /(<([^>]+)>)/gi,
            ""
          );
          const legacyBaseId = sanitize(listItemTextWithoutTags.slice(0, 50));

          // Apply the same _N duplicate-suffix walk the pre-UUID code did, so
          // legacyId mirrors what real saves contain.
          const dupN = legacyCount[legacyBaseId] || 0;
          const legacyFullId =
            dupN === 0
              ? `playthrough_${legacyBaseId}`
              : `playthrough_${legacyBaseId}_${dupN}`;
          legacyCount[legacyBaseId] = dupN + 1;

          // Record old→new mapping for the migration step. The map value is
          // the BARE uuid (no prefix); migrate.js adds the SAVE_KEY_PREFIX
          // ("playthrough_") so the output key matches DOM data-id format.
          if (itemUuid) {
            oldToNewMap[legacyFullId] = itemUuid;
          }

          // Use UUID-based data-id when available; fall back to the legacy
          // form during the brief transition window before assign-uuids runs.
          // data-id is the source of truth that addCheckbox / click handlers
          // index by, so the migrated checklistData keys MUST match this.
          const dataId = itemUuid
            ? `playthrough_${itemUuid}`
            : legacyFullId;

          // If the bullet is a top-level bullet (i.e., not indented)
          if (level === 0) {
            htmlOutput += `<li data-id="${dataId}">${listItemText}\n`;
          }
          // If the bullet is an indented sub-bullet
          else {
            // If the previous line was not a sub-bullet, begin a new nested list
            if (i === 0 || /^(\t| {2})+\- /.test(lines[i - 1]) === false) {
              htmlOutput += `<ul class="panel-collapse collapse show">\n`;
            }

            // Append the sub-bullet to the output
            htmlOutput += `<li data-id="${dataId}">${listItemText}</li>\n`;

            // If the next line is not a sub-bullet, end the nested list
            if (
              i === lines.length - 1 ||
              /^(\t| {2})+\- /.test(lines[i + 1]) === false
            ) {
              htmlOutput += `</ul>\n`;
            }
          }
        }
      }

      // If the last line of the output is a list item, close the list
      if (htmlOutput.endsWith("</li>\n")) {
        htmlOutput += "</ul>\n";
      }

      // Get the container for the converted content and update its innerHTML
      const playthroughDiv = document.getElementById("tabPlaythrough");
      if (playthroughDiv) {
        playthroughDiv.innerHTML += htmlOutput;
      }
    })
    // Find any task (li) UUIDs that are duplicated, and asynchronously append the number of times they appear above themselves (so the second instance would have a 1, and the third instance would have a 2, etc.)
    // This should be deterministic, so the same UUIDs should always have the same number appended
    .then(() => {
      // Get all li elements with a data-id attribute
      let listItems = document.querySelectorAll("li[data-id]");

      // Create an array of all the li elements with data-ids, even if their UUIDs and therefore their data-ids are the same
      let listItemsArray = [];
      listItems.forEach((listItem) => {
        listItemsArray.push(listItem);
      });

      // Create a copy of this array, that won't update with the DOM
      let shadowArray = listItemsArray.slice();

      // For each li element, find the number of occurrences of its UUID above it in the shadow array, and append that number to the end of its data-id in the DOM, going from top to bottom (so the first entry would have nothing, the second would have "_1" appended, and so on, moving down the page)
      // Only count instances above each li element, so if there are multiple instances of the same UUID below it, they won't be counted
      listItemsArray.forEach((listItem) => {
        // Get the UUID from the data-id attribute
        let uuid = listItem.getAttribute("data-id").replace("playthrough_", "");

        // Get the index of the current li element in the shadow array
        let index = shadowArray.indexOf(listItem);

        // Get the number of occurrences of the UUID above the current li element in the shadow array
        let occurrences = shadowArray.slice(0, index).filter((item) => {
          return item.getAttribute("data-id").includes(uuid);
        }).length;

        // If there are any occurrences, append the number of occurrences to the end of the data-id
        if (occurrences > 0) {
          listItem.setAttribute(
            "data-id",
            listItem.getAttribute("data-id") + "_" + occurrences
          );
        }
      });
    })
    // Migrate any pre-UUID saves to UUID keys before the profile layer
    // reads checklistData. This MUST run after the parse pass populates
    // oldToNewMap and BEFORE initializeProfileFunctionality wires up
    // checkboxes from the saved state.
    .then(() => {
      if (typeof bg3Migrate === "undefined" || !bg3Migrate.migrateSaveToUUIDs) {
        return;
      }
      const envelope = $.jStorage.get(profilesKey);
      const migrated = bg3Migrate.migrateSaveToUUIDs(envelope, oldToNewMap);

      // Cleanup: strip any keys in checklistData that don't start with
      // "playthrough_". A pre-fix bug where the click handler bound to
      // ALL checkboxes (including the 8 hide toggles) wrote toggle IDs
      // like "toggleHideCommon" into profile.checklistData. Idempotent —
      // does nothing on profiles that were never polluted.
      let cleanedAny = false;
      if (migrated && migrated.bg3_profiles) {
        Object.keys(migrated.bg3_profiles).forEach((name) => {
          const p = migrated.bg3_profiles[name];
          if (!p || !p.checklistData) return;
          Object.keys(p.checklistData).forEach((k) => {
            if (typeof k !== "string" || k.indexOf("playthrough_") !== 0) {
              delete p.checklistData[k];
              cleanedAny = true;
            }
          });
        });
      }

      if (migrated !== envelope || cleanedAny) {
        $.jStorage.set(profilesKey, migrated);
      }
    })
    // Run the following additional functions after the markdown is converted
    .then(() => {
      createTableOfContents();
    })
    .then(() => {
      setUlIdAndSpanIdFromH3();
    })
    .then(() => {
      initializeProfileFunctionality($);
    })
    // If there was any error during processing, log it to the console
    .catch((error) => {
      console.error("There was a problem:", error.message);
      console.trace();
    });

}

// If hide completed is checked, hide the headers with no subtasks remaining
function watchEmptyHeaders() {
  // If an h3's span has a class of in_progress, show the header
  $("h3 > span.in_progress").each(function () {
    $(this).parent().show();
  });
  // if hide completed is not checked, unhide all and return
  if (!$("body").hasClass("hide_completed")) {
    $("h3 > span.done").each(function () {
      $(this).parent().show();
    });
    return;
  }
  // If an h3's span has a class of done, hide the header
  $("h3 > span.done").each(function () {
    $(this).parent().hide();
  });
}

function setUlIdAndSpanIdFromH3() {
  // Get all h3 elements with an ID
  let headings = document.querySelectorAll("h3[id]");
  let counter = 1; // Initialize the counter

  headings.forEach((heading) => {
    // For setting the ul's id
    let ul = heading.nextElementSibling;
    if (ul && ul.tagName === "UL") {
      let newId = heading.id + "_col";
      ul.id = newId;

      let aTag = heading.querySelector('a[data-bs-toggle="collapse"]');
      if (aTag) {
        aTag.setAttribute("href", `#${newId}`);
      }
    }

    // Automatically create and append the span to the h3
    let span = document.createElement("span");
    span.id = "playthrough_totals_" + counter;
    heading.appendChild(span);

    counter++; // Increment the counter for the next span
  });
}

function initializeProfileFunctionality($) {
  var defaultProfiles = {
    current: "Default Profile",
  };
  defaultProfiles[profilesKey] = {
    "Default Profile": {
      checklistData: {},
    },
  };
  var profiles = $.jStorage.get(profilesKey, defaultProfiles);

  jQuery(document).ready(function ($) {
    // TODO Find a better way to do this in one pass
    $("ul li[data-id]").each(function () {
      addCheckbox(this);
    });

    populateProfiles();

    // Scoped to playthrough_* so the 8 hide-toggle checkboxes don't leak
    // their IDs into profile.checklistData (pre-existing bug pre-this-fix).
    $('input[type="checkbox"][id^="playthrough_"]').click(function () {
      var id = $(this).attr("id");
      var isChecked = (profiles[profilesKey][profiles.current].checklistData[
        id
      ] = $(this).prop("checked"));
      //_gaq.push(['_trackEvent', 'Checkbox', (isChecked ? 'Check' : 'Uncheck'), id]);
      if (isChecked === true) {
        $('[data-id="' + id + '"] label').addClass("completed");
      } else {
        $('[data-id="' + id + '"] label').removeClass("completed");
      }
      $(this)
        .parent()
        .parent()
        .find('li > label > input[type="checkbox"][id^="playthrough_"]')
        .each(function () {
          var id = $(this).attr("id");
          profiles[profilesKey][profiles.current].checklistData[id] = isChecked;
          $(this).prop("checked", isChecked);
        });
      $.jStorage.set(profilesKey, profiles);
      calculateTotals();
    });

    $("#profiles").change(function (event) {
      profiles.current = $(this).val();
      $.jStorage.set(profilesKey, profiles);
      populateChecklists();
      applyHidePreferences();
      //_gaq.push(['_trackEvent', 'Profile', 'Change', profiles.current]);
    });

    function getProfileModal() {
      return bootstrap.Modal.getOrCreateInstance(document.getElementById("profileModal"));
    }

    $("#profileAdd").click(function () {
      $("#profileModalTitle").html("Add Profile");
      $("#profileModalName").val("");
      $("#profileModalAdd").show();
      $("#profileModalUpdate").hide();
      $("#profileModalDelete").hide();
      getProfileModal().show();
      //_gaq.push(['_trackEvent', 'Profile', 'Add']);
    });

    $("#profileEdit").click(function () {
      $("#profileModalTitle").html("Edit Profile");
      $("#profileModalName").val(profiles.current);
      $("#profileModalAdd").hide();
      $("#profileModalUpdate").show();
      if (canDelete()) {
        $("#profileModalDelete").show();
      } else {
        $("#profileModalDelete").hide();
      }
      getProfileModal().show();
      //_gaq.push(['_trackEvent', 'Profile', 'Edit', profiles.current]);
    });

    $("#profileModalAdd").click(function (event) {
      event.preventDefault();
      var profile = $.trim($("#profileModalName").val());
      if (profile.length > 0) {
        if (typeof profiles[profilesKey][profile] == "undefined") {
          profiles[profilesKey][profile] = {
            checklistData: {},
            hidePreferences: {},
          };
        }
        profiles.current = profile;
        $.jStorage.set(profilesKey, profiles);
        populateProfiles();
        populateChecklists();
        applyHidePreferences();
      }
      //_gaq.push(['_trackEvent', 'Profile', 'Create', profile]);
    });

    $("#profileModalUpdate").click(function (event) {
      event.preventDefault();
      var newName = $.trim($("#profileModalName").val());
      if (newName.length > 0 && newName != profiles.current) {
        profiles[profilesKey][newName] =
          profiles[profilesKey][profiles.current];
        delete profiles[profilesKey][profiles.current];
        profiles.current = newName;
        $.jStorage.set(profilesKey, profiles);
        populateProfiles();
      }
      getProfileModal().hide();
      //_gaq.push(['_trackEvent', 'Profile', 'Update', profile]);
    });

    $("#profileModalDelete").click(function (event) {
      event.preventDefault();
      if (!canDelete()) {
        return;
      }
      if (!confirm("Are you sure?")) {
        return;
      }
      delete profiles[profilesKey][profiles.current];
      profiles.current = getFirstProfile();
      $.jStorage.set(profilesKey, profiles);
      populateProfiles();
      populateChecklists();
      getProfileModal().hide();
      //_gaq.push(['_trackEvent', 'Profile', 'Delete']);
    });
    // Hide completed items (from <input type="checkbox" id="toggleHideCompleted">)
    // Define a configuration for each toggle action
    const toggleConfig = [
      {
        id: "toggleHideCompleted",
        action: function() {
          var shouldHide = $(this).is(":checked");
          $("body").toggleClass("hide_completed", shouldHide);
          watchEmptyHeaders();
          saveHidePreferences();
        }
      },
      {
        id: "toggleHideOrdinary",
        classes: ["bi", "bi-patch-minus"],
        toggleTask: "hide_ordinary",
      },
      {
        id: "toggleHideCommon",
        classes: ["bi", "bi-gem"],
        toggleTask: "hide_common",
      },
      {
        id: "toggleHideUncommon",
        classes: ["bi", "bi-gem", "text-success"],
        toggleTask: "hide_uncommon",
      },
      {
        id: "toggleHideRare",
        classes: ["bi", "bi-gem", "text-primary"],
        toggleTask: "hide_rare",
      },
      {
        id: "toggleHideVeryRare",
        classes: ["bi", "bi-gem", "text-danger"],
        toggleTask: "hide_very_rare",
      },
      {
        id: "toggleHideLegendary",
        classes: ["bi", "bi-gem", "text-warning"],
        toggleTask: "hide_legendary",
      },
      {
        id: "toggleHideStory",
        classes: ["bi", "bi-book", "text-danger"],
        toggleTask: "hide_story",
      }
    ];

    // Function to check if the element matches the specified classes and only those classes (see classes.length)
    function matchesClasses($element, classes) {
      return classes.every(c => $element.hasClass(c)) && $element.attr("class").split(" ").length === classes.length;
    }

    // Generic function to apply toggle logic based on configuration.
    // The class-based branch uses toggleClass(class, force) — idempotent
    // force-set based on checkbox state — so applyHidePreferences can
    // call .change() to re-apply saved state without flipping classes the
    // wrong way.
    function applyToggle(config) {
      $(`#${config.id}`).change(function() {
        if (config.action) {
          // Custom action for special cases
          config.action.call(this);
        } else {
          // Default action for class-based toggling
          var shouldHide = $(this).is(":checked");
          $("li").each(function() {
            // find the child div label span i
            // TODO this feels hacky, but it works for now
            var $icon = $(this).find("div").first().find("label").first().find("span").first().find("i");

            // var $icon = $(this).find("i");
            if (matchesClasses($icon, config.classes)) {
              //find the parent label, toggle the class
              $($icon).closest("label").toggleClass(config.toggleTask, shouldHide);
            }
          });
          calculateTotals();
          saveHidePreferences();
        }
      });
      calculateTotals();
    }

    // Initialize all toggles based on the configuration
    toggleConfig.forEach(config => applyToggle(config));

    // Apply the active profile's saved hide preferences AFTER toggle
    // handlers are registered. This sets checkbox states + DOM classes
    // to match what the user last selected on this profile.
    applyHidePreferences();

    // Export — write a JSON file with the full envelope. Round-trip safe:
    // reimporting the file produces the same in-memory state. The
    // `bg3_last_reminder` key (when added in FIX-08) is intentionally NOT
    // included; it tracks per-device reminder cadence and shouldn't migrate.
    $("#exportSave").click(function () {
      var envelope = $.jStorage.get(profilesKey) || {};
      var exportObj = {
        schemaVersion: typeof envelope.schemaVersion === "number" ? envelope.schemaVersion : 0,
        current: envelope.current || null,
        bg3_profiles: envelope.bg3_profiles || {},
        exportedAt: new Date().toISOString(),
      };
      var json = JSON.stringify(exportObj, null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      var a = document.createElement("a");
      a.href = url;
      a.download = "bg3-checklist-backup-" + stamp + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revocation a tick so the download actually fires in some browsers.
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    });

    // Import — replace local state with a backup. Validates structure,
    // confirms with user, then hands off to jStorage and reloads. Migration
    // runs on the reloaded page (v0/v1 saves migrate to v2 automatically).
    // The file input is reset so the same file can be re-imported.
    $("#importSave").click(function () {
      $("#importFileInput").val("");
      $("#importFileInput").trigger("click");
    });

    $("#importFileInput").on("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (loadEvent) {
        var text = String(loadEvent.target.result || "");
        var data;
        try {
          data = JSON.parse(text);
        } catch (err) {
          alert("Import failed: file is not valid JSON.\n\n" + err.message);
          return;
        }
        if (!data || typeof data !== "object" || !data.bg3_profiles || typeof data.bg3_profiles !== "object") {
          alert("Import failed: file does not look like a checklist backup (missing `bg3_profiles` object).");
          return;
        }
        var importedProfileNames = Object.keys(data.bg3_profiles);
        if (importedProfileNames.length === 0) {
          alert("Import failed: backup contains no profiles.");
          return;
        }

        // Bring imported data up to current schema BEFORE merging, so its
        // checklist keys align with the existing live state's UUID-prefixed
        // keys. Imports of v0 legacy or v1 buggy saves migrate here; v2
        // imports are returned untouched (idempotent).
        var importedEnvelope = {
          current: typeof data.current === "string" ? data.current : importedProfileNames[0],
          bg3_profiles: data.bg3_profiles,
          schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 0,
        };
        var migratedImport = bg3Migrate.migrateSaveToUUIDs(importedEnvelope, oldToNewMap);

        // Read existing state. By the time the import button is clickable,
        // the page-load migration has already brought existing state to v2.
        var existing = $.jStorage.get(profilesKey) || {
          current: null,
          bg3_profiles: {},
          schemaVersion: bg3Migrate.CURRENT_VERSION,
        };
        var existingProfiles = existing.bg3_profiles || {};

        // MERGE — never replace. Imported profile names that collide with
        // existing profile names are renamed with a numeric suffix
        // ("Foo" → "Foo (2)"). Existing profiles are NEVER overwritten.
        var mergedProfiles = {};
        Object.keys(existingProfiles).forEach(function (name) {
          mergedProfiles[name] = existingProfiles[name];
        });
        var added = [];
        var renamed = [];
        Object.keys(migratedImport.bg3_profiles).forEach(function (name) {
          var finalName = name;
          if (Object.prototype.hasOwnProperty.call(existingProfiles, name)) {
            var n = 2;
            while (Object.prototype.hasOwnProperty.call(mergedProfiles, name + " (" + n + ")")) n++;
            finalName = name + " (" + n + ")";
            renamed.push({ from: name, to: finalName });
          } else {
            added.push(name);
          }
          mergedProfiles[finalName] = migratedImport.bg3_profiles[name];
        });

        // Confirm summary — emphasize that existing profiles are preserved.
        var msgLines = ["Import will MERGE into your existing profiles:"];
        if (added.length > 0) {
          msgLines.push("");
          msgLines.push("  Add " + added.length + " new profile(s):");
          added.forEach(function (n) { msgLines.push("    + " + n); });
        }
        if (renamed.length > 0) {
          msgLines.push("");
          msgLines.push("  Rename to avoid collisions with existing profiles:");
          renamed.forEach(function (r) {
            msgLines.push("    \"" + r.from + "\" -> \"" + r.to + "\"");
          });
        }
        msgLines.push("");
        msgLines.push("Your existing " + Object.keys(existingProfiles).length +
          " profile(s) will be preserved. To remove unwanted profiles, use the Edit / Delete dialog after import.");
        msgLines.push("");
        msgLines.push("Continue?");
        if (!confirm(msgLines.join("\n"))) return;

        // Keep currently-selected profile if it still exists; otherwise pick
        // the first available. Existing > newly-added priority.
        var newCurrent = existing.current && Object.prototype.hasOwnProperty.call(mergedProfiles, existing.current)
          ? existing.current
          : Object.keys(mergedProfiles)[0];

        var envelope = {
          current: newCurrent,
          bg3_profiles: mergedProfiles,
          schemaVersion: bg3Migrate.CURRENT_VERSION,
        };

        try {
          $.jStorage.set(profilesKey, envelope);
        } catch (err) {
          alert("Import failed: could not write to local storage.\n\n" + err.message);
          return;
        }
        location.reload();
      };
      reader.onerror = function () {
        alert("Import failed: could not read the file.");
      };
      reader.readAsText(file);
    });

    $("#toggleCollapseAll").change(function () {
      var checked = $(this).is(":checked");
      document.querySelectorAll(".panel-collapse").forEach(function (el) {
        var inst = bootstrap.Collapse.getOrCreateInstance(el, { toggle: false });
        if (checked) {
          inst.hide();
        } else {
          inst.show();
        }
      });
      $("body").toggleClass("collapse_all", checked);
    });

    $("#profileModalName").on("keydown", function (e) {
      if (e.key !== "Enter" && e.keyCode !== 13) return;
      e.preventDefault();
      var btn = $("#profileModalAdd").is(":visible") ? document.getElementById("profileModalAdd")
              : $("#profileModalUpdate").is(":visible") ? document.getElementById("profileModalUpdate")
              : null;
      if (btn) btn.click();
    });

    $(".table_of_contents").on("click", "a", function () {
      var href = $(this).attr("href") || "";
      if (!href.startsWith("#")) return;
      var target = document.getElementById(href.slice(1));
      if (!target) return;
      var $panel = $(target).next(".panel-collapse");
      if ($panel.length && !$panel.hasClass("show")) {
        bootstrap.Collapse.getOrCreateInstance($panel[0], { toggle: false }).show();
      }
    });

    $("[data-item-toggle]").change(function () {
      var type = $(this).data("item-toggle");
      var to_hide = $(this).is(":checked");

      calculateTotals();
    });

    calculateTotals();
  });

  function populateProfiles() {
    $("#profiles").empty();
    $.each(profiles[profilesKey], function (index, value) {
      $("#profiles").append(
        $("<option></option>").attr("value", index).text(index)
      );
    });
    $("#profiles").val(profiles.current);
  }

  function populateChecklists() {
    // Only un-check the actual checklist items, NOT the hide-toggle
    // checkboxes. Hide toggles are managed separately by
    // applyHidePreferences via the per-profile hidePreferences object.
    $('input[type="checkbox"][id^="playthrough_"]').prop("checked", false);
    $.each(
      profiles[profilesKey][profiles.current].checklistData,
      function (index, value) {
        // Defensive: skip any non-playthrough keys that might still be in
        // legacy polluted profiles before the cleanup step runs.
        if (typeof index !== "string" || index.indexOf("playthrough_") !== 0) {
          return;
        }
        $("#" + index).prop("checked", value);
      }
    );
    calculateTotals();
  }

  // Persist the current toggle UI state to the active profile's
  // hidePreferences. Called from every toggle's change handler.
  // (HIDE_TOGGLES is declared at module scope above so it's available
  // even when jQuery fires the ready callback synchronously.)
  function saveHidePreferences() {
    var prof = profiles[profilesKey][profiles.current];
    if (!prof) return;
    var prefs = {};
    HIDE_TOGGLES.forEach(function (t) {
      prefs[t.prefKey] = $("#" + t.id).is(":checked");
    });
    prof.hidePreferences = prefs;
    $.jStorage.set(profilesKey, profiles);
  }

  // Read the active profile's saved hide preferences and apply them to
  // the toggle UI + DOM. Triggers .change() on each toggle so the
  // existing change handler does the actual class manipulation — that
  // handler also calls saveHidePreferences, which is idempotent (writes
  // back the same state we just loaded).
  function applyHidePreferences() {
    var prof = profiles[profilesKey][profiles.current];
    if (!prof) return;
    var prefs = prof.hidePreferences || {};
    HIDE_TOGGLES.forEach(function (t) {
      var $cb = $("#" + t.id);
      if ($cb.length === 0) return;
      var desired = !!prefs[t.prefKey];
      var current = $cb.is(":checked");
      $cb.prop("checked", desired);
      // Always trigger change so DOM classes / body class / counters update
      // even when the desired==current (e.g., on first load with empty prefs
      // the change handler still needs to run to put state in a known shape).
      $cb.trigger("change");
    });
  }

  function calculateTotals() {
    //For both "Playthrough" and "Checklist" totals
    $('[id$="_overall_total"]').each(function (index, element1) {
      var type = this.id.match(/(.*)_overall_total/)[1];
      var overallCount = 0,
        overallChecked = 0;
      //For type=playthrough and type=checklist and type=nav
      $('[id^="' + type + '_totals_"]').each(function (index, element2) {
        var totalNumber = new RegExp(type + "_totals_(.*)");
        var regexFilter = new RegExp("^playthrough_(.*)");
        var i = parseInt(this.id.match(totalNumber)[1]);
        var count = 0,
          checkedAndHidden = 0;

        //get top level section of each total header/label, and find the sibling section that has the 'li' elements
        $(element2)
          .parent()
          .next()
          .find("> li")
          .each(function (index, checkbox) {
            checkbox = $(checkbox);
            var $lbl = checkbox.find("label");
            var hiddenByFilter = FILTER_CLASSES.some(function (c) {
              return $lbl.hasClass(c);
            });
            if (hiddenByFilter) {
              return true;
            }
            count++;
            overallCount++;
            if (checkbox.find("input").prop("checked")) {
              checkedAndHidden++;
              overallChecked++;
            }
          });
        var navSpan = $("#" + type + "_nav_totals_" + i)[0];
        if (count === 0) {
          // Section is empty under the active filters — not "DONE", just
          // nothing left to count. Render a neutral marker and leave the
          // header in neither done nor in_progress state.
          if (typeof navSpan === "undefined") return;
          this.innerHTML = navSpan.innerHTML = "—";
          $(this).removeClass("in_progress").removeClass("done");
          $(navSpan).removeClass("in_progress").removeClass("done");
        } else if (checkedAndHidden === count) {
          if (typeof navSpan === "undefined") return;
          this.innerHTML = navSpan.innerHTML = "DONE";
          $(this).removeClass("in_progress").addClass("done");
          $(navSpan).removeClass("in_progress").addClass("done");
        } else {
          this.innerHTML = navSpan.innerHTML = checkedAndHidden + "/" + count;
          $(this).removeClass("done").addClass("in_progress");
          $(navSpan).removeClass("done").addClass("in_progress");
        }
      });
      //Write "DONE" on any tiles where everything's done. This replaces X/X.
      if (overallChecked === overallCount) {
        this.innerHTML = "DONE";
        $(this).removeClass("in_progress").addClass("done");
      } else {
        this.innerHTML = overallChecked + "/" + overallCount;
        $(this).removeClass("done").addClass("in_progress");
      }
    });
    watchEmptyHeaders();
  }

  function addCheckbox(el) {
    var $el = $(el);
    // assuming all content lies on the first line
    var content = $el.html().split("\n")[0];
    var sublists = $el.children("ul");

    content =
      '<div class="checkbox">' +
      "<label>" +
      '<input type="checkbox" id="' +
      $el.attr("data-id") +
      '">' +
      '<span class="item_content">' +
      content +
      "</span>" +
      "</label>" +
      "</div>";

    $el.html(content).append(sublists);

    if (
      profiles[profilesKey][profiles.current].checklistData[
        $el.attr("data-id")
      ] === true
    ) {
      $("#" + $el.attr("data-id")).prop("checked", true);
      $("label", $el).addClass("completed");
    }
  }

  function canDelete() {
    var count = 0;
    $.each(profiles[profilesKey], function (index, value) {
      count++;
    });
    return count > 1;
  }

  function getFirstProfile() {
    for (var profile in profiles[profilesKey]) {
      return profile;
    }
  }

  /*
   * -------------------------
   * Back to top functionality
   * -------------------------
   */
  $(function () {
    var offset = 220;
    var duration = 500;
    $(window).scroll(function () {
      if ($(this).scrollTop() > offset) {
        $(".fadingbutton").fadeIn(duration);
      } else {
        $(".fadingbutton").fadeOut(duration);
      }
      if (location.hash && history.replaceState) {
        history.replaceState(null, "", location.pathname + location.search);
      }
    });

    $(".back-to-top").click(function (event) {
      event.preventDefault();
      $("html, body").animate({ scrollTop: 0 }, duration);
      return false;
    });
  });

  $("#toggleHideCompleted").attr("checked", false);
}

function createTableOfContents() {
  // Get all h3 elements with an ID
  let headings = document.querySelectorAll("h3[id]");

  // Create the unordered list
  let toc = document.createElement("ul");

  headings.forEach((heading, index) => {
    if (heading.id === "profileModalTitle") {
      return;
    }
    // Create a list item
    let li = document.createElement("li");

    // Create the anchor tag with the heading's ID as the href
    let a = document.createElement("a");
    a.setAttribute("href", `#${heading.id}`);
    a.textContent = heading.textContent;

    // Create the span with the id playthrough_nav_totals_x where x is the index + 1
    let span = document.createElement("span");
    span.setAttribute("id", `playthrough_nav_totals_${index + 1}`);

    // Append the anchor and span to the list item
    li.appendChild(a);
    li.appendChild(span);

    // Append the list item to the table of contents
    toc.appendChild(li);
  });

  // Append the table of contents to the desired container
  let tocContainer = document.querySelector(".table_of_contents");
  if (tocContainer) {
    tocContainer.appendChild(toc);
  }
}
