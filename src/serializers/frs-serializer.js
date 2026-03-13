/**
 * FRS document serializer.
 * Converts an in-memory FrsDocument back to valid .md text.
 *
 * Format:
 *   ---
 *   <YAML frontmatter>
 *   ---
 *
 *   Flow:
 *   1. Step action
 *      - Condition: alternative action
 *
 *   TYPE: technical content
 */

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Assemble a complete FRS markdown string from a document object.
 * @param {{ frontmatter: object, flow: { flow: object[], technical: object[] } }} doc
 * @returns {string}
 */
export function assembleDocument(doc) {
  const parts = [];

  parts.push(serializeFrontmatter(doc.frontmatter));
  parts.push("");

  const flowText = serializeFlow(doc.flow?.flow ?? []);
  if (flowText) parts.push(flowText);

  const technicalText = serializeTechnical(doc.flow?.technical ?? []);
  if (technicalText) parts.push(technicalText);

  const validateText = serializeValidate(doc.flow?.validate ?? null);
  if (validateText) parts.push(validateText);

  return parts.join("\n").trimEnd() + "\n";
}

// ── Serializers ───────────────────────────────────────────────────────────

/** Step 1 — YAML frontmatter wrapped in --- delimiters */
export function serializeFrontmatter(fm) {
  if (typeof globalThis.jsyaml === "undefined") {
    throw new Error("js-yaml not loaded — cannot serialize frontmatter");
  }

  const cleaned = removeEmptyValues(fm);
  const yamlBody = globalThis.jsyaml.dump(cleaned, {
    indent: 2,
    lineWidth: -1,      // no line wrapping
    quotingType: '"',
    forceQuotes: false,
  }).trimEnd();

  return `---\n${yamlBody}\n---`;
}

/** Step 2 — Flow section as numbered markdown with 3-space indented alternatives */
export function serializeFlow(steps) {
  if (!steps || steps.length === 0) return "";

  const lines = ["Flow:"];
  steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step.action ?? ""}`);
    (step.alternatives ?? []).forEach((alt) => {
      lines.push(`   - ${alt.condition ?? "If"}: ${alt.action ?? ""}`);
    });
  });

  return lines.join("\n");
}

/** Step 3 — Technical sections as "TYPE: content" lines */
export function serializeTechnical(items) {
  if (!items || items.length === 0) return "";

  return items
    .filter((t) => t.type && t.content)
    .map((t) => `${t.type}: ${t.content}`)
    .join("\n");
}

/** Step 4 — Validate section as YAML */
export function serializeValidate(validate) {
  if (!validate || typeof validate !== "object") return "";

  const SUBSECTIONS = ["happy_path", "boundaries", "invariants", "contracts"];
  const hasContent = SUBSECTIONS.some((k) => Array.isArray(validate[k]) && validate[k].length > 0);
  if (!hasContent) return "";

  if (typeof globalThis.jsyaml === "undefined") {
    throw new Error("js-yaml not loaded — cannot serialize validate section");
  }

  // Build an ordered object with only populated subsections
  const ordered = {};
  for (const key of SUBSECTIONS) {
    if (Array.isArray(validate[key]) && validate[key].length > 0) {
      ordered[key] = validate[key];
    }
  }

  const dumped = globalThis.jsyaml.dump({ Validate: ordered }, {
    indent: 2,
    lineWidth: -1,
    quotingType: '"',
    forceQuotes: false,
    flowLevel: 3, // inline-style for deeply nested objects (test case values)
  }).trimEnd();

  return dumped;
}

// ── Utility ────────────────────────────────────────────────────────────────

function removeEmptyValues(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}
