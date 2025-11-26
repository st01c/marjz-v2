#!/usr/bin/env node
/**
 * Build content index from per-entry JSON files for the static site.
 *
 * - Reads JSON files in content/entries/.
 * - Each file should include metadata (id, title, section, etc.) and a "body" field (markdown).
 * - Outputs:
 *    1) data/content.json (array consumed by assets/main.js and assets/item.js)
 *    2) content/<slug>.html (HTML version of the body for item detail pages)
 *
 * This keeps the existing filter/tag functionality intact by preserving fields and shape.
 */
const fs = require("fs/promises");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENTRIES_DIR = path.join(ROOT, "content", "entries");
const OUTPUT_JSON = path.join(ROOT, "data", "content.json");
const OUTPUT_CONTENT_DIR = path.join(ROOT, "content");

async function main() {
  const files = await fs.readdir(ENTRIES_DIR);
  const entryFiles = files.filter((f) => f.toLowerCase().endsWith(".json"));

  const entries = [];

  for (const filename of entryFiles) {
    const filePath = path.join(ENTRIES_DIR, filename);
    const raw = await fs.readFile(filePath, "utf8");
    const entry = JSON.parse(raw);

    validateEntry(entry, filename);

    const slug = slugify(entry.slug || entry.title || entry.id);
    const bodyMarkdown = entry.body || "";
    const html = markdownToHtml(bodyMarkdown);

    const images = Array.isArray(entry.images)
      ? entry.images.filter(Boolean)
      : [];
    if (!images.length) {
      const derived = extractImagesFromMarkdown(bodyMarkdown);
      if (derived.length) {
        images.push(...derived);
      }
    }

    const contentPath = entry.contentPath || `content/${slug}.html`;
    const outPath = path.join(ROOT, contentPath);

    await ensureDir(path.dirname(outPath));
    await fs.writeFile(outPath, html, "utf8");

    const mapped = {
      id: entry.id,
      title: entry.title,
      section: entry.section,
      slug,
      type: entry.type,
      year: entry.year,
      tags: entry.tags,
      summary: entry.summary,
      images,
      featured: Boolean(entry.featured),
      pinned: Boolean(entry.pinned),
      link: entry.link,
      contentPath,
    };

    entries.push(mapped);
  }

  const sorted = sortEntries(entries);
  await ensureDir(path.dirname(OUTPUT_JSON));
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(sorted, null, 2), "utf8");

  const pinned = sorted.filter((e) => e.pinned);
  if (pinned.length > 1) {
    console.warn(
      "Multiple pinned entries found; the most recent will be used for the homepage hero.",
      pinned.map((p) => p.slug || p.id).join(", ")
    );
  }
  if (!pinned.length) {
    console.warn("No pinned entry found; homepage hero will stay empty until one is pinned.");
  }

  console.log(`Built ${sorted.length} entries.`);
}

function validateEntry(entry, filename) {
  if (!entry.id) throw new Error(`Entry missing "id" in ${filename}`);
  if (!entry.title) throw new Error(`Entry missing "title" in ${filename}`);
  if (!entry.section) throw new Error(`Entry missing "section" in ${filename}`);
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function markdownToHtml(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block
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
      if (i < lines.length) i += 1; // skip closing fence
      continue;
    }

    // Skip blank lines
    if (trimmed === "") {
      i += 1;
      continue;
    }

    // Paragraph / heading until next blank line
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

function extractImagesFromMarkdown(md) {
  const matches = [];
  const imgRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = imgRegex.exec(md)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

function renderBlock(blockText) {
  if (blockText.startsWith("### ")) {
    return `<h3>${renderInline(blockText.slice(4))}</h3>`;
  }
  if (blockText.startsWith("## ")) {
    return `<h2>${renderInline(blockText.slice(3))}</h2>`;
  }
  if (blockText.startsWith("# ")) {
    return `<h1>${renderInline(blockText.slice(2))}</h1>`;
  }
  return `<p>${renderInline(blockText).replace(/\n/g, "<br>")}</p>`;
}

function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/!\[(.*?)\]\((.+?)\)/g, (_, alt, url) => {
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

function sortEntries(items) {
  return items.slice().sort((a, b) => {
    const ay = a.year || 0;
    const by = b.year || 0;
    if (ay !== by) return by - ay;
    return (a.title || "").localeCompare(b.title || "");
  });
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
