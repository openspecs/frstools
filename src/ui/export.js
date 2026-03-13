/**
 * TOOL-EXPORT-001
 * Collects the current document from edit or fallback state,
 * validates required fields, then triggers a browser download.
 */

import { getState, setCurrentDocument } from "../state.js";
import { getEditDoc } from "./edit.js";
import { assembleDocument } from "../serializers/frs-serializer.js";
import { showToast } from "./toast.js";

const REQUIRED_FIELDS = ["id", "user", "context", "trigger", "user_outcome"];

export function triggerExport() {
  // Prefer the live edit form contents; fall back to last parsed doc
  let doc;
  const editPanel = document.getElementById("tab-edit");
  if (editPanel && !editPanel.hidden) {
    doc = getEditDoc();
  } else {
    doc = getState().currentDocument;
  }

  if (!doc) {
    showToast("No document loaded — drop a frs.md file first", "error");
    return;
  }

  // Step 1 guard: required fields must not be empty
  const { schema } = getState();
  const requiredKeys = schema?.required ?? REQUIRED_FIELDS;
  const missing = requiredKeys.filter((k) => {
    const v = doc.frontmatter?.[k];
    return v === undefined || v === null || v === "" ||
      (Array.isArray(v) && v.length === 0);
  });

  if (missing.length > 0) {
    showToast(`Export blocked — missing required field(s): ${missing.join(", ")}`, "error");
    return;
  }

  // Steps 1-4: assemble document
  let mdText;
  try {
    mdText = assembleDocument(doc);
  } catch (err) {
    showToast(`Serialization error: ${err.message}`, "error");
    return;
  }

  // Step 5: trigger download
  const id = doc.frontmatter?.id?.trim();
  const filename = id ? `${id}.md` : "untitled-frs.md";
  downloadTextFile(mdText, filename);

  // Commit the doc to the file list (this is the "save" action — new docs enter the list here)
  setCurrentDocument(doc);
  // Notify the rest of the app so the navigator/summary can update
  document.dispatchEvent(new CustomEvent("frs:committed"));

  showToast(`Downloaded ${filename}`, "success");
}

// ── Download helper ───────────────────────────────────────────────────────

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke shortly after to free memory
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
