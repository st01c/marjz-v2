async function initItemPage() {
  const params = new URLSearchParams(window.location.search);
  const queryId = params.get("id");
  if (!queryId) {
    showError("No item id provided.");
    return;
  }

  const item = await loadItem(queryId);
  if (!item) {
    showError("Item not found.");
    return;
  }

  renderMeta(item);
  await renderContent(item);
}

async function loadItem(query) {
  try {
    const res = await fetch("data/content.json");
    const items = await res.json();
    const lower = query.toLowerCase();
    return items.find(
      (i) =>
        (i.id && i.id.toLowerCase() === lower) ||
        (i.slug && i.slug.toLowerCase() === lower)
    );
  } catch (err) {
    console.error("Could not load content.json", err);
    showError("Failed to load content index.");
    return null;
  }
}

function renderMeta(item) {
  const titleEl = document.getElementById("title");
  const metaEl = document.getElementById("meta");
  const tagsEl = document.getElementById("tags");
  const sectionLabel = document.getElementById("section-label");
  const externalLink = document.getElementById("external-link");

  if (titleEl) titleEl.textContent = item.title || item.id || "Untitled";

  const parts = [];
  if (item.year) parts.push(item.year);
  if (item.type) parts.push(item.type);
  if (item.section) parts.push(item.section);
  if (metaEl) metaEl.textContent = parts.join(" · ");

  if (sectionLabel) {
    sectionLabel.textContent = item.section || "";
  }

  tagsEl.innerHTML = "";
  (item.tags || []).forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = tag;
    tagsEl.appendChild(pill);
  });

  if (item.link && externalLink) {
    const a = document.createElement("a");
    a.href = item.link;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "External link";
    a.className = "contact-pill";
    externalLink.appendChild(a);
  }
}

async function renderContent(item) {
  const container = document.getElementById("content");
  if (!container) return;

  if (!item.contentPath) {
    container.textContent = item.summary || "No content available.";
    return;
  }

  try {
    const res = await fetch(item.contentPath);
    if (!res.ok) throw new Error("Failed to fetch content.");
    const html = await res.text();
    container.innerHTML = html;
    enforceLazyImages(container);
  } catch (err) {
    console.error(err);
    container.textContent = item.summary || "Content could not be loaded.";
  }
}

function enforceLazyImages(container) {
  const imgs = container.querySelectorAll("img");
  imgs.forEach((img) => {
    if (!img.getAttribute("loading")) {
      img.setAttribute("loading", "lazy");
    }
  });
}

function showError(message) {
  const container = document.getElementById("content");
  if (container) {
    container.textContent = message;
  }
}

document.addEventListener("DOMContentLoaded", initItemPage);
