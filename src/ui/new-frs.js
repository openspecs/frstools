/**
 * TOOL-NEW-001
 * Generates a blank FRS skeleton and opens it in Edit mode.
 *
 * Step 1: Schema already loaded in state (resource-loader ran on startup).
 * Step 2: Blank frontmatter — all required fields as empty strings.
 * Step 3: Flow skeleton — one empty step + one empty alternative.
 * Step 4: Open Edit mode.
 * Step 5: Focus the id field.
 */

import { getState, setPendingDocument } from "../state.js";
import { showTabs, switchTab } from "./tabs.js";
import { renderEdit } from "./edit.js";

const FALLBACK_REQUIRED = ["id", "user", "context", "trigger", "user_outcome"];

export function newFrs() {
  // Step 1 — schema already in state from startup load
  const { schema } = getState();

  // Step 2 — required fields as empty placeholders
  const requiredKeys = schema?.required ?? FALLBACK_REQUIRED;
  const frontmatter = Object.fromEntries(requiredKeys.map((k) => [k, ""]));

  // Step 3 — one empty step, one empty alternative
  const flow = {
    flow: [
      {
        step: 1,
        action: "",
        alternatives: [
          { condition: "If", action: "" },
        ],
      },
    ],
    technical: [],
  };

  const doc = {
    frontmatter,
    flow,
    warnings: [],
    fileName: "untitled-frs.md",
  };

  // Step 4 — set as pending (not committed to list until exported) and open Edit mode
  setPendingDocument(doc);
  showTabs();
  // Show export button so user can save
  const exportBtn = document.getElementById("exportButton");
  if (exportBtn) exportBtn.hidden = false;
  switchTab("edit");
  renderEdit(doc);

  // Step 5 — focus id field after render (next microtask so DOM is ready)
  requestAnimationFrame(() => {
    const idField = document.getElementById("fm-id");
    if (idField) idField.focus();
  });
}
