function sanitize(s) {
  return s
    .split("")
    .map((char) => {
      // Regex tests for valid id characters
      return /^[A-Za-z0-9\-_]$/.test(char) ? char : "_";
    })
    .join("");
}

function generateTasks() {
  let markdownString = "none";

  // Fetch the markdown content from checklist.md
  fetch("checklist.md")
    .then((response) => {
      // If fetching the markdown file was unsuccessful, throw an error
      if (!response.ok) {
        throw new Error("Network response was not ok:", "/checklist.md", response);
      }
      return response.text(); // Return the content of the file as a string
    })
    .then((markdown) => {
      markdownString = markdown;
      const lines = markdownString.split("\n");
      let htmlOutput = "";

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
          htmlOutput += `</ul><h3 id="${idText}"><a href="#" data-toggle="collapse" data-parent="#tabPlaythrough" class="btn btn-primary btn-collapse btn-sm"></a><a href="#">${headerText}</a></h3>\n`;
          htmlOutput += '<ul class="panel-collapse collapse in">\n';
        }
        // Check if the line starts with '- ' indicating a list item (main or sub-bullet based on indentation)
        else if (line.startsWith("- ") || /^(\t| {2})+\- /.test(lines[i])) {
          // Extract the text after '- ' and trim any leading/trailing spaces
          let listItemText = line.substr(2).trim();
          
          // If there's no icon, default to ::task::
          if (!listItemText.includes("::")) {
            listItemText = "::task::" + listItemText;
          } 

          // Replace ::missable:: with a clock icon, ::item:: with the gem icon, ::ability:: with mortarboard icon, and ::task::, if present or added above
          listItemText = listItemText.replace(
            /::missable::/g,
            '<i class="bi bi-stopwatch"></i>'
          );
          listItemText = listItemText.replace(
            /::item::/g,
            '<i class="bi bi-gem"></i>'
          );
          listItemText = listItemText.replace(
            /::item_ordinary::/g,
            '<i class="bi bi-patch-minus"></i>'
          );
          listItemText = listItemText.replace(
            /::item_common::/g,
            '<i class="bi bi-gem"></i>'
          );
          listItemText = listItemText.replace(
            /::item_uncommon::/g,
            '<i class="bi bi-gem text-success"></i>'
          );
          listItemText = listItemText.replace(
            /::item_rare::/g,
            '<i class="bi bi-gem text-primary"></i>'
          );
          listItemText = listItemText.replace(
            /::item_veryrare::/g,
            '<i class="bi bi-gem text-danger"></i>'
          );
          listItemText = listItemText.replace(
            /::item_legendary::/g,
            '<i class="bi bi-gem text-warning"></i>'
          );
          listItemText = listItemText.replace(
            /::item_story::/g,
            '<i class="bi bi-book text-danger"></i>'
          );
          listItemText = listItemText.replace(
            /::ability::/g,
            '<i class="bi bi-mortarboard"></i>'
          );
          listItemText = listItemText.replace(
            /::task::/g,
            '<i class="bi bi-clipboard-check"></i>'
          );

          // Convert markdown-style links to HTML links
          const linkPattern = /\[(.*?)\]\((.*?)\)/g;
          listItemText = listItemText.replace(
            linkPattern,
            '<a href="$2" target="_blank">$1</a>'
          );

          // Generate a unique ID for the item, starting by preparing a slice without the HTML tags, or else the ID may only get the first 50 characters of HTML (so it won't be unique)
          const listItemTextWithoutTags = listItemText.replace(/(<([^>]+)>)/gi, "");
          const uuid = sanitize(listItemTextWithoutTags.slice(0, 50)); // Extract only the first 50 characters of the text without HTML tags

          // If the bullet is a top-level bullet (i.e., not indented)
          if (level === 0) {
            htmlOutput += `<li data-id="playthrough_${uuid}">${listItemText}\n`;
          }
          // If the bullet is an indented sub-bullet
          else {
            // If the previous line was not a sub-bullet, begin a new nested list
            if (i === 0 || /^(\t| {2})+\- /.test(lines[i - 1]) === false) {
              htmlOutput += `<ul class="panel-collapse collapse in">\n`;
            }

            // Append the sub-bullet to the output
            htmlOutput += `<li data-id="playthrough_${uuid}">${listItemText}</li>\n`;

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
          listItem.setAttribute("data-id", listItem.getAttribute("data-id") + "_" + occurrences);
        }
      });
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

    // Set a recurring timer and watch headers with all subtasks completed with the watchEmptyHeaders function
    setInterval(watchEmptyHeaders, 250);
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

      let aTag = heading.querySelector('a[data-toggle="collapse"]');
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

    $('input[type="checkbox"]').click(function () {
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
        .find('li > label > input[type="checkbox"]')
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
      //_gaq.push(['_trackEvent', 'Profile', 'Change', profiles.current]);
    });

    $("#profileAdd").click(function () {
      $("#profileModalTitle").html("Add Profile");
      $("#profileModalName").val("");
      $("#profileModalAdd").show();
      $("#profileModalUpdate").hide();
      $("#profileModalDelete").hide();
      $("#profileModal").modal("show");
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
      $("#profileModal").modal("show");
      //_gaq.push(['_trackEvent', 'Profile', 'Edit', profiles.current]);
    });

    $("#profileModalAdd").click(function (event) {
      event.preventDefault();
      var profile = $.trim($("#profileModalName").val());
      if (profile.length > 0) {
        if (typeof profiles[profilesKey][profile] == "undefined") {
          profiles[profilesKey][profile] = { checklistData: {} };
        }
        profiles.current = profile;
        $.jStorage.set(profilesKey, profiles);
        populateProfiles();
        populateChecklists();
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
      $("#profileModal").modal("hide");
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
      $("#profileModal").modal("hide");
      //_gaq.push(['_trackEvent', 'Profile', 'Delete']);
    });
    $("#toggleHideCompleted").change(function () {
      var hidden = !$(this).is(":checked");
      $("body").toggleClass("hide_completed", !hidden);
      $("[data-item-toggle]").change(function () {
        var type = $(this).data("item-toggle");
        var to_hide = $(this).is(":checked");

        calculateTotals();
      });

      calculateTotals();
    });

    $("#toggleCollapseAll").change(function () {
      if (
        $(this).data("lastState") === null ||
        $(this).data("lastState") === 0
      ) {
        // close all
        $(".collapse").collapse("show");

        // next state will be open all
        $(this).data("lastState", 1);
      } else {
        // initial state...
        // override accordion behavior and open all
        $(".panel-collapse.in")
          .removeData("bs.collapse.in")
          .collapse({ parent: true, toggle: false })
          .collapse("hide")
          .removeData("bs.collapse.in")
          // restore single panel behavior
          .collapse({ parent: "#tabPlaythrough", toggle: false });

        // next state will be close all
        $(this).data("lastState", 0);
      }
      var hidden = !$(this).is(":checked");
      $("body").toggleClass("collapse_all", !hidden);
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
    $('input[type="checkbox"]').prop("checked", false);
    $.each(
      profiles[profilesKey][profiles.current].checklistData,
      function (index, value) {
        $("#" + index).prop("checked", value);
      }
    );
    calculateTotals();
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
          checked = 0;

        //get top level section of each total header/label, and find the sibling section that has the 'li' elements
        $(element2)
          .parent()
          .next()
          .find("> li")
          .each(function (index, checkbox) {
            checkbox = $(checkbox);
            // console.log(checkbox.is(':hidden'), checkbox.prop('id').match(regexFilter), checkbox.find('input').prop('checked'));
            if (
              checkbox.find("input").is(":hidden") &&
              checkbox.find("input").prop("id").match(regexFilter) &&
              canFilter(checkbox.find("input").closest("li"))
            ) {
              //this continues in a jQuery each() loop
              return true;
            }
            count++;
            overallCount++;
            if (checkbox.find("input").prop("checked")) {
              checked++;
              overallChecked++;
            }
          });
        if (checked === count) {
          if (typeof $("#" + type + "_nav_totals_" + i)[0] === "undefined") {
            // console.log($("#" + type + "_nav_totals_" + i));
            return;
          }
          this.innerHTML = $("#" + type + "_nav_totals_" + i)[0].innerHTML =
            "DONE";
          $(this).removeClass("in_progress").addClass("done");
          $($("#" + type + "_nav_totals_" + i)[0])
            .removeClass("in_progress")
            .addClass("done");
        } else {
          this.innerHTML = $("#" + type + "_nav_totals_" + i)[0].innerHTML =
            checked + "/" + count;
          $(this).removeClass("done").addClass("in_progress");
          $($("#" + type + "_nav_totals_" + i)[0])
            .removeClass("done")
            .addClass("in_progress");
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

  function canFilter(entry) {
    if (!entry.attr("class")) {
      return false;
    }
    var classList = entry.attr("class").split(/\s+/);
    var foundMatch = 0;
    for (var i = 0; i < classList.length; i++) {
      if (!classList[i].match(/^f_(.*)/)) {
        continue;
      }
      if (
        classList[i] in
        profiles[profilesKey][profiles.current].hidden_categories
      ) {
        if (
          !profiles[profilesKey][profiles.current].hidden_categories[
            classList[i]
          ]
        ) {
          return false;
        }
        foundMatch = 1;
      }
    }
    if (foundMatch === 0) {
      return false;
    }
    return true;
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
    });

    $(".back-to-top").click(function (event) {
      event.preventDefault();
      $("html, body").animate({ scrollTop: 0 }, duration);
      return false;
    });
  });

  $("#toggleHideCompleted").attr("checked", false);

  /*
     * ------------------------------------------
     * Restore tabs/hidden sections functionality
     * ------------------------------------------
     
     $(function() {
        // reset `Hide completed` button state (otherwise Chrome bugs out)
        $('#toggleHideCompleted').attr('checked', false);

        // restore collapsed state on page load
        restoreState(profiles.current);

        if (profiles[profilesKey][profiles.current].current_tab) {
            $('.nav.nav-tabs li a[href="' + profiles[profilesKey][profiles.current].current_tab + '"]').click();
        }

        // register on click handlers to store state
        $('a[href$="_col"]').on('click', function(el) {
            var collapsed_key = $(this).attr('href');
            var saved_tab_state = !!profiles[profilesKey][profiles.current].collapsed[collapsed_key];

            profiles[profilesKey][profiles.current].collapsed[$(this).attr('href')] = !saved_tab_state;

            $.jStorage.set(profilesKey, profiles);
        });

        $('.nav.nav-tabs li a').on('click', function(el) {
            profiles[profilesKey][profiles.current].current_tab = $(this).attr('href');

            $.jStorage.set(profilesKey, profiles);
        });
     });
     */
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
