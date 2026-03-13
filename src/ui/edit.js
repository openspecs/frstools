/**
 * TOOL-EDIT-001
 * Guided edit form for FRS documents.
 *   1. Frontmatter form generated from frs-schema.json
 *   2. "Add Custom Field" inline prompt
 *   3. Flow steps as draggable cards with inline action editing
 *   4. "Add Step", "Delete step", "Add Alternative" per card
 *   5. Condition prefix select + text per alternative
 *   6. Drag-to-reorder with auto-renumber
 *   7. Technical sections as key-value rows
 *   8. Live validation badge (debounced 200 ms)
 */

import { getState, setWorkingDocument } from "../state.js";
import { validateFrontmatter } from "../validators/schema-validator.js";
import { renderPreview } from "./preview.js";
import { hintIcon } from "../frs-hints.js";

// ── Module state ──────────────────────────────────────────────────────────

let editSteps = [];
let editTechnicals = [];
let editValidate = { happy_path: [], boundaries: [], invariants: [], contracts: [] };
let draggingIdx = null;
let validationTimer = null;

const CONDITION_OPTIONS = ["If", "When", "On error", "On timeout", "On success"];
const TECHNICAL_TYPES = ["API", "Performance", "Security", "Data", "Rule"];

// Schema field display order (also controls form render order)
// id/priority/status are first and rendered in a 3-column compact group
const SCHEMA_FIELD_ORDER = [
  "id", "priority", "status",
  "user", "context", "trigger", "user_outcome",
  "business_outcome", "estimate", "depends_on", "tags",
];

const COMPACT_3COL_KEYS = new Set(["id", "priority", "status"]);

// ── Public API ────────────────────────────────────────────────────────────

export function renderEdit(doc) {
  const panel = document.getElementById("tab-edit");
  if (!panel) return;

  editSteps = deepClone(doc.flow?.flow ?? []);
  editTechnicals = deepClone(doc.flow?.technical ?? []);
  editValidate = deepClone(doc.flow?.validate ?? { happy_path: [], boundaries: [], invariants: [], contracts: [] });

  const schema = getState().schema;
  const fm = doc.frontmatter ?? {};
  const schemaKeys = new Set(
    schema ? Object.keys(schema.properties ?? {}) : SCHEMA_FIELD_ORDER,
  );
  const customFields = Object.keys(fm)
    .filter((k) => !schemaKeys.has(k))
    .map((k) => ({ key: k, value: fm[k] }));

  panel.innerHTML = buildEditHtml(fm, schema, customFields);
  attachEditListeners(panel);
  runValidation(panel);
}

/** Returns the current document assembled from form state. Used by export module. */
export function getEditDoc() {
  const panel = document.getElementById("tab-edit");
  return collectDoc(panel);
}

// ── HTML builders ──────────────────────────────────────────────────────────

function buildEditHtml(fm, schema, customFields) {
  return `
    <img src="./static/frontend_bear.png" alt="Frontend Bear" class="tab-mascot" />
    <div class="edit-status-bar">
      <span id="editValidationBadge" class="status-badge status-badge--ok">Valid</span>
    </div>
    ${buildFrontmatterSection(fm, schema, customFields)}
    ${buildStepsSection()}
    ${buildTechnicalSection()}
    ${buildValidateEditSection()}
    <div class="edit-export-row">
      <button id="editExportBtn" class="btn">Export .md</button>
    </div>`;
}

// ── 1. Frontmatter form ───────────────────────────────────────────────────

function buildFrontmatterSection(fm, schema, customFields) {
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? ["id", "user", "context", "trigger", "user_outcome"]);
  const orderedKeys = [
    ...SCHEMA_FIELD_ORDER.filter((k) => props[k] || fm[k] !== undefined),
    ...Object.keys(props).filter((k) => !SCHEMA_FIELD_ORDER.includes(k)),
  ];

  // Split: compact 3-col group vs normal stack
  const compactKeys = orderedKeys.filter((k) => COMPACT_3COL_KEYS.has(k));
  const normalKeys  = orderedKeys.filter((k) => !COMPACT_3COL_KEYS.has(k));

  const compactRows = compactKeys.map((key) => {
    const def = props[key] ?? {};
    const value = fm[key] ?? def.default ?? "";
    return buildFieldRow(key, value, def, required.has(key));
  }).join("");

  const normalRows = normalKeys.map((key) => {
    const def = props[key] ?? {};
    const value = fm[key] ?? def.default ?? "";
    return buildFieldRow(key, value, def, required.has(key));
  }).join("");

  const customRows = customFields.map((cf) => buildCustomFieldRow(cf.key, cf.value)).join("");

  return `
    <section class="edit-section">
      <h3 class="edit-section-title">Header</h3>
      <div class="fm-fields">
        ${compactKeys.length ? `<div class="fm-row-group--3col">${compactRows}</div>` : ""}
        <div class="edit-section-divider"></div>
        ${normalRows}
      </div>
      <div class="fm-custom-fields">${customRows}</div>
      <div id="customFieldPrompt" class="add-custom-prompt" hidden>
        <input id="customFieldKey" class="edit-input" placeholder="Field name" autocomplete="off">
        <select id="customFieldType" class="edit-select">
          <option value="text">text</option>
          <option value="array">array</option>
        </select>
        <button id="customFieldConfirm" class="btn btn--sm">Add</button>
        <button id="customFieldCancel" class="btn btn--sm btn--ghost">Cancel</button>
        <span id="customFieldError" class="field-error" hidden></span>
      </div>
      <button id="addCustomFieldBtn" class="btn btn--sm btn--top-gap">+ Custom field</button>
    </section>`;
}

function buildFieldRow(key, value, def, required) {
  const label = key.replace(/_/g, " ");
  const req = required ? `<span class="req-star" title="Required">*</span>` : "";
  const hint = hintIcon(key);
  const inputHtml = buildFieldInput(key, value, def, required);
  return `
    <div class="fm-row" data-fm-key="${esc(key)}">
      <label class="fm-label" for="fm-${esc(key)}">${esc(label)}${req}${hint}</label>
      <div class="fm-control">${inputHtml}</div>
      <div class="fm-error field-error" id="fm-err-${esc(key)}" hidden></div>
    </div>`;
}

function buildFieldInput(key, value, def, required) {
  // Enum → select
  if (Array.isArray(def.enum)) {
    const opts = ["", ...def.enum]
      .map((v) => `<option value="${esc(v)}"${value === v ? " selected" : ""}>${esc(v) || "—"}</option>`)
      .join("");
    return `<select class="edit-select" id="fm-${esc(key)}" data-fm-field="${esc(key)}" data-required="${required}">${opts}</select>`;
  }
  // Array → tag input
  if (def.type === "array") {
    const values = Array.isArray(value) ? value : (value ? [value] : []);
    return buildTagInput(key, values);
  }  // Long narrative fields → textarea
  if (key === "user_outcome" || key === "business_outcome") {
    const val = Array.isArray(value) ? value.join(", ") : (value ?? "");
    return `<textarea class="edit-input edit-textarea" id="fm-${esc(key)}" data-fm-field="${esc(key)}" data-required="${required}" rows="3">${esc(String(val))}</textarea>`;
  }  // Default → text input
  const val = Array.isArray(value) ? value.join(", ") : (value ?? "");
  return `<input class="edit-input" id="fm-${esc(key)}" data-fm-field="${esc(key)}" data-required="${required}" value="${esc(String(val))}" autocomplete="off">`;
}

function buildTagInput(key, values) {
  const pills = values
    .map((v) => `<span class="tag-pill" data-value="${esc(v)}">${esc(v)}<button class="tag-pill-remove" data-field="${esc(key)}" data-value="${esc(v)}" aria-label="Remove ${esc(v)}">×</button></span>`)
    .join("");
  return `
    <div class="tag-input" data-field="${esc(key)}" data-fm-field="${esc(key)}">
      ${pills}
      <input class="tag-text-input" id="fm-${esc(key)}" data-field="${esc(key)}" placeholder="add value, press Enter" autocomplete="off">
    </div>`;
}

function buildCustomFieldRow(key, value) {
  const displayVal = Array.isArray(value) ? value.join(", ") : (value ?? "");
  return `
    <div class="fm-row custom-field-row">
      <label class="fm-label"><input class="edit-input custom-field-key" name="custom-field-key" value="${esc(key)}" placeholder="field name"></label>
      <div class="fm-control"><input class="edit-input custom-field-val" name="custom-field-val-${esc(key)}" value="${esc(String(displayVal))}" placeholder="value"></div>
      <button class="btn-icon remove-custom-field" title="Remove field">✕</button>
    </div>`;
}

// ── 3-6. Flow steps ───────────────────────────────────────────────────────

function buildStepsSection() {
  return `
    <section class="edit-section">
      <h3 class="edit-section-title">Flow${hintIcon("flow")}</h3>
      <div id="stepsList" class="steps-list">${buildStepCards()}</div>
      <button id="addStepBtn" class="btn btn--sm btn--top-gap">+ Add step</button>
    </section>`;
}

function buildStepCards() {
  return editSteps.map((step, i) => buildStepCard(step, i)).join("");
}

function buildStepCard(step, index) {
  const altsHtml = (step.alternatives ?? [])
    .map((alt, ai) => buildAltRow(alt, index, ai))
    .join("");
  return `
    <div class="step-card" draggable="true" data-step-idx="${index}">
      <div class="step-card-header">
        <span class="drag-handle" aria-hidden="true">⠿</span>
        <span class="step-card-num">${index + 1}.</span>
        <textarea class="step-action edit-textarea" name="step-action-${index}" data-step-idx="${index}" rows="2">${esc(step.action ?? "")}</textarea>
        <button class="btn-icon step-delete" data-step-idx="${index}" title="Delete step">✕</button>
      </div>
      <div class="step-alts" data-step-idx="${index}">${altsHtml}</div>
      <button class="btn btn--sm add-alt-btn" data-step-idx="${index}">+ Alternative</button>
    </div>`;
}

function buildAltRow(alt, stepIdx, altIdx) {
  const condOpts = CONDITION_OPTIONS
    .map((c) => `<option${alt.condition?.startsWith(c) ? " selected" : ""}>${esc(c)}</option>`)
    .join("");
  return `
    <div class="alt-row" data-step-idx="${stepIdx}" data-alt-idx="${altIdx}">
      <select class="edit-select alt-cond-select" name="step-${stepIdx}-alt-${altIdx}-cond" data-step-idx="${stepIdx}" data-alt-idx="${altIdx}">${condOpts}</select>
      <input class="edit-input alt-action-input" name="step-${stepIdx}-alt-${altIdx}-action" data-step-idx="${stepIdx}" data-alt-idx="${altIdx}" value="${esc(alt.action ?? "")}" placeholder="consequence">
      <button class="btn-icon alt-delete" data-step-idx="${stepIdx}" data-alt-idx="${altIdx}" title="Remove alternative">✕</button>
    </div>`;
}

// ── 7. Technical section ──────────────────────────────────────────────────

function buildTechnicalSection() {
  const rows = editTechnicals.map((t, i) => buildTechnicalRow(t, i)).join("");
  return `
    <section class="edit-section">
      <h3 class="edit-section-title">Technical${hintIcon("technical")}</h3>
      <div id="technicalList" class="technical-list">${rows}</div>
      <button id="addTechnicalBtn" class="btn btn--sm btn--top-gap">+ Add technical</button>
    </section>`;
}

function buildTechnicalRow(t, index) {
  const typeOpts = TECHNICAL_TYPES
    .map((type) => `<option value="${type}"${t.type === type ? " selected" : ""}>${type}</option>`)
    .join("");
  return `
    <div class="technical-row" data-tech-idx="${index}">
      <select class="edit-select tech-type-select" name="tech-type-${index}" data-tech-idx="${index}">${typeOpts}</select>      ${hintIcon(t.type)}      <input class="edit-input tech-content-input" name="tech-content-${index}" data-tech-idx="${index}" value="${esc(t.content ?? "")}" placeholder="description">
      <button class="btn-icon tech-delete" data-tech-idx="${index}" title="Remove">✕</button>
    </div>`;
}
// ── 8. Validate section ────────────────────────────────────────────────────────

function validateSubYaml(items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  if (typeof globalThis.jsyaml === "undefined") return "";
  return globalThis.jsyaml.dump(items, { indent: 2, lineWidth: -1 }).trimEnd();
}

function buildValidateEditSection() {
  const v = editValidate;
  const yaml = typeof globalThis.jsyaml !== "undefined";

  const hpVal = esc(yaml ? validateSubYaml(v.happy_path) : "");
  const bVal  = esc(yaml ? validateSubYaml(v.boundaries) : "");
  const invVal = esc((v.invariants ?? []).join("\n"));
  const conVal = esc((v.contracts ?? []).join("\n"));

  return `
    <section class="edit-section">
      <h3 class="edit-section-title">Validate${hintIcon("validate")}</h3>
      <div class="validate-edit-grid">
        <div class="validate-edit-sub">
          <label class="validate-edit-label" for="validateHappyPath">happy_path${hintIcon("happy_path")} <span class="validate-edit-hint">(YAML — alternating input/expect items)</span></label>
          <textarea id="validateHappyPath" class="edit-textarea validate-edit-ta" rows="5" placeholder="- input: {key: value}&#10;- expect: {key: value}">${hpVal}</textarea>
        </div>
        <div class="validate-edit-sub">
          <label class="validate-edit-label" for="validateBoundaries">boundaries${hintIcon("boundaries")} <span class="validate-edit-hint">(YAML — alternating input/expect items)</span></label>
          <textarea id="validateBoundaries" class="edit-textarea validate-edit-ta" rows="5" placeholder="- input: {key: value}&#10;- expect: {key: value}">${bVal}</textarea>
        </div>
        <div class="validate-edit-sub">
          <label class="validate-edit-label" for="validateInvariants">invariants${hintIcon("invariants")} <span class="validate-edit-hint">(one per line)</span></label>
          <textarea id="validateInvariants" class="edit-textarea validate-edit-ta" rows="4" placeholder="Session token must never be returned on failed auth">${invVal}</textarea>
        </div>
        <div class="validate-edit-sub">
          <label class="validate-edit-label" for="validateContracts">contracts${hintIcon("contracts")} <span class="validate-edit-hint">(one per line)</span></label>
          <textarea id="validateContracts" class="edit-textarea validate-edit-ta" rows="4" placeholder="Output token expiry must equal current_time + 8 hours ± 5 seconds">${conVal}</textarea>
        </div>
      </div>
    </section>`;
}

function collectValidate(panel) {
  const parseYamlTA = (id) => {
    const ta = panel?.querySelector(`#${id}`);
    const text = ta?.value?.trim();
    if (!text) return [];
    try {
      const result = globalThis.jsyaml?.load(text);
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  };

  const parseLines = (id) => {
    const ta = panel?.querySelector(`#${id}`);
    return (ta?.value ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  };

  return {
    happy_path: parseYamlTA("validateHappyPath"),
    boundaries: parseYamlTA("validateBoundaries"),
    invariants: parseLines("validateInvariants"),
    contracts:  parseLines("validateContracts"),
  };
}
// ── Event listeners ───────────────────────────────────────────────────────

function attachEditListeners(panel) {
  // Live validation on any input
  panel.addEventListener("input", () => scheduleValidation(panel));
  panel.addEventListener("change", () => scheduleValidation(panel));

  // Export from edit tab
  panel.querySelector("#editExportBtn")?.addEventListener("click", () => {
    import("./export.js").then(({ triggerExport }) => triggerExport());
  });

  // Required field blur validation
  panel.addEventListener("blur", (e) => {
    const field = e.target.closest("[data-required='true']");
    if (!field) return;
    const key = field.dataset.fmField;
    const errEl = panel.querySelector(`#fm-err-${key}`);
    if (!errEl) return;
    const isEmpty = field.tagName === "SELECT"
      ? !field.value
      : !field.value.trim();
    if (isEmpty) {
      errEl.textContent = `${key.replace(/_/g, " ")} is required`;
      errEl.hidden = false;
    } else {
      errEl.hidden = true;
    }
  }, true);

  // Tag input — add tag
  panel.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== ",") return;
    const input = e.target.closest(".tag-text-input");
    if (!input) return;
    e.preventDefault();
    const val = input.value.replace(/,/g, "").trim();
    if (!val) return;
    const fieldKey = input.dataset.field;
    addTag(panel, fieldKey, val);
    input.value = "";
    scheduleValidation(panel);
  });

  // Tag input — remove pill
  panel.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".tag-pill-remove");
    if (!removeBtn) return;
    removeBtn.closest(".tag-pill").remove();
    scheduleValidation(panel);
  });

  // Step: inline action edit
  panel.addEventListener("input", (e) => {
    const ta = e.target.closest(".step-action");
    if (!ta) return;
    const idx = Number(ta.dataset.stepIdx);
    editSteps[idx].action = ta.value;
  });

  // Step: alt condition select
  panel.addEventListener("change", (e) => {
    const sel = e.target.closest(".alt-cond-select");
    if (!sel) return;
    const si = Number(sel.dataset.stepIdx);
    const ai = Number(sel.dataset.altIdx);
    editSteps[si].alternatives[ai].condition = sel.value;
  });

  // Step: alt action input
  panel.addEventListener("input", (e) => {
    const inp = e.target.closest(".alt-action-input");
    if (!inp) return;
    const si = Number(inp.dataset.stepIdx);
    const ai = Number(inp.dataset.altIdx);
    editSteps[si].alternatives[ai].action = inp.value;
  });

  // Delete step
  panel.addEventListener("click", (e) => {
    const btn = e.target.closest(".step-delete");
    if (!btn) return;
    const idx = Number(btn.dataset.stepIdx);
    editSteps.splice(idx, 1);
    rerenderSteps(panel);
    scheduleValidation(panel);
  });

  // Add step
  panel.querySelector("#addStepBtn")?.addEventListener("click", () => {
    editSteps.push({ step: editSteps.length + 1, action: "", alternatives: [] });
    rerenderSteps(panel);
    // Focus new step's textarea
    const cards = panel.querySelectorAll(".step-card");
    cards[cards.length - 1]?.querySelector(".step-action")?.focus();
  });

  // Add alternative
  panel.addEventListener("click", (e) => {
    const btn = e.target.closest(".add-alt-btn");
    if (!btn) return;
    const idx = Number(btn.dataset.stepIdx);
    editSteps[idx].alternatives = editSteps[idx].alternatives ?? [];
    editSteps[idx].alternatives.push({ condition: "If", action: "" });
    rerenderSteps(panel);
    // Focus the new alt action input
    const stepCard = panel.querySelector(`.step-card[data-step-idx="${idx}"]`);
    const altInputs = stepCard?.querySelectorAll(".alt-action-input");
    altInputs?.[altInputs.length - 1]?.focus();
  });

  // Delete alternative
  panel.addEventListener("click", (e) => {
    const btn = e.target.closest(".alt-delete");
    if (!btn) return;
    const si = Number(btn.dataset.stepIdx);
    const ai = Number(btn.dataset.altIdx);
    editSteps[si].alternatives.splice(ai, 1);
    rerenderSteps(panel);
  });

  // ── Drag-to-reorder steps ───────────────────────────────────────────────
  const stepsList = panel.querySelector("#stepsList");
  if (stepsList) {
    stepsList.addEventListener("dragstart", (e) => {
      const card = e.target.closest(".step-card");
      if (!card) return;
      draggingIdx = Number(card.dataset.stepIdx);
      card.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    stepsList.addEventListener("dragend", (e) => {
      e.target.closest(".step-card")?.classList.remove("is-dragging");
      stepsList.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      draggingIdx = null;
    });

    stepsList.addEventListener("dragover", (e) => {
      e.preventDefault();
      const card = e.target.closest(".step-card");
      if (!card) return;
      stepsList.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      const overIdx = Number(card.dataset.stepIdx);
      if (overIdx !== draggingIdx) card.classList.add("drag-over");
    });

    stepsList.addEventListener("drop", (e) => {
      e.preventDefault();
      const card = e.target.closest(".step-card");
      if (!card || draggingIdx === null) return;
      const dropIdx = Number(card.dataset.stepIdx);
      if (dropIdx === draggingIdx) return;
      const [moved] = editSteps.splice(draggingIdx, 1);
      editSteps.splice(dropIdx, 0, moved);
      rerenderSteps(panel);
      scheduleValidation(panel);
    });
  }

  // ── Technical ───────────────────────────────────────────────────────────
  // Type select
  panel.addEventListener("change", (e) => {
    const sel = e.target.closest(".tech-type-select");
    if (!sel) return;
    editTechnicals[Number(sel.dataset.techIdx)].type = sel.value;
  });

  // Content input
  panel.addEventListener("input", (e) => {
    const inp = e.target.closest(".tech-content-input");
    if (!inp) return;
    editTechnicals[Number(inp.dataset.techIdx)].content = inp.value;
  });

  // Delete row
  panel.addEventListener("click", (e) => {
    const btn = e.target.closest(".tech-delete");
    if (!btn) return;
    editTechnicals.splice(Number(btn.dataset.techIdx), 1);
    rerenderTechnical(panel);
  });

  // Add row
  panel.querySelector("#addTechnicalBtn")?.addEventListener("click", () => {
    editTechnicals.push({ type: TECHNICAL_TYPES[0], content: "" });
    rerenderTechnical(panel);
    const rows = panel.querySelectorAll(".technical-row");
    rows[rows.length - 1]?.querySelector(".tech-content-input")?.focus();
  });

  // ── Custom fields ────────────────────────────────────────────────────────
  panel.querySelector("#addCustomFieldBtn")?.addEventListener("click", () => {
    panel.querySelector("#customFieldPrompt").hidden = false;
    panel.querySelector("#customFieldKey")?.focus();
  });

  panel.querySelector("#customFieldCancel")?.addEventListener("click", () => {
    panel.querySelector("#customFieldPrompt").hidden = true;
    if (panel.querySelector("#customFieldKey")) panel.querySelector("#customFieldKey").value = "";
    if (panel.querySelector("#customFieldError")) panel.querySelector("#customFieldError").hidden = true;
  });

  panel.querySelector("#customFieldConfirm")?.addEventListener("click", () => {
    const keyInput = panel.querySelector("#customFieldKey");
    const typeSelect = panel.querySelector("#customFieldType");
    const errEl = panel.querySelector("#customFieldError");
    const key = keyInput.value.trim();

    if (!key) { showErr(errEl, "Field name required"); return; }

    const schema = getState().schema;
    const schemaKeys = new Set(Object.keys(schema?.properties ?? {}));
    if (schemaKeys.has(key)) { showErr(errEl, `"${key}" is already a schema field`); return; }

    // Check duplicates in existing custom fields
    const existing = panel.querySelectorAll(".custom-field-key");
    for (const el of existing) {
      if (el.value.trim() === key) { showErr(errEl, `"${key}" already exists`); return; }
    }

    errEl.hidden = true;
    const row = document.createElement("div");
    row.innerHTML = buildCustomFieldRow(key, typeSelect.value === "array" ? [] : "");
    panel.querySelector(".fm-custom-fields").appendChild(row.firstElementChild);

    keyInput.value = "";
    panel.querySelector("#customFieldPrompt").hidden = true;
  });

  // Remove custom field
  panel.addEventListener("click", (e) => {
    const btn = e.target.closest(".remove-custom-field");
    if (!btn) return;
    btn.closest(".custom-field-row").remove();
  });
}

// ── Re-render helpers ─────────────────────────────────────────────────────

function rerenderSteps(panel) {
  const list = panel.querySelector("#stepsList");
  if (list) list.innerHTML = buildStepCards();
}

function rerenderTechnical(panel) {
  const list = panel.querySelector("#technicalList");
  if (list) list.innerHTML = editTechnicals.map((t, i) => buildTechnicalRow(t, i)).join("");
}

// ── Live validation ───────────────────────────────────────────────────────

function scheduleValidation(panel) {
  clearTimeout(validationTimer);
  validationTimer = setTimeout(() => runValidation(panel), 200);
}

function runValidation(panel) {
  if (!panel) panel = document.getElementById("tab-edit");
  if (!panel) return;
  const doc = collectDoc(panel);
  const schema = getState().schema;
  const fmWarnings = validateFrontmatter(doc.frontmatter, schema);
  // Preserve any non-frontmatter warnings (e.g. flow parse errors) from the loaded doc
  const prevWarnings = getState().currentDocument?.warnings ?? [];
  const flowWarnings = prevWarnings.filter((w) => w.startsWith("Flow") || w.startsWith("Grammar"));
  const warnings = [...fmWarnings, ...flowWarnings];
  const badge = panel.querySelector("#editValidationBadge");
  if (!badge) return;
  if (warnings.length === 0) {
    badge.className = "status-badge status-badge--ok";
    badge.textContent = "Valid";
    badge.title = "";
  } else {
    badge.className = "status-badge status-badge--warn";
    badge.textContent = `${warnings.length} warning${warnings.length > 1 ? "s" : ""}`;
    badge.title = warnings.map((w) => `• ${w}`).join("\n");
  }
  // Keep state current so export and preview can use latest
  setWorkingDocument({ ...doc, warnings });
  // Refresh preview if it's the active tab
  const activePanel = document.querySelector(".tab-panel:not([hidden])");
  if (activePanel?.id === "tab-preview") renderPreview(doc);
}

// ── Collect doc from form ─────────────────────────────────────────────────

function collectDoc(panel) {
  if (!panel) panel = document.getElementById("tab-edit");
  const schema = getState().schema;
  const props = schema?.properties ?? {};
  const fm = {};

  // Schema fields
  for (const key of Object.keys(props)) {
    const def = props[key];
    if (def.type === "array") {
      const tags = getTagValues(panel, key);
      if (tags.length > 0) fm[key] = tags;
    } else {
      const input = panel.querySelector(`[data-fm-field="${key}"]`);
      if (input) {
        const val = input.value.trim();
        if (val) fm[key] = val;
      }
    }
  }

  // Custom fields
  panel.querySelectorAll(".custom-field-row").forEach((row) => {
    const keyInput = row.querySelector(".custom-field-key");
    const valInput = row.querySelector(".custom-field-val");
    if (keyInput && valInput) {
      const k = keyInput.value.trim();
      const v = valInput.value.trim();
      if (k) fm[k] = v;
    }
  });

  const currentDoc = getState().currentDocument;
  return {
    ...currentDoc,
    frontmatter: fm,
    flow: {
      flow: editSteps.map((s, i) => ({ ...s, step: i + 1 })),
      technical: editTechnicals,
      validate: collectValidate(panel),
    },
    warnings: [],
    fileName: currentDoc?.fileName ?? "",
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────

function addTag(panel, fieldKey, value) {
  const widget = panel.querySelector(`.tag-input[data-field="${fieldKey}"]`);
  if (!widget) return;
  // Avoid duplicates
  const existing = Array.from(widget.querySelectorAll(".tag-pill")).map((p) => p.dataset.value);
  if (existing.includes(value)) return;
  const pill = document.createElement("span");
  pill.className = "tag-pill";
  pill.dataset.value = value;
  pill.innerHTML = `${esc(value)}<button class="tag-pill-remove" data-field="${esc(fieldKey)}" data-value="${esc(value)}" aria-label="Remove ${esc(value)}">×</button>`;
  widget.querySelector(".tag-text-input").before(pill);
}

function getTagValues(panel, fieldKey) {
  const widget = panel.querySelector(`.tag-input[data-field="${fieldKey}"]`);
  if (!widget) return [];
  return Array.from(widget.querySelectorAll(".tag-pill")).map((p) => p.dataset.value);
}

function showErr(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
