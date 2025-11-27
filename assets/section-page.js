// Render section-specific listings on research/practice/teaching pages.
document.addEventListener("DOMContentLoaded", async () => {
  const section = document.body.dataset.section;
  const container = document.getElementById("section-list");
  if (!section || !container) return;

  const items = (await fetchContent()) || [];
  const filtered = sortByYear(items.filter((i) => i.section === section));

  renderSectionList(container, filtered);
});

function renderSectionList(container, items) {
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = "<p>No entries yet.</p>";
    return;
  }

  items.forEach((item) => {
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

    if (item.year) {
      const meta = document.createElement("div");
      meta.className = "browse-card-type";
      meta.textContent = item.year;
      header.appendChild(meta);
    }

    const tagsRow = document.createElement("div");
    tagsRow.className = "pill-row";
    (item.tags || []).forEach((t) => {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = t;
      tagsRow.appendChild(pill);
    });

    const summary = document.createElement("p");
    summary.textContent = item.summary || "";

    card.appendChild(header);
    if ((item.tags || []).length) card.appendChild(tagsRow);
    if (item.summary) card.appendChild(summary);

    container.appendChild(card);
  });
}
