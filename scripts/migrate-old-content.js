#!/usr/bin/env node
/**
 * One-off migration: convert old Markdown entries (content/entries-old)
 * into the new frontmatter shape and write them to content/entries.
 *
 * Mapping rules (per user request):
 * - title -> title
 * - short_title -> ignored
 * - date -> derive year, also keep full date in "fullDate"
 * - description -> summary (if present)
 * - publication + venue -> appended to summary
 * - category -> section
 * - tagz -> tags (comma-separated list)
 * - type -> type
 * - featured_image -> images[0] (copied to assets/uploads/old/<basename> if available)
 * - id -> filename without extension (stable)
 * - slug -> filename or slugified title
 * - featured/pinned default to false
 *
 * Images in markdown bodies are remapped to assets/uploads/old/<basename>
 * when the source file is found.
 */

const fs = require("fs/promises");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OLD_DIR = path.join(ROOT, "content", "entries-old");
const NEW_DIR = path.join(ROOT, "content", "entries");
const DEST_ASSETS_DIR = path.join(ROOT, "assets", "uploads", "old");

async function main() {
  await ensureDir(DEST_ASSETS_DIR);
  await ensureDir(NEW_DIR);

  const files = (await fs.readdir(OLD_DIR)).filter((f) => f.toLowerCase().endsWith(".md"));
  if (!files.length) {
    console.error("No old entries found in content/entries-old");
    return;
  }

  const warnings = [];

  for (const filename of files) {
    const oldPath = path.join(OLD_DIR, filename);
    const raw = await fs.readFile(oldPath, "utf8");
    const { attributes, body } = parseFrontmatter(raw);

    const id = path.basename(filename, path.extname(filename));
    const title = attributes.title || id;
    const slug = slugify(title || id || filename);

    const dateRaw = (attributes.date || "").toString().trim();
    const year = deriveYear(dateRaw);
    if (!year) {
      warnings.push(`Missing/invalid year for ${filename} (date: "${dateRaw}")`);
    }

    const summaryParts = [];
    if (attributes.description) summaryParts.push(String(attributes.description).trim());
    if (attributes.publication) summaryParts.push(String(attributes.publication).trim());
    if (attributes.venue) summaryParts.push(String(attributes.venue).trim());
    const summary = summaryParts.filter(Boolean).join(" · ");

    const tags = parseTags(attributes.tagz);
    const section = attributes.category || "";
    if (!section) {
      warnings.push(`Missing section (category) for ${filename}`);
    }

    const bodyWithImages = await remapBodyImages(body, warnings, filename);
    const images = [];
    const mappedFeatured = await mapImage(attributes.featured_image, warnings, filename);
    if (mappedFeatured) images.push(mappedFeatured);

    const fm = {
      id,
      title,
      section,
      slug,
      type: attributes.type || "",
      year: year || "",
      fullDate: dateRaw || "",
      tags,
      summary,
      images,
      featured: false,
      pinned: false,
    };

    const newContent = serializeFrontmatter(fm) + "\n" + bodyWithImages.trim() + "\n";
    const newPath = path.join(NEW_DIR, `${id}.md`);
    await fs.writeFile(newPath, newContent, "utf8");
  }

  if (warnings.length) {
    console.warn("Migration warnings:");
    warnings.forEach((w) => console.warn("- " + w));
  }

  console.log(`Migrated ${files.length} entries from entries-old to entries.`);
}

function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (!lines.length || !lines[0].trim().startsWith("---")) {
    return { attributes: {}, body: text };
  }

  let i = 1;
  const fmLines = [];
  while (i < lines.length && !lines[i].trim().startsWith("---")) {
    fmLines.push(lines[i]);
    i += 1;
  }
  const body = lines.slice(i + 1).join("\n");
  const attributes = parseYamlLike(fmLines.join("\n"));
  return { attributes, body };
}

function parseYamlLike(fm) {
  const obj = {};
  let currentKey = null;

  const lines = fm.split(/\r?\n/);
  lines.forEach((line) => {
    if (!line.trim()) return;

    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(obj[currentKey])) obj[currentKey] = [];
      obj[currentKey].push(parseScalar(listMatch[1]));
      return;
    }

    const kv = line.match(/^\s*([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) {
      const [, key, valueRaw] = kv;
      currentKey = key;
      const value = valueRaw.trim();
      if (value === "") {
        obj[key] = "";
      } else {
        obj[key] = parseScalar(value);
      }
    }
  });

  return obj;
}

function parseScalar(val) {
  const trimmed = val.trim();
  const quoted = trimmed.match(/^"(.*)"$/) || trimmed.match(/^'(.*)'$/);
  if (quoted) return quoted[1];
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (!Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveYear(dateStr) {
  if (!dateStr) return "";
  const match = dateStr.match(/^(\d{4})/);
  return match ? Number(match[1]) : "";
}

function parseTags(tagz) {
  if (!tagz) return [];
  if (Array.isArray(tagz)) return tagz.map((t) => String(t).trim()).filter(Boolean);
  return String(tagz)
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

async function remapBodyImages(body, warnings, filename) {
  const imgRegex = /!\[[^\]]*]\(([^)]+)\)/g;
  let match;
  let result = body;
  while ((match = imgRegex.exec(body)) !== null) {
    const original = match[1];
    const mapped = await mapImage(original, warnings, filename);
    if (mapped && mapped !== original) {
      result = result.replace(original, mapped);
    }
  }
  return result;
}

async function mapImage(imgPath, warnings, filename) {
  if (!imgPath) return "";
  const cleaned = String(imgPath).trim().replace(/^['"]|['"]$/g, "");
  const base = path.basename(cleaned.split("?")[0]);
  if (!base) return "";

  const destRel = `assets/uploads/old/${base}`;
  const destAbs = path.join(ROOT, destRel);

  // If already exists in destination, just return mapped path.
  if (await exists(destAbs)) {
    return destRel;
  }

  // Try a few likely source locations.
  const candidates = [
    path.join(ROOT, cleaned.replace(/^\//, "")),
    path.join(OLD_DIR, base),
    path.join(ROOT, "assets", "uploads", base),
    path.join(ROOT, "assets", base),
    path.join(ROOT, base),
  ];

  for (const src of candidates) {
    if (await exists(src)) {
      await ensureDir(path.dirname(destAbs));
      await fs.copyFile(src, destAbs);
      return destRel;
    }
  }

  warnings.push(`Image not found for ${filename}: ${cleaned}`);
  return destRel; // Return mapped path even if missing, so paths are consistent.
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function serializeFrontmatter(obj) {
  const lines = ["---"];
  const entries = Object.entries(obj);
  entries.forEach(([key, val]) => {
    if (Array.isArray(val)) {
      lines.push(`${key}:`);
      val.forEach((v) => lines.push(`  - ${escapeScalar(v)}`));
    } else {
      lines.push(`${key}: ${escapeScalar(val)}`);
    }
  });
  lines.push("---");
  return lines.join("\n");
}

function escapeScalar(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str === "") return "";
  if (/[:#\n]/.test(str)) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
