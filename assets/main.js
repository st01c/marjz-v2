// Entry point: fetch content, render section lists, wire up browsing controls.
async function loadContent() {
  setYear();

  const items = await fetchContent();
  if (!items.length) return;

  const sections = splitBySection(items);
  const tagData = buildTagData(items);

  renderSectionCards("research-container", sections.research);
  renderSectionCards("projects-container", sections.projects);
  renderSectionCards("teaching-container", sections.teaching);

  setupBrowsingControls(tagData.itemsWithTags, tagData.allTags);
}

// Footer helper: keep the copyright year current.
function setYear() {
  const yearSpan = document.getElementById("year");
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
}

// Data loader: fetch structured content from disk.
async function fetchContent() {
  try {
    const res = await fetch("data/content.json");
    return await res.json();
  } catch (e) {
    console.error("Could not load content.json", e);
    return [];
  }
}

// Organizer: group items by section for easy rendering.
function splitBySection(items) {
  return {
    research: items.filter((i) => i.section === "research"),
    projects: items.filter((i) => i.section === "projects"),
    teaching: items.filter((i) => i.section === "teaching"),
  };
}

// Tag prep: add extended tags (base tags + year + type) per item, and collect all unique tags.
function buildTagData(items) {
  const tagSet = new Set();

  const itemsWithTags = items.map((item) => {
    const extended = new Set();

    (item.tags || []).forEach((t) => {
      if (t) extended.add(String(t));
    });

    if (item.year) {
      extended.add(String(item.year));
    }

    if (item.type) {
      extended.add(String(item.type));
    }

    const taggedItem = { ...item, _extendedTags: Array.from(extended) };
    taggedItem._extendedTags.forEach((t) => tagSet.add(t));
    return taggedItem;
  });

  const allTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));

  return { itemsWithTags, allTags };
}

// Section cards: render simple lists for research / projects / teaching.
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
 * Browsing controls:
 * - Tags include base tags + year + type.
 * - Filter modes:
 *    any: item matches if it has at least one selected tag
 *    all: item matches only if it has every selected tag
 */
function setupBrowsingControls(items, allTags) {
  const tagListEl = document.getElementById("tag-list");
  const resultsEl = document.getElementById("browse-results");
  const modeButtons = document.querySelectorAll(".mode-button");

  if (!tagListEl || !resultsEl || !modeButtons.length) return;

  // State: selected tags + filter mode
  const activeTags = new Set();
  let filterMode = "any";

  // Mode buttons (Any / All)
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

  // Tag buttons
  tagListEl.innerHTML = "";

  allTags.forEach((tag) => {
    const btn = document.createElement("button");
    btn.textContent = tag;
    btn.className = "tag-button";
    btn.dataset.tag = tag;

    btn.addEventListener("click", () => {
      const t = btn.dataset.tag;
      if (!t) return;

      toggleTag(t, activeTags);

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

  function toggleTag(tag, set) {
    if (set.has(tag)) {
      set.delete(tag);
    } else {
      set.add(tag);
    }
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
