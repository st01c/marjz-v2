// Entry point: fetch content, render section lists, wire up browsing controls.
async function loadContent() {
  setYear();

  const items = await fetchContent();
  if (!items.length) return;

  renderPinnedHero(items);

  const tagData = buildTagData(items);

  const featuredItems = sortByYear(items.filter((i) => i.featured));

  renderSectionCards("featured-container", featuredItems);

  setupBrowsingControls(tagData.itemsWithTags, tagData.allTags, tagData.allTypes);
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
  const typeSet = new Set();

  const itemsWithTags = items.map((item) => {
    const tagsOnly = new Set();

    (item.tags || []).forEach((t) => {
      if (t) tagsOnly.add(String(t));
    });

    if (item.type) {
      typeSet.add(String(item.type));
    }

    const taggedItem = { ...item, _extendedTags: Array.from(tagsOnly), _type: item.type || "" };
    taggedItem._extendedTags.forEach((t) => tagSet.add(t));
    return taggedItem;
  });

  const allTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  const allTypes = Array.from(typeSet).sort((a, b) => a.localeCompare(b));

  return { itemsWithTags, allTags, allTypes };
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

  const list = document.createElement("ul");
  list.className = "item-list";

  items
    .slice()
    .sort((a, b) => (b.year || 0) - (a.year || 0))
    .forEach((item) => {
      const li = document.createElement("li");

      const titleSpan = document.createElement("span");
      titleSpan.className = "item-title";

      const linkInfo = buildLinkInfo(item);
      if (linkInfo.href) {
        const link = document.createElement("a");
        link.href = linkInfo.href;
        link.textContent = item.title;
        if (linkInfo.external) {
          link.target = "_blank";
          link.rel = "noopener";
        }
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

  card.appendChild(list);
  container.appendChild(card);
}

// Homepage hero: show the newest pinned entry (if any).
function renderPinnedHero(items) {
  const hero = document.getElementById("hero-feature");
  if (!hero) return;

  const pinned = sortByYear(items.filter((item) => item.pinned))[0];
  if (!pinned) {
    hero.hidden = true;
    return;
  }

  hero.hidden = false;

  const titleEl = document.getElementById("hero-feature-title");
  const blurbEl = document.getElementById("hero-feature-blurb");
  const linkEl = document.getElementById("hero-feature-link");
  const labelEl = document.getElementById("hero-feature-label");
  const imageEl = document.getElementById("hero-feature-image");
  const imageTag = document.getElementById("hero-feature-image-el");

  if (titleEl) {
    titleEl.textContent = pinned.title || pinned.id || "Pinned entry";
  }

  if (blurbEl) {
    blurbEl.textContent = pinned.summary || "";
  }

  if (labelEl) {
    const metaBits = ["Pinned entry"];
    if (pinned.section) metaBits.push(pinned.section);
    if (pinned.year) metaBits.push(pinned.year);
    labelEl.textContent = metaBits.join(" · ");
  }

  if (imageEl && imageTag) {
    const heroImage = (pinned.images || []).find(Boolean);
    if (heroImage) {
      imageTag.src = heroImage;
      imageTag.alt = pinned.title || pinned.id || "Pinned entry image";
      imageTag.hidden = false;
    } else {
      imageTag.removeAttribute("src");
      imageTag.alt = "";
      imageTag.hidden = true;
    }
  }

  if (linkEl) {
    const linkInfo = buildLinkInfo(pinned);
    if (linkInfo.href) {
      linkEl.href = linkInfo.href;
      if (linkInfo.external) {
        linkEl.target = "_blank";
        linkEl.rel = "noopener";
      } else {
        linkEl.removeAttribute("target");
        linkEl.removeAttribute("rel");
      }
      linkEl.hidden = false;
    } else {
      linkEl.hidden = true;
    }
  }
}

/**
 * Browsing controls:
 * - Tags include base tags + year + type.
 * - Filter modes:
 *    any: item matches if it has at least one selected tag
 *    all: item matches only if it has every selected tag
 */
function setupBrowsingControls(items, allTags, allTypes) {
  const tagListEl = document.getElementById("tag-list");
  const resultsEl = document.getElementById("browse-results");
  const typeListEl = document.getElementById("type-list");
  const modeButtons = document.querySelectorAll(".mode-button");

  if (!tagListEl || !resultsEl || !modeButtons.length || !typeListEl) return;

  // State: selected tags + filter mode
  const activeTags = new Set();
  const activeTypes = new Set();
  let filterMode = "any";

  // Mode buttons (Any / All)
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (!mode || mode === filterMode) return;

      filterMode = mode;
      updateModeButtons();
      updateTagButtons();
      renderBrowseResults(items, resultsEl, activeTags, activeTypes, filterMode);
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

      if (filterMode === "all" && !activeTags.has(t)) {
        const canAdd = combinationExists(new Set([...activeTags, t]), items, activeTypes);
        if (!canAdd) return;
      }

      toggleTag(t, activeTags);

      updateTagButtons();
      renderBrowseResults(items, resultsEl, activeTags, activeTypes, filterMode);
    });

    tagListEl.appendChild(btn);
  });

  function updateTagButtons() {
    const buttons = tagListEl.querySelectorAll(".tag-button");
    const availableTags = computeAvailableTags(items, allTags, activeTags, filterMode, activeTypes);
    buttons.forEach((btn) => {
      const t = btn.dataset.tag;
      const isActive = t && activeTags.has(t);
      btn.classList.toggle("active", isActive);
      const enabled = t ? availableTags.has(t) : true;
      btn.disabled = !enabled;
    });
  }

  // Type buttons
  typeListEl.innerHTML = "";
  allTypes.forEach((type) => {
    const btn = document.createElement("button");
    btn.textContent = type;
    btn.className = "tag-button";
    btn.dataset.type = type;

    btn.addEventListener("click", () => {
      const t = btn.dataset.type;
      if (!t) return;
      toggleTag(t, activeTypes);
      updateTypeButtons();
      updateTagButtons();
      renderBrowseResults(items, resultsEl, activeTags, activeTypes, filterMode);
    });

    typeListEl.appendChild(btn);
  });

  function updateTypeButtons() {
    const buttons = typeListEl.querySelectorAll(".tag-button");
    buttons.forEach((btn) => {
      const t = btn.dataset.type;
      const isActive = t && activeTypes.has(t);
      btn.classList.toggle("active", isActive);
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
  updateTagButtons();
  updateTypeButtons();
  renderBrowseResults(items, resultsEl, activeTags, activeTypes, filterMode);
}

/**
 * Render browse results using:
 * - activeTags: Set of selected tag strings
 * - mode: "any" (item has at least one of the tags)
 *         "all" (item has all of the tags)
 */
function renderBrowseResults(items, container, activeTags, activeTypes, mode) {
  container.innerHTML = "";

  const selectedTags = Array.from(activeTags);

  let filtered = items;

  if (activeTypes.size > 0) {
    filtered = filtered.filter((item) => item._type && activeTypes.has(item._type));
  }

  if (selectedTags.length > 0) {
    filtered = filtered.filter((item) => {
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
    .slice()
    .sort((a, b) => (b.year || 0) - (a.year || 0))
    .forEach((item) => {
      const card = document.createElement("article");
      card.className = "browse-card";

      const header = document.createElement("div");
      header.className = "browse-card-header";

      const titleEl = document.createElement("div");
      titleEl.className = "browse-card-title";

      const linkInfo = buildLinkInfo(item);
      if (linkInfo.href) {
        const link = document.createElement("a");
        link.href = linkInfo.href;
        link.textContent = item.title;
        if (linkInfo.external) {
          link.target = "_blank";
          link.rel = "noopener";
        }
        titleEl.appendChild(link);
      } else {
        titleEl.textContent = item.title;
      }

      header.appendChild(titleEl);

      const yearEl = document.createElement("div");
      yearEl.className = "browse-card-type";
      yearEl.textContent = item.year ? String(item.year) : "";
      if (item.year) header.appendChild(yearEl);

      const tagsRow = document.createElement("div");
      tagsRow.className = "pill-row";

      const visibleTags = item.tags || [];
      visibleTags.forEach((t) => {
        const span = document.createElement("span");
        span.className = "pill";
        span.textContent = t;
        tagsRow.appendChild(span);
      });

      const summaryEl = document.createElement("p");
      summaryEl.textContent = item.summary || "";

      card.appendChild(header);
      if (visibleTags.length) {
        card.appendChild(tagsRow);
      }
      if (item.summary) {
        card.appendChild(summaryEl);
      }

      container.appendChild(card);
    });
}

document.addEventListener("DOMContentLoaded", loadContent);

// Decide whether to link internally (item.html) or externally.
function buildLinkInfo(item) {
  const hasDetail = Boolean(item.contentPath || item.slug);
  if (hasDetail) {
    const slugOrId = encodeURIComponent(item.slug || item.id);
    return { href: `item.html?id=${slugOrId}`, external: false };
  }

  if (item.link) {
    return { href: item.link, external: true };
  }

  return { href: "", external: false };
}

// In "all" mode, only allow tag combinations that exist in the data.
function computeAvailableTags(items, allTags, activeTags, mode, activeTypes) {
  const typeFiltered = activeTypes && activeTypes.size > 0
    ? items.filter((item) => item._type && activeTypes.has(item._type))
    : items;

  if (mode !== "all" || activeTags.size === 0) {
    return new Set(allTags.filter((tag) => typeFiltered.some((item) => (item._extendedTags || []).includes(tag))));
  }

  const available = new Set(activeTags);

  typeFiltered.forEach((item) => {
    const tags = item._extendedTags || [];
    const hasAllActive = Array.from(activeTags).every((t) => tags.includes(t));
    if (hasAllActive) {
      tags.forEach((t) => available.add(t));
    }
  });

  return available;
}

function combinationExists(tagSet, items, activeTypes) {
  const typeFiltered = activeTypes && activeTypes.size > 0
    ? items.filter((item) => item._type && activeTypes.has(item._type))
    : items;

  const needed = Array.from(tagSet);
  return typeFiltered.some((item) => {
    const tags = item._extendedTags || [];
    return needed.every((t) => tags.includes(t));
  });
}

// Shared sorter: newest year first, then title.
function sortByYear(items) {
  return items.slice().sort((a, b) => {
    const ay = a.year || 0;
    const by = b.year || 0;
    if (ay !== by) return by - ay;
    return (a.title || "").localeCompare(b.title || "");
  });
}
