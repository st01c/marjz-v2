// Render section-specific listings on research/practice/teaching pages.
document.addEventListener("DOMContentLoaded", async () => {
  const section = document.body.dataset.section;
  const container = document.getElementById("section-list");
  const paginationEl = document.getElementById("section-pagination");
  if (!section || !container) return;

  const items = (await fetchContent()) || [];
  const target = section.toLowerCase();
  const filtered = sortByYear(
    items.filter((i) => (i.section || "").toLowerCase() === target)
  );

  const pageSize =
    section === "research" || section === "talks"
      ? 12
      : section === "practice"
      ? 8
      : filtered.length;
  let currentPage = 1;

  const scrollToTop = () => {
    if (typeof window === "undefined" || typeof window.scrollTo !== "function") return;
    const doScroll = () => {
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        window.scrollTo(0, 0);
      }
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(doScroll);
    } else {
      doScroll();
    }
  };

  const renderPage = async (shouldScroll = false) => {
    const page = paginateItems(filtered, currentPage, pageSize);
    currentPage = page.currentPage;
    await renderSectionList(container, page.pageItems, section);

    if (typeof renderPagination === "function") {
      renderPagination(
        paginationEl,
        {
          totalItems: page.totalItems,
          totalPages: page.totalPages,
          currentPage: page.currentPage,
          pageStart: page.pageStart,
          pageEnd: page.pageEnd,
        },
        async (nextPage) => {
          currentPage = nextPage;
          await renderPage(true);
        }
      );
    } else if (paginationEl) {
      paginationEl.hidden = true;
    }

    if (shouldScroll) {
      scrollToTop();
    }
  };

  await renderPage();
});

const contentImageCache = new Map();

async function renderSectionList(container, items, sectionName) {
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = "<p>No entries yet.</p>";
    return;
  }

  if (sectionName === "practice") {
    await renderPracticeGrid(container, items);
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

    const meta = document.createElement("div");
    meta.className = "browse-card-type";
    const dateLabel = formatFullDate(item.fullDate) || (item.year ? String(item.year) : "");
    meta.textContent = dateLabel;
    if (dateLabel) header.appendChild(meta);

    const typeText = (item.type || "").trim();
    const tags = (item.tags || []).filter(Boolean);

    const summary = document.createElement("p");
    summary.textContent = item.summary || "";

    card.appendChild(header);
    if (sectionName === "research" || sectionName === "talks") {
      const metaRow = document.createElement("div");
      metaRow.className = "pill-row";

      if (typeText) {
        const typeEl = document.createElement("span");
        typeEl.className = "pill";
        typeEl.style.fontWeight = "700";
        typeEl.style.color = "#000";
        typeEl.textContent = typeText;
        metaRow.appendChild(typeEl);
      }

      tags.forEach((t) => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = t;
        metaRow.appendChild(pill);
      });

      if (metaRow.children.length) {
        card.appendChild(metaRow);
      }
    } else if (tags.length) {
      const tagsRow = document.createElement("div");
      tagsRow.className = "pill-row";
      tags.forEach((t) => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = t;
        tagsRow.appendChild(pill);
      });
      card.appendChild(tagsRow);
    }
    if (item.summary) card.appendChild(summary);

    container.appendChild(card);
  });
}

async function renderPracticeGrid(container, items) {
  const cards = await Promise.all(
    items.map(async (item) => ({
      item,
      media: await resolveCardMedia(item),
    }))
  );

  cards.forEach(({ item, media }) => {
    const card = document.createElement("article");
    card.className = "practice-card";

    const mediaBox = document.createElement("div");
    mediaBox.className = "practice-card-media";

    if (media.src) {
      mediaBox.classList.add("has-image");
      const img = document.createElement("img");
      img.src = media.src;
      img.loading = "lazy";
      img.alt = item.title || item.id || "Project image";
      mediaBox.appendChild(img);
    } else {
      mediaBox.classList.add("no-image");
      const placeholder = document.createElement("div");
      placeholder.className = "practice-card-placeholder";
      placeholder.style.backgroundColor = media.color;
      mediaBox.appendChild(placeholder);
    }

    const body = document.createElement("div");
    body.className = "practice-card-body";

    const header = document.createElement("div");
    header.className = "practice-card-header";

    const titleEl = document.createElement("div");
    titleEl.className = "practice-card-title";

    const linkInfo = buildLinkInfo(item);
    let linkEl = null;
    if (linkInfo.href) {
      const link = document.createElement("a");
      link.href = linkInfo.href;
      link.textContent = item.title;
      if (linkInfo.external) {
        link.target = "_blank";
        link.rel = "noopener";
      }
      titleEl.appendChild(link);
      linkEl = link;
    } else {
      titleEl.textContent = item.title;
    }

    const dateLabel = formatFullDate(item.fullDate) || (item.year ? String(item.year) : "");
    header.appendChild(titleEl);
    if (dateLabel) {
      const dateEl = document.createElement("div");
      dateEl.className = "practice-card-date";
      dateEl.textContent = dateLabel;
      header.appendChild(dateEl);
    }
    body.appendChild(header);

    const metaRow = document.createElement("div");
    metaRow.className = "practice-card-meta";

    const typeText = item.type ? String(item.type).trim() : "";
    const tags = (item.tags || []).filter(Boolean);

    if (typeText) {
      const typeEl = document.createElement("span");
      typeEl.className = "pill";
      typeEl.style.fontWeight = "700";
      typeEl.style.color = "#000";
      typeEl.textContent = typeText;
      metaRow.appendChild(typeEl);
    }

    tags.forEach((t) => {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = t;
      metaRow.appendChild(pill);
    });

    if (metaRow.children.length) {
      body.appendChild(metaRow);
    }

    card.appendChild(mediaBox);
    card.appendChild(body);
    if (linkEl) addCardHoverOverlay(card, linkEl);
    container.appendChild(card);
  });
}

function addCardHoverOverlay(card, link) {
  const add = () => card.classList.add("is-link-hover");
  const remove = () => card.classList.remove("is-link-hover");
  link.addEventListener("mouseenter", add);
  link.addEventListener("mouseleave", remove);
  link.addEventListener("focus", add);
  link.addEventListener("blur", remove);
}

async function resolveCardMedia(item) {
  if (item.gridImage) {
    return { src: item.gridImage };
  }

  const directImage = (item.images || []).find(Boolean);
  if (directImage) {
    return { src: directImage };
  }

  const contentImage = await findFirstImageInContent(item.contentPath);
  if (contentImage) {
    return { src: contentImage };
  }

  return {
    src: "",
    color: pickPlaceholderColor(item.id || item.title || String(Math.random())),
  };
}

async function findFirstImageInContent(contentPath) {
  if (!contentPath) return "";

  if (contentImageCache.has(contentPath)) {
    return contentImageCache.get(contentPath);
  }

  try {
    const res = await fetch(contentPath);
    if (!res.ok) throw new Error("Failed to fetch content");

    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const img = doc.querySelector("img[src]");
    const src = img ? img.getAttribute("src") || "" : "";
    contentImageCache.set(contentPath, src);
    return src;
  } catch (e) {
    console.error("Could not load content for", contentPath, e);
    contentImageCache.set(contentPath, "");
    return "";
  }
}

function paginateItems(items, currentPage, pageSize) {
  const safeSize = Math.max(1, pageSize || items.length || 1);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));
  const safePage = Math.min(Math.max(currentPage || 1, 1), totalPages);
  const startIndex = (safePage - 1) * safeSize;
  const endIndex = Math.min(startIndex + safeSize, totalItems);

  return {
    totalItems,
    totalPages,
    currentPage: safePage,
    pageStart: startIndex + 1,
    pageEnd: endIndex,
    pageItems: items.slice(startIndex, endIndex),
  };
}

function pickPlaceholderColor(seed) {
  const palette = [
    "#FECACA",
    "#C7D2FE",
    "#A5F3FC",
    "#FDE68A",
    "#BBF7D0",
    "#FBCFE8",
    "#E0F2FE",
  ];

  const key = seed || String(Math.random());
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash + key.charCodeAt(i) * (i + 1)) % palette.length;
  }

  return palette[hash];
}
