import { getResourceConfig } from "./config.js";
import { loadSchema } from "./services/resource-loader.js";
import { getState, setSchema, setCurrentDocument, navigateToIndex, getDocuments, removeDocument } from "./state.js";
import { splitDocument, parseFrontmatter, SplitError } from "./parsers/frontmatter.js";
import { parseFlow, FlowParseError } from "./parsers/flow-parser.js";
import { validateFrontmatter } from "./validators/schema-validator.js";
import { setupDropZone, readFileAsText } from "./ui/drop-zone.js";
import { renderPreview } from "./ui/preview.js";
import { showToast } from "./ui/toast.js";
import { initTabs, showTabs, switchTab, onTabSwitch } from "./ui/tabs.js";
import { renderEdit } from "./ui/edit.js";
import { triggerExport } from "./ui/export.js";
import { newFrs } from "./ui/new-frs.js";
import { renderNavigator } from "./ui/file-navigator.js";
import { renderSummary } from "./ui/summary.js";
import { loadHints } from "./frs-hints.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function setStatus(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = text;
}

// ── File processing pipeline ─────────────────────────────────────────────

/**
 * Parse a single File into an FrsDocument. Returns null on unrecoverable error.
 * @param {File} file
 * @returns {Promise<object|null>}
 */
const MAX_FILE_BYTES = 512 * 1024; // 512 KB

async function parseSingleFile(file) {
  if (file.size > MAX_FILE_BYTES) {
    showToast(`${file.name}: file too large (max 512 KB)`, "error");
    return null;
  }
  let rawText;
  try {
    rawText = await readFileAsText(file);
  } catch {
    showToast(`Could not read ${file.name}`, "error");
    return null;
  }

  let frontmatter, body;
  try {
    ({ frontmatter, body } = splitDocument(rawText));
  } catch (err) {
    showToast(`${file.name}: ${err instanceof SplitError ? "Missing frontmatter" : err.message}`, "error");
    return null;
  }

  let frontmatterData;
  try {
    frontmatterData = parseFrontmatter(frontmatter);
  } catch (err) {
    showToast(`${file.name}: Invalid YAML — ${err.message}`, "error");
    return null;
  }

  const { schema } = getState();
  const validationWarnings = validateFrontmatter(frontmatterData, schema);

  let flowAst = null;
  const flowWarnings = [];
  try {
    flowAst = parseFlow(body);
  } catch (err) {
    flowWarnings.push(err instanceof FlowParseError
      ? `Flow parse error: ${err.message}`
      : `Grammar error: ${err.message}`);
  }

  return {
    frontmatter: frontmatterData,
    flow: flowAst,
    warnings: [...validationWarnings, ...flowWarnings],
    fileName: file.name,
  };
}

/**
 * Handle one or more dropped files. Steps 1-7 of TOOL-DND + TOOL-MULTI.
 * @param {File[]} files
 */
async function handleFiles(files) {
  if (files.length === 0) return;

  const results = await Promise.all(files.map(parseSingleFile));
  const docs = results.filter(Boolean);

  if (docs.length === 0) {
    showToast("No valid FRS files found", "error");
    return;
  }

  const warnCount = docs.reduce((n, d) => n + d.warnings.length, 0);
  if (warnCount > 0) showToast(`${warnCount} validation warning(s) across loaded files`, "warning");

  // Store all docs; setCurrentDocument handles dedup + index tracking
  docs.forEach((doc) => setCurrentDocument(doc));

  // Navigate to the first newly loaded doc
  const allDocs = getDocuments();
  const firstNewIdx = allDocs.indexOf(docs[0]);
  navigateToIndex(firstNewIdx === -1 ? allDocs.length - 1 : firstNewIdx);

  showTabs();
  const exportBtn = document.getElementById("exportButton");
  if (exportBtn) exportBtn.hidden = false;

  // Collapse the drop zone to a slim bar now that files are loaded
  document.getElementById("dropZone")?.classList.add("drop-zone--collapsed");

  renderCurrentDoc("preview");
  switchTab("preview");
}

// ── Document navigation ───────────────────────────────────────────────────

/**
 * Switch to a document by index and re-render the active panel + navigator.
 * @param {number} index
 */
function switchDocument(index) {
  navigateToIndex(index);
  const activePanel = document.querySelector(".tab-panel:not([hidden])");
  const activeTab = activePanel?.id?.replace("tab-", "") ?? "preview";
  renderCurrentDoc(activeTab);
}

/**
 * Render the current document into the given tab panel and refresh the navigator.
 * @param {string} tab
 */
function renderCurrentDoc(tab) {
  const { currentDocument, currentDocumentIndex } = getState();
  const docs = getDocuments();
  if (!currentDocument) return;

  if (tab === "preview") renderPreview(currentDocument);
  if (tab === "edit")    renderEdit(currentDocument);
  if (tab === "summary") renderSummary(docs, switchDocument);

  renderNavigator(docs, currentDocumentIndex, switchDocument, handleRemove);
}

/**
 * Remove a document by index. Resets to drop-zone state if no docs remain.
 * @param {number} index
 */
function handleRemove(index) {
  removeDocument(index);
  const docs = getDocuments();

  if (docs.length === 0) {
    // Reset to initial empty state
    const tabBar = document.getElementById("tabBar");
    if (tabBar) tabBar.hidden = true;
    const exportBtn = document.getElementById("exportButton");
    if (exportBtn) exportBtn.hidden = true;
    const navigator = document.getElementById("fileNavigator");
    if (navigator) navigator.hidden = true;
    const sidebar = document.getElementById("fileSidebar");
    if (sidebar) sidebar.hidden = true;
    document.querySelectorAll(".tab-panel").forEach((p) => { p.hidden = true; p.innerHTML = ""; });
    showToast("All files unloaded", "success");
    return;
  }

  const activePanel = document.querySelector(".tab-panel:not([hidden])");
  const activeTab = activePanel?.id?.replace("tab-", "") ?? "preview";
  renderCurrentDoc(activeTab);
}

// ── Startup ───────────────────────────────────────────────────────────────

async function initialize() {
  const config = getResourceConfig();

  // Fire hints fetch in background — it's non-blocking and fails gracefully
  loadHints();

  setStatus("schemaStatus", "Schema: loading…");
  setStatus("grammarStatus", "Grammar: loading…");

  // Load schema (Step 4 prerequisite)
  try {
    const schemaResult = await loadSchema(config);
    setSchema(schemaResult.data);
    const label = schemaResult.usedFallback ? "(fallback)" : "(configured)";
    setStatus("schemaStatus", `Schema: ✓ ${label}`);
  } catch (err) {
    setStatus("schemaStatus", `Schema: failed (${err.message})`);
  }

  // Grammar is pre-compiled — check that the global parser was loaded
  if (typeof globalThis.frsFlowParser !== "undefined") {
    setStatus("grammarStatus", "Grammar: ✓ (pre-compiled)");
  } else {
    setStatus("grammarStatus", "Grammar: failed (frs-flow-parser.js missing)");
    showToast("Pre-compiled parser not found — flow parsing unavailable", "warning");
  }

  // Init tab bar
  initTabs();
  onTabSwitch((tab) => {
    renderCurrentDoc(tab);
  });

  // Steps 1+2+ …: Wire up full-page drop zone
  setupDropZone(handleFiles);

  // New FRS button
  const newFrsButton = document.getElementById("newFrsButton");
  if (newFrsButton) {
    newFrsButton.addEventListener("click", () => {
      newFrs();
      const exportBtn = document.getElementById("exportButton");
      if (exportBtn) exportBtn.hidden = false;
    });
  }

  // Export button
  const exportButton = document.getElementById("exportButton");
  if (exportButton) {
    exportButton.addEventListener("click", () => triggerExport());
  }

  // When export commits a new or renamed doc, refresh navigator + current panel
  document.addEventListener("frs:committed", () => {
    const activePanel = document.querySelector(".tab-panel:not([hidden])");
    const activeTab = activePanel?.id?.replace("tab-", "") ?? "preview";
    renderCurrentDoc(activeTab);
  });
}

initialize();
