async function loadContent() {
  // Update footer year if present
  const yearSpan = document.getElementById("year");
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }

  let items = [];
  try {
    const res = await fetch("data/content.json");
    items = await res.json();
  } catch (e) {
    console.error("Could not load content.json", e);
    return;
  }

  // Split by section for the main page
  const research = items.filter((i) => i.section === "research");
  const projects = items.filter((i) => i.section === "projects");
  const teaching = items.filter((i) => i.section === "teaching");

  renderSectionCards("research-container", research);
  renderSectionCards("projects-container", projects);
  renderSectionCards("teaching-container", teaching);

  // Setup browse-by-tags (including year & type)
  setupBrowsingControls(items);
}

function renderSectionCards(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items.length) {
    container.innerHTML = "<p>No items yet.</p>";
    return;
  }

  // Simple card listing all items in this section
  const card = document.createElement("article");
  card.className = "card";

  const title = document.createElement("h3");
  title.textContent = "Items";

  const small = document.createElement("small");
  small.textContent = "From content.json";

  const list = document.createElement("ul");
  list.className = "item-list";

  items
    .sort((a, b) => (b.year || 0) - (a.year || 0))
    .forEach((item) => {
      const li = document.createElement("li");

      const titleSpan = document.createElement("span");
      titleSpan.className = "item-title";

      if (item.link) {
        const link = document.createElement("a");
        link.href = item.link;
        link.textContent = item.title;
        link.target = "_blank";
        link.rel = "noopener";
        titleSpan.appendChild(link);
      } else {
        titleSpan.textContent = item.title;
      }

      const metaSpan = document.createElement("span");
      metaSpan.className = "item-meta";
      metaSpan.textContent =
        (item.year ? item.year + " · " : "") + (item.summary || "");

      li.appendChild(titleSpan);
      li.appendChild(metaSpan);
      list.appendChild(li);
    });

  card.appendChild(title);
  card.appendChild(small);
  card.appendChild(list);
  container.appendChild(card);
}

/**
 * Setup browsing:
 * - Year and type are treated as tags for browsing.
 * - One filter mode: "any" (default) or "all".
 *   - any: item matches if it has at least one selected tag
 *   - all: item matches only if it has all selected tags
 */
function setupBrowsingControls(items) {
  const tagListEl = document.getElementById("tag-list");
  const resultsEl = document.getElementById("browse-results");
  const modeButtons = document.querySelectorAll(".mode-button");

  if (!tagListEl || !resultsEl || !modeButtons.length) return;

  // Build extended tags per item (tags + year + type)
  // and collect all possible tag values.
  const tagSet = new Set();

  items.forEach((item) => {
    const extended = new Set();

    // Existing tags
    (item.tags || []).forEach((t) => {
      if (t) extended.add(String(t));
    });

    // Year as tag
    if (item.year) {
      extended.add(String(item.year));
    }

    // Type as tag
    if (item.type) {
      extended.add(String(item.type));
    }

    // Store for later filtering
    item._extendedTags = Array.from(extended);

    // Add to global tag set
    item._extendedTags.forEach((t) => tagSet.add(t));
  });

  const allTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));

  // State: selected tags + mode ("any" or "all")
  const activeTags = new Set();
  let filterMode = "any"; // default

  // ---- Mode buttons (Any / All) ----
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (!mode || mode === filterMode) return;

      filterMode = mode;
      updateModeButtons();
      renderBrowseResults(items, resultsEl, activeTags, filterMode);
    });
  });

  function updateModeButtons() {
    modeButtons.forEach((btn) => {
      if (btn.dataset.mode === filterMode) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  updateModeButtons();

  // ---- Tag buttons ----
  tagListEl.innerHTML = "";

  allTags.forEach((tag) => {
    const btn = document.createElement("button");
    btn.textContent = tag;
    btn.className = "tag-button";
    btn.dataset.tag = tag;

    btn.addEventListener("click", () => {
      const t = btn.dataset.tag;
      if (!t) return;

      if (activeTags.has(t)) {
        activeTags.delete(t);
      } else {
        activeTags.add(t);
      }

      updateTagButtons();
      renderBrowseResults(items, resultsEl, activeTags, filterMode);
    });

    tagListEl.appendChild(btn);
  });

  function updateTagButtons() {
    const buttons = tagListEl.querySelectorAll(".tag-button");
    buttons.forEach((btn) => {
      const t = btn.dataset.tag;
      if (t && activeTags.has(t)) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  // Initial render: no tags selected → show all
  renderBrowseResults(items, resultsEl, activeTags, filterMode);
}

/**
 * Render browse results using:
 * - activeTags: Set of selected tag strings
 * - mode: "any" (item has at least one of the tags)
 *         "all" (item has all of the tags)
 */
function renderBrowseResults(items, container, activeTags, mode) {
  container.innerHTML = "";

  const selectedTags = Array.from(activeTags);

  let filtered = items;

  if (selectedTags.length > 0) {
    filtered = items.filter((item) => {
      const itemTags = item._extendedTags || [];
      if (mode === "all") {
        // Must contain all selected tags
        return selectedTags.every((t) => itemTags.includes(t));
      } else {
        // "any": must contain at least one selected tag
        return selectedTags.some((t) => itemTags.includes(t));
      }
    });
  }

  if (!filtered.length) {
    container.innerHTML = "<p>No items match these tags yet.</p>";
    return;
  }

  filtered
    .sort((a, b) => (b.year || 0) - (a.year || 0))
    .forEach((item) => {
      const card = document.createElement("article");
      card.className = "browse-card";

      const header = document.createElement("div");
      header.className = "browse-card-header";

      const titleEl = document.createElement("div");
      titleEl.className = "browse-card-title";

      if (item.link) {
        const link = document.createElement("a");
        link.href = item.link;
        link.textContent = item.title;
        link.target = "_blank";
        link.rel = "noopener";
        titleEl.appendChild(link);
      } else {
        titleEl.textContent = item.title;
      }

      const typeEl = document.createElement("div");
      typeEl.className = "browse-card-type";
      typeEl.textContent =
        (item.year ? item.year + " · " : "") + (item.type || "");

      header.appendChild(titleEl);
      header.appendChild(typeEl);

      const summaryEl = document.createElement("p");
      summaryEl.textContent = item.summary || "";

      const tagsRow = document.createElement("div");
      tagsRow.className = "pill-row";

      // Show the extended tags? Probably better to show the original tags,
      // but you can change this if you want years/types visible here too.
      const visibleTags = item.tags || [];

      visibleTags.forEach((t) => {
        const span = document.createElement("span");
        span.className = "pill";
        span.textContent = t;
        tagsRow.appendChild(span);
      });

      card.appendChild(header);
      if (item.summary) {
        card.appendChild(summaryEl);
      }
      if (visibleTags.length) {
        card.appendChild(tagsRow);
      }

      container.appendChild(card);
    });
}

document.addEventListener("DOMContentLoaded", loadContent);
