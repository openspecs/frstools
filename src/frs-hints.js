/**
 * FRS Spec Hints
 * Fetches the FRS README on load and extracts field/section descriptions
 * via regex for use as (i) tooltips throughout the editor and preview.
 *
 * Key scheme:
 *   - Frontmatter fields:  the field name  e.g. "id", "user_outcome"
 *   - Section headers:     "flow", "technical", "validate"
 *   - Technical types:     the type name  e.g. "API", "Rule"
 *   - Validate subsections: the subsection name e.g. "happy_path", "contracts"
 */

const README_URL =
  "https://raw.githubusercontent.com/openspecs/frs/main/README.md";

// ── Fallback hints (used if fetch fails or while loading) ─────────────────

const FALLBACK = {
  // Frontmatter — section 3
  id:               "Unique identifier for the requirement",
  user:             "Role or actor performing the action",
  context:          "Location or state where the user begins",
  trigger:          "Event or action that initiates the flow",
  user_outcome:     "What the user achieves",
  business_outcome: "Measurable business value",
  priority:         "Importance level",
  status:           "Current state",
  estimate:         "Time estimate",
  depends_on:       "Array of requirement IDs",
  tags:             "Array of categorization labels",

  // Section headers — kept verbose
  flow:       "Numbered steps represent the happy path \u2014 the primary success scenario. " +
              "Indented dash lines (3 spaces) represent alternative paths for error handling and edge cases.",
  technical:  "Optional sections after the Flow. Each provides a specific type of implementation constraint. " +
              "Supported types: API, Performance, Security, Data, Rule.",
  validate:   "Machine-executable verification criteria that form a closed loop with the Flow. " +
              "Together, Flow and Validate let any implementation be verified against original intent.",

  // Technical types — section 4.3
  API:         "Endpoint signatures",
  Performance: "Speed requirements",
  Security:    "Auth requirements",
  Data:        "Storage requirements",
  Rule:        "Business constraints",

  // Validate subsections — section 4.4
  happy_path: "defines input/output pairs that validate the numbered Flow steps.",
  boundaries: "defines test cases at the edges of acceptable input ranges.",
  invariants: "defines conditions that MUST hold true for all possible inputs.",
  contracts:  "defines mathematical or logical relationships between inputs and outputs.",
};

// ── HTML helper ──────────────────────────────────────────────────────────

/**
 * Returns an inline (i) tooltip span for the given key,
 * or an empty string if no hint exists for that key.
 */
export function hintIcon(key) {
  const hint = getHint(key);
  if (!hint) return "";
  const safe = hint
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<span class="hint-tip" tabindex="0" aria-label="${safe}"><span class="hint-tip__icon">ⓘ</span><span class="hint-tip__bubble" role="tooltip">${safe}</span></span>`;
}

// ── Live state ────────────────────────────────────────────────────────────

let _hints = null; // null = not yet loaded; use FALLBACK in the meantime

/**
 * Returns the hint string for the given key, or null if none is available.
 * Always returns instantly (from cache or fallback).
 */
export function getHint(key) {
  return (_hints ?? FALLBACK)[key] ?? FALLBACK[key] ?? null;
}

/**
 * Fetch the README and parse hints into the module cache.
 * Safe to call multiple times; only fetches once.
 * Resolves when hints are ready (or falls back silently on error).
 */
export async function loadHints() {
  if (_hints !== null) return;
  try {
    const res = await fetch(README_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    _hints = { ...FALLBACK, ...parseHints(md) };
  } catch (err) {
    console.warn("[frs-hints] Could not load spec README, using fallback hints.", err.message);
    _hints = { ...FALLBACK };
  }
}

// ── Parser ────────────────────────────────────────────────────────────────

function parseHints(md) {
  const hints = {};

  // 1. Frontmatter field table rows (sections 3.1 and 3.2)
  //    | `field` | Description text | Example |
  const fmSection = md.match(/##\s+3[.\s][\s\S]*?(?=\n##\s+\d)/)?.[0] ?? "";
  const fieldRe = /\|\s*`([\w_]+)`\s*\|\s*([^|\n]+?)\s*\|/g;
  for (const m of fmSection.matchAll(fieldRe)) {
    const key  = m[1].trim();
    const desc = m[2].trim();
    if (key && desc && desc !== "Field" && desc !== "Description" && desc !== "---") {
      hints[key] = desc;
    }
  }

  // 2. Optional technical sections table (section 4.3)
  //    | `Section:` | Purpose text | Example |
  const techSection = md.match(/###\s+4\.3[\s\S]*?(?=###\s+4\.4|##\s+\d)/)?.[0] ?? "";
  const techRe = /\|\s*`([A-Z][a-zA-Z]+):?`\s*\|\s*([^|\n]+?)\s*\|/g;
  for (const m of techSection.matchAll(techRe)) {
    const key  = m[1].trim();  // API, Performance, etc.
    const desc = m[2].trim();
    if (key && desc && desc !== "Section" && desc !== "Purpose" && desc !== "---") {
      hints[key] = desc;
    }
  }

  // 3. Validate subsection first sentences (sections 4.4.1 – 4.4.4)
  //    #### 4.4.1 happy_path\n\nThe `happy_path` subsection defines ...
  const validateRe = /####\s+4\.4\.\d+\s+(\w+)[\s\S]*?The\s+`\w+`\s+subsection\s+([^.\n]+\.)/g;
  for (const m of md.matchAll(validateRe)) {
    const key  = m[1].trim();
    // Strip markdown backticks from description
    const desc = m[2].replace(/`([^`]+)`/g, "$1").trim();
    if (key && desc) hints[key] = desc;
  }

  return hints;
}
