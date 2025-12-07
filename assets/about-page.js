// Fetch and render About page content from Markdown, avoiding inline code exposure.
document.addEventListener("DOMContentLoaded", () => {
  renderAboutContent();
});

async function renderAboutContent() {
  const container = document.getElementById("about-content");
  if (!container) return;

  const source = container.dataset.source || "content/about.md";
  container.innerHTML = "<p>Loading about page...</p>";

  try {
    const text = await fetchText(source);
    const { body } = parseFrontmatter(text);
    const html = markdownToHtml(body || "");
    container.innerHTML = html;
    markExternalLinks(container);
  } catch (err) {
    console.error("Could not load About content", err);
    container.innerHTML = "<p>Content unavailable right now.</p>";
  }
}

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${path}`);
  }
  return res.text();
}

function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== "---") {
    return { attributes: {}, body: text };
  }

  let i = 1;
  while (i < lines.length && lines[i].trim() !== "---") {
    i += 1;
  }

  const body = lines.slice(i + 1).join("\n");
  return { attributes: {}, body };
}

function markdownToHtml(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      blocks.push(
        `<pre><code${lang ? ` class="language-${escapeAttribute(lang)}` : ""}">` +
          escapeHtml(buf.join("\n")) +
          "</code></pre>"
      );
      if (i < lines.length) i += 1;
      continue;
    }

    if (trimmed === "") {
      i += 1;
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() !== "") {
      para.push(lines[i]);
      i += 1;
    }
    const blockText = para.join("\n").trim();
    if (blockText) {
      blocks.push(renderBlock(blockText));
    }
  }

  return blocks.join("\n") || "<p></p>";
}

function renderBlock(text) {
  if (text.startsWith("### ")) return `<h3>${renderInline(text.slice(4))}</h3>`;
  if (text.startsWith("## ")) return `<h2>${renderInline(text.slice(3))}</h2>`;
  if (text.startsWith("# ")) return `<h1>${renderInline(text.slice(2))}</h1>`;
  return `<p>${renderInline(text).replace(/\n/g, "<br>")}</p>`;
}

function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/!\[(.*?)\]\((.+?)\)/g, (match, alt, target) => {
    const { url } = parseImageTarget(target);
    if (!url) return escapeHtml(match);
    return `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}">`;
  });
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => {
    const safeUrl = escapeAttribute(url);
    const safeLabel = label;
    return `<a href="${safeUrl}">${safeLabel}</a>`;
  });
  return html;
}

function parseImageTarget(target) {
  const trimmed = String(target || "").trim();
  const withTitle = trimmed.match(/^(\S+)(?:\s+"(.*)")?$/);
  if (withTitle) {
    return { url: withTitle[1], title: withTitle[2] || "" };
  }

  const [url = "", ...rest] = trimmed.split(/\s+/);
  return { url, title: rest.join(" ").trim() };
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(str) {
  return String(str || "").replace(/"/g, "&quot;");
}

function markExternalLinks(container) {
  const anchors = container.querySelectorAll("a[href]");
  anchors.forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("/") || href.startsWith("#")) return;
    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) {
        a.target = "_blank";
        a.rel = "noopener";
      }
    } catch (e) {
      // Ignore invalid URLs; leave them as-is.
    }
  });
}
