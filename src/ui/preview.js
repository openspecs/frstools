/**
 * TOOL-PREVIEW-001
 * Renders a full FRS document preview:
 *   1. Metadata card (no empty rows)
 *   2. User journey summary sentence
 *   3. Numbered vertical flow with step connectors
 *   4. Collapsible alternatives under each step via <details>
 *   5. Technical sections as compact badges
 *   6. Validation status badge (green ✓ / amber N warnings) — top-right
 */

import { hintIcon } from "../frs-hints.js";

const PANEL_ID = "tab-preview";

export function renderPreview(doc) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  panel.innerHTML = buildHtml(doc);
}

export function hidePreview() {
  const panel = document.getElementById(PANEL_ID);
  if (panel) panel.innerHTML = "";
}

// ── Top-level builder ──────────────────────────────────────────────────────

function buildHtml(doc) {
  const { frontmatter: fm, flow, warnings } = doc;
  const parts = [];

  // Mascot
  parts.push(`<img src="./static/database_turtle.png" alt="Database Turtle" class="tab-mascot" />`);

  // Header row: title + validation status badge
  parts.push(`
    <div class="pv-header">
      <h2 class="pv-title">${esc(fm.id ?? doc.fileName ?? "Untitled")}</h2>
      ${buildStatusBadge(warnings)}
    </div>`);

  // Inline warning panel (visible by default when warnings exist)
  if (warnings && warnings.length > 0) {
    parts.push(buildWarningPanel(warnings));
  }

  // Metadata card
  const metaCard = buildMetaCard(fm);
  if (metaCard) parts.push(metaCard);

  // Flow steps
  const steps = flow?.flow ?? [];
  if (steps.length > 0) parts.push(buildFlowSection(steps));

  // Technical badges
  const technical = flow?.technical ?? [];
  if (technical.length > 0) parts.push(buildTechnicalBadges(technical));

  // Validate section
  const validate = flow?.validate;
  if (validate) parts.push(buildValidateSection(validate));

  return parts.join("\n");
}

// ── Section builders ───────────────────────────────────────────────────────

/** Green ✓ when valid; amber badge with count when warnings exist */
function buildStatusBadge(warnings) {
  if (!warnings || warnings.length === 0) {
    return `<span class="status-badge status-badge--ok">Valid</span>`;
  }
  const count = warnings.length;
  return `<span class="status-badge status-badge--warn">${count} warning${count > 1 ? "s" : ""}</span>`;
}

/** Inline collapsible warning list, open by default */
function buildWarningPanel(warnings) {
  const items = warnings
    .map((w) => `<li class="warn-item">${esc(w)}</li>`)
    .join("");
  return `
    <details class="warn-panel" open>
      <summary class="warn-panel-summary">⚠ ${warnings.length} validation warning${warnings.length > 1 ? "s" : ""}</summary>
      <ul class="warn-list">${items}</ul>
    </details>`;
}

/** 2. "{User}, while at {context}, {trigger} to achieve {user_outcome}." */
function buildJourneySummary(fm) {
  const { user, context, trigger, user_outcome } = fm;
  if (!user && !context && !trigger && !user_outcome) return null;
  const parts = [];
  if (user)         parts.push(`<strong>${esc(user)}</strong>`);
  if (context)      parts.push(`while at <em>${esc(trunc(context, 80))}</em>`);
  if (trigger)      parts.push(esc(trunc(trigger, 80)));
  if (user_outcome) parts.push(`to achieve <em>${esc(trunc(user_outcome, 100))}</em>`);
  return parts.join(", ") + ".";
}

function trunc(str, max) {
  const s = String(str);
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s;
}

/** 1. Metadata card — omit any field that is empty / null / missing */
function buildMetaCard(fm) {
  const FIELDS = [
    ["user", "User"],
    ["context", "Context"],
    ["trigger", "Trigger"],
    ["user_outcome", "User outcome"],
    ["business_outcome", "Business outcome"],
    ["priority", "Priority"],
    ["status", "Status"],
    ["estimate", "Estimate"],
    ["depends_on", "Depends on"],
    ["tags", "Tags"],
  ];

  const rows = FIELDS
    .filter(([key]) => {
      const v = fm[key];
      return v !== undefined && v !== null && v !== "" &&
        !(Array.isArray(v) && v.length === 0);
    })
    .map(([key, label]) => {
      const raw = fm[key];
      const cell = Array.isArray(raw)
        ? raw.map((item) => `<span class="badge">${esc(item)}</span>`).join(" ")
        : esc(String(raw));
      return `<tr><th>${esc(label)}${hintIcon(key)}</th><td>${cell}</td></tr>`;
    })
    .join("");

  return rows ? `<table class="pv-meta">${rows}</table>` : "";
}

/** 3+4. Vertical flow — connector line between steps, collapsible alts */
function buildFlowSection(steps) {
  const items = steps.map((step, index) => {
    const last = index === steps.length - 1;
    return `
      <div class="flow-step${last ? " flow-step--last" : ""}" role="listitem">
        <div class="flow-connector" aria-hidden="true">
          <div class="flow-dot"></div>
          ${last ? "" : '<div class="flow-line"></div>'}
        </div>
        <div class="flow-body">
          <span class="flow-num">${step.step}.</span>
          <span class="flow-action">${esc(step.action)}</span>
          ${buildAlternatives(step.alternatives)}
        </div>
      </div>`;
  });
  return `<div class="pv-section-header"><h3 class="pv-section-title">Flow${hintIcon("flow")}</h3></div><div class="flow-list" role="list">${items.join("")}</div>`;
}

/** 4. <details>/<summary> — only rendered when alternatives exist */
function buildAlternatives(alts) {
  if (!alts || alts.length === 0) return "";
  const label = `${alts.length} condition${alts.length > 1 ? "s" : ""}`;
  const listItems = alts
    .map((a) => `<li><span class="alt-cond">${esc(a.condition)}:</span> ${esc(a.action)}</li>`)
    .join("");
  return `
    <details class="alt-details">
      <summary class="alt-summary">${label}</summary>
      <ul class="alt-list">${listItems}</ul>
    </details>`;
}

/** 5. Technical sections hidden entirely when list is empty */
function buildTechnicalBadges(items) {
  const badges = items
    .map((t) => `<span class="badge badge--technical" title="${esc(t.content)}"><strong>${esc(t.type)}:</strong> ${esc(t.content)}${hintIcon(t.type)}</span>`)
    .join("");
  return `<div class="pv-section-header"><h3 class="pv-section-title">Technical${hintIcon("technical")}</h3></div><div class="pv-technical">${badges}</div>`;
}

/** 6. Validate section: happy_path, boundaries, invariants, contracts */
function buildValidateSection(validate) {
  const parts = [];

  if (hasItems(validate.happy_path)) {
    parts.push(buildTestCaseTable("Happy path", validate.happy_path));
  }
  if (hasItems(validate.boundaries)) {
    parts.push(buildTestCaseTable("Boundaries", validate.boundaries));
  }
  if (hasItems(validate.invariants)) {
    parts.push(buildStringList("Invariants", validate.invariants));
  }
  if (hasItems(validate.contracts)) {
    parts.push(buildStringList("Contracts", validate.contracts));
  }

  if (parts.length === 0) return "";

  return `<div class="pv-validate">
    <h3 class="pv-validate-title">Validate${hintIcon("validate")}</h3>
    ${parts.join("\n")}
  </div>`;
}

function hasItems(arr) {
  return Array.isArray(arr) && arr.length > 0;
}

/**
 * happy_path / boundaries are arrays of {input: {...}} and {expect: {...}} objects.
 * Group them into sequential [input, expect] pairs for display.
 */
function buildTestCaseTable(title, items) {
  const pairs = [];
  let current = {};
  for (const item of items) {
    if (item.input !== undefined) {
      current = { input: item.input };
    } else if (item.expect !== undefined) {
      current.expect = item.expect;
      pairs.push(current);
      current = {};
    }
  }
  if (current.input !== undefined) pairs.push(current); // trailing unpaired input

  const rows = pairs.map((p, i) => {
    const inputStr = p.input !== undefined ? formatInline(p.input) : "—";
    const expectStr = p.expect !== undefined ? formatInline(p.expect) : "—";
    return `<tr>
      <td class="tc-num">${i + 1}</td>
      <td><code class="tc-value">${esc(inputStr)}</code></td>
      <td><code class="tc-value">${esc(expectStr)}</code></td>
    </tr>`;
  }).join("");

  if (rows.length === 0) return "";

  return `<div class="pv-validate-sub">
    <div class="pv-validate-sub-title">${esc(title)}${hintIcon(title.toLowerCase().replace(" ", "_"))}</div>
    <table class="tc-table">
      <thead><tr><th>#</th><th>Input</th><th>Expect</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildStringList(title, items) {
  const lis = items
    .filter((s) => s)
    .map((s) => `<li>${esc(String(s))}</li>`)
    .join("");
  if (!lis) return "";
  return `<div class="pv-validate-sub">
    <div class="pv-validate-sub-title">${esc(title)}${hintIcon(title.toLowerCase())}</div>
    <ul class="pv-validate-list">${lis}</ul>
  </div>`;
}

/** Format an object/value as a compact inline string */
function formatInline(val) {
  if (val === null || val === undefined) return "";
  if (typeof val !== "object") return String(val);
  return "{" + Object.entries(val).map(([k, v]) => `${k}: ${v}`).join(", ") + "}";
}

// ── Utility ────────────────────────────────────────────────────────────────

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
