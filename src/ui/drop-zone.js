/**
 * Full-page drag-and-drop handler.
 * Fires onFileDrop(file: File) when a valid .md file lands anywhere on the page.
 * Shows toasts for invalid file types or unreadable files.
 */

import { showToast } from "./toast.js";

export function setupDropZone(onFileDrop) {
  const dropZoneEl = document.getElementById("dropZone");

  // ── visual highlight helpers ──────────────────────────────────────────────

  function highlight() {
    if (dropZoneEl) dropZoneEl.classList.add("is-over");
  }

  function unhighlight() {
    if (dropZoneEl) dropZoneEl.classList.remove("is-over");
  }

  // Track nested drag-enter/leave correctly across child elements
  let dragDepth = 0;

  // ── document-level events (full-page drop) ───────────────────────────────

  document.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth++;
    highlight();
  });

  document.addEventListener("dragleave", () => {
    dragDepth--;
    if (dragDepth <= 0) {
      dragDepth = 0;
      unhighlight();
    }
  });

  document.addEventListener("dragover", (event) => {
    event.preventDefault(); // required to allow drop
  });

  document.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    unhighlight();

    const files = Array.from(event.dataTransfer?.files ?? []);
    const mdFiles = files.filter((f) => f.name.toLowerCase().endsWith(".md"));
    const skipped = files.length - mdFiles.length;

    if (files.length === 0) return;

    if (mdFiles.length === 0) {
      showToast("Only .md files supported", "error");
      return;
    }

    if (skipped > 0) {
      showToast(`Skipped ${skipped} non‑.md file${skipped > 1 ? "s" : ""}`, "warning");
    }

    // Multi-file: pass all valid md files (module 06 handles navigation)
    onFileDrop(mdFiles);
  });
}

/**
 * Reads a File as UTF-8 text. Rejects with a descriptive error on failure.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsText(file, "UTF-8");
  });
}
