#!/usr/bin/env node
/**
 * Refresh Decap "type" and "tags" select options based on existing entries.
 *
 * - Reads all frontmatter in content/entries/*.md
 * - Collects unique type + tag values (case-insensitive)
 * - Rewrites the options blocks wrapped by the markers in admin/config.yml:
 *     # BEGIN_AUTO_TYPE_OPTIONS ... # END_AUTO_TYPE_OPTIONS
 *     # BEGIN_AUTO_TAG_OPTIONS  ... # END_AUTO_TAG_OPTIONS
 *
 * Run this before starting a new Decap UI session to keep dropdowns in sync:
 *   node scripts/refresh-decap-options.js && npx decap-server
 */
const fs = require("fs/promises");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENTRIES_DIR = path.join(ROOT, "content", "entries");
const CONFIG_PATH = path.join(ROOT, "admin", "config.yml");

const TYPE_MARKER_START = "# BEGIN_AUTO_TYPE_OPTIONS";
const TYPE_MARKER_END = "# END_AUTO_TYPE_OPTIONS";
const TAG_MARKER_START = "# BEGIN_AUTO_TAG_OPTIONS";
const TAG_MARKER_END = "# END_AUTO_TAG_OPTIONS";

async function main() {
  const { types, tags } = await collectOptions();

  const config = await fs.readFile(CONFIG_PATH, "utf8");
  let next = replaceSection(
    config,
    TYPE_MARKER_START,
    TYPE_MARKER_END,
    formatOptions(types)
  );
  next = replaceSection(next, TAG_MARKER_START, TAG_MARKER_END, formatOptions(tags));

  await fs.writeFile(CONFIG_PATH, ensureTrailingNewline(next), "utf8");

  console.log(
    `Updated Decap options: ${types.length} types, ${tags.length} tags written to admin/config.yml`
  );
}

async function collectOptions() {
  const files = (await fs.readdir(ENTRIES_DIR)).filter((f) =>
    f.toLowerCase().endsWith(".md")
  );

  const types = new Map();
  const tags = new Map();

  for (const file of files) {
    const fullPath = path.join(ENTRIES_DIR, file);
    const raw = await fs.readFile(fullPath, "utf8");
    const { attributes, body } = parseFrontmatter(raw);

    const cleaned = { ...attributes };
    let changed = false;

    if (attributes.newType !== undefined) {
      const cleanedType = String(attributes.newType || "").trim();
      if (cleanedType) cleaned.type = cleanedType;
      delete cleaned.newType;
      changed = true;
    }

    const mergedTags = dedupe([
      ...(Array.isArray(attributes.tags) ? attributes.tags : []),
      ...parseNewTags(attributes.newTags),
    ]);
    if (mergedTags.length !== (attributes.tags || []).length || attributes.newTags) {
      cleaned.tags = mergedTags;
      delete cleaned.newTags;
      changed = true;
    }

    if (changed) {
      await writeEntry(fullPath, cleaned, body);
    }

    addUnique(types, cleaned.type);
    (cleaned.tags || []).forEach((tag) => addUnique(tags, tag));
  }

  return {
    types: sortValues(types),
    tags: sortValues(tags),
  };
}

function parseNewTags(value) {
  if (!value && value !== 0) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  return String(value)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  list.forEach((t) => {
    const trimmed = String(t || "").trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  });
  return out;
}

async function writeEntry(filePath, attributes, body) {
  const fm = serializeFrontmatter(attributes);
  const content = `${fm}\n${body || ""}`;
  await fs.writeFile(filePath, content, "utf8");
}

function serializeFrontmatter(obj) {
  const lines = [];
  const keys = Object.keys(obj);
  keys.forEach((key) => {
    const val = obj[key];
    if (val === undefined) return;

    if (Array.isArray(val)) {
      lines.push(`${key}:`);
      val.forEach((item) => {
        lines.push(`  - ${formatScalar(item)}`);
      });
      return;
    }

    lines.push(`${key}: ${formatScalar(val)}`);
  });

  return ["---", ...lines, "---"].join("\n");
}

function formatScalar(val) {
  if (val === null) return '""';
  if (typeof val === "boolean" || typeof val === "number") return String(val);
  return JSON.stringify(String(val));
}

function addUnique(map, value) {
  if (!value && value !== 0) return;
  const trimmed = String(value).trim();
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined") return;
  const key = lower;
  if (!map.has(key)) {
    map.set(key, trimmed);
  }
}

function sortValues(map) {
  return Array.from(map.values()).sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" })
  );
}

function formatOptions(values) {
  if (!values.length) return ["options: []"];
  return ["options:", ...values.map((v) => `  - ${yamlSafe(v)}`)];
}

function yamlSafe(value) {
  const escaped = String(value).replace(/"/g, '\\"');
  // Always quote to avoid YAML surprises with punctuation or numerics.
  return `"${escaped}"`;
}

function replaceSection(content, startToken, endToken, newLines) {
  const lines = content.split(/\r?\n/);
  const startIdx = lines.findIndex((line) => line.includes(startToken));
  const endIdx = lines.findIndex((line) => line.includes(endToken));

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`Could not find markers ${startToken} / ${endToken} in config.yml`);
  }

  const indent = (lines[startIdx].match(/^(\s*)/) || ["", ""])[1];
  const indented = newLines.map((ln) => (ln ? `${indent}${ln}` : indent));

  const updated = [
    ...lines.slice(0, startIdx + 1),
    ...indented,
    ...lines.slice(endIdx),
  ];

  return updated.join("\n");
}

function ensureTrailingNewline(str) {
  return str.endsWith("\n") ? str : `${str}\n`;
}

// Frontmatter parsing (lightweight YAML-like parser reused from build-content.js)
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
        const hasOpenQuote =
          startsWithQuote(trimmedValue) && !endsWithMatchingQuote(trimmedValue);
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
