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
  const entryFiles = files.filter((f) => f.toLowerCase().endsWith(".md"));

  if (!entryFiles.length) {
    console.warn("No .md entries found in content/entries.");
  }

  const entries = [];
  const generatedPaths = [];

  for (const filename of entryFiles) {
    const filePath = path.join(ENTRIES_DIR, filename);
    const raw = await fs.readFile(filePath, "utf8");
    const { attributes, body } = parseFrontmatter(raw);
    const entry = attributes;

    if (!entry) {
      throw new Error(`Could not parse frontmatter in ${filename}`);
    }

    validateEntry(entry, filename);

    const slug = slugify(entry.slug || entry.title || entry.id);
    const bodyMarkdown = body || "";
    const html = markdownToHtml(bodyMarkdown);

    const fullDate = entry.fullDate ? String(entry.fullDate) : "";
    const derivedYear = entry.year || deriveYear(fullDate);

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
    generatedPaths.push(path.resolve(outPath));

    const mapped = {
      id: entry.id,
      title: entry.title,
      section: entry.section,
      slug,
      type: entry.type,
      year: derivedYear,
      fullDate: fullDate || undefined,
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

  await removeStaleContentFiles(generatedPaths);

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
    const { url } = parseImageTarget(m[1]);
    if (url) {
      matches.push(url);
    }
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

function parseImageTarget(target) {
  const trimmed = String(target || "").trim();
  const withTitle = trimmed.match(/^(\S+)(?:\s+"(.*)")?$/);
  if (withTitle) {
    return { url: withTitle[1], title: withTitle[2] || "" };
  }

  const [url = "", ...rest] = trimmed.split(/\s+/);
  return { url, title: rest.join(" ").trim() };
}

function sortEntries(items) {
  return items.slice().sort((a, b) => {
    const ad = dateValue(a);
    const bd = dateValue(b);
    if (ad !== bd) return (bd ?? -Infinity) - (ad ?? -Infinity);
    return (a.title || "").localeCompare(b.title || "");
  });
}

function dateValue(item) {
  const ts = toTimestamp(item.fullDate);
  if (ts !== null) return ts;

  if (item.year) {
    const fallback = Date.parse(`${item.year}-01-01T00:00:00Z`);
    if (!Number.isNaN(fallback)) return fallback;
  }

  return null;
}

function toTimestamp(fullDate) {
  if (!fullDate) return null;
  const trimmed = String(fullDate).trim();
  if (!trimmed) return null;

  const withT = trimmed.includes("T") ? trimmed : trimmed.replace(/\s+/, "T");
  const hasTime = withT.includes("T");
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(withT);
  const iso = hasZone ? withT : `${withT}${hasTime ? "Z" : "T00:00:00Z"}`;

  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? null : ts;
}

function deriveYear(fullDate) {
  const match = String(fullDate || "").trim().match(/^(\d{4})/);
  if (!match) return undefined;
  const yearNum = Number(match[1]);
  return Number.isNaN(yearNum) ? undefined : yearNum;
}

function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (!lines.length || !lines[0].trim().startsWith("---")) {
    return { attributes: {}, body: text };
  }

  let i = 1;
  const frontmatterLines = [];
  while (i < lines.length && !lines[i].trim().startsWith("---")) {
    frontmatterLines.push(lines[i]);
    i += 1;
  }

  const body = lines.slice(i + 1).join("\n");
  const attributes = parseYamlLike(frontmatterLines.join("\n"));
  return { attributes, body };
}

function parseYamlLike(fm) {
  const obj = {};
  let currentKey = null;
  let multilineKey = null;

  const lines = fm.split(/\r?\n/);
  lines.forEach((line) => {
    if (!line.trim()) return;

    // Continuation of a multiline scalar (indented lines)
    if (multilineKey && /^\s+/.test(line)) {
      obj[multilineKey] = `${obj[multilineKey]} ${line.trim()}`.trim();
      if (endsWithMatchingQuote(obj[multilineKey])) {
        obj[multilineKey] = stripEnclosingQuotes(obj[multilineKey]);
        multilineKey = null;
      }
      return;
    }

    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(obj[currentKey])) obj[currentKey] = [];
      obj[currentKey].push(parseScalar(listMatch[1]));
      return;
    }

    // Continuation of a scalar without quotes (indented line)
    if (/^\s+/.test(line) && currentKey && typeof obj[currentKey] === "string") {
      obj[currentKey] = `${obj[currentKey]} ${line.trim()}`.trim();
      return;
    }

    const kv = line.match(/^\s*([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) {
      const [, key, valueRaw] = kv;
      currentKey = key;
      if (valueRaw === "") {
        obj[key] = [];
      } else {
        const trimmedValue = valueRaw.trim();
        const hasOpenQuote = startsWithQuote(trimmedValue) && !endsWithMatchingQuote(trimmedValue);
        obj[key] = hasOpenQuote ? trimmedValue : parseScalar(trimmedValue);
        if (hasOpenQuote) {
          multilineKey = key;
        } else {
          multilineKey = null;
        }
      }
    }
  });

  if (multilineKey && typeof obj[multilineKey] === "string") {
    obj[multilineKey] = stripEnclosingQuotes(obj[multilineKey]);
  }

  return obj;
}

function parseScalar(val) {
  const trimmed = val.trim();

  if (isQuoted(trimmed)) return stripEnclosingQuotes(trimmed);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (!Number.isNaN(Number(trimmed)) && trimmed !== "") return Number(trimmed);

  return trimmed;
}

function isQuoted(str) {
  return startsWithQuote(str) && endsWithMatchingQuote(str);
}

function startsWithQuote(str) {
  return /^['"]/.test(str);
}

function endsWithMatchingQuote(str) {
  if (!str || str.length < 2) return false;
  const first = str[0];
  return (first === '"' || first === "'") && str[str.length - 1] === first;
}

function stripEnclosingQuotes(str) {
  if (isQuoted(str)) {
    return str.slice(1, -1);
  }
  return str;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function removeStaleContentFiles(keepPaths) {
  const keep = new Set(keepPaths.map((p) => path.resolve(p)));

  const files = await fs.readdir(OUTPUT_CONTENT_DIR);

  for (const file of files) {
    const full = path.join(OUTPUT_CONTENT_DIR, file);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) continue;
    if (!file.toLowerCase().endsWith(".html")) continue;

    if (!keep.has(path.resolve(full))) {
      await fs.unlink(full);
      console.log(`Removed stale content file: ${file}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
