/**
 * Centralised in-memory app state.
 * Populated from resource-loader on startup; updated after each successful file parse.
 */

const state = {
  /** @type {object | null} Parsed frs-schema.json data */
  schema: null,

  /** @type {FrsDocument | null} Most recently parsed FRS document */
  currentDocument: null,

  /** @type {number} Index into documents[] of the active document (-1 = none) */
  currentDocumentIndex: -1,

  /** @type {FrsDocument[]} All loaded FRS documents (multi-file, module 06) */
  documents: [],
};

/**
 * @typedef {{ frontmatter: object, flow: object, warnings: string[], fileName: string }} FrsDocument
 */

export function getState() {
  return state;
}

export function setSchema(data) {
  state.schema = data;
}

export function setCurrentDocument(doc) {
  state.currentDocument = doc;
  // Keep documents list updated — update by current index first (handles ID renames),
  // fall back to ID match, then append.
  if (state.currentDocumentIndex >= 0 && state.documents[state.currentDocumentIndex]) {
    state.documents[state.currentDocumentIndex] = doc;
  } else {
    const existing = state.documents.findIndex(
      (d) => d.frontmatter?.id && d.frontmatter.id === doc.frontmatter?.id,
    );
    if (existing >= 0) {
      state.documents[existing] = doc;
      state.currentDocumentIndex = existing;
    } else {
      state.documents.push(doc);
      state.currentDocumentIndex = state.documents.length - 1;
    }
  }
}

/**
 * Set a new unsaved document as the working document WITHOUT adding it to documents[].
 * Used by newFrs() — the doc only enters the list when the user exports/saves.
 * @param {object} doc
 */
export function setPendingDocument(doc) {
  state.currentDocument = doc;
  state.currentDocumentIndex = -1;
}

/**
 * Update the working document in-memory. If a doc is already committed (index >= 0),
 * also updates that slot in documents[]. Never appends a new entry.
 * Used by edit form live-sync.
 * @param {object} doc
 */
export function setWorkingDocument(doc) {
  state.currentDocument = doc;
  if (state.currentDocumentIndex >= 0 && state.documents[state.currentDocumentIndex]) {
    state.documents[state.currentDocumentIndex] = doc;
  }
}

export function getDocuments() {
  return state.documents;
}

/**
 * Navigate to a document by index. Updates currentDocument + currentDocumentIndex.
 * @param {number} index
 */
export function navigateToIndex(index) {
  const doc = state.documents[index];
  if (!doc) return;
  state.currentDocumentIndex = index;
  state.currentDocument = doc;
}

/**
 * Remove a document by index. Adjusts currentDocument / currentDocumentIndex accordingly.
 * @param {number} index
 * @returns {boolean} true if removed
 */
export function removeDocument(index) {
  if (index < 0 || index >= state.documents.length) return false;
  state.documents.splice(index, 1);
  if (state.documents.length === 0) {
    state.currentDocument = null;
    state.currentDocumentIndex = -1;
  } else {
    // Clamp to the previous item, or stay at same index if possible
    const newIdx = Math.max(0, index >= state.documents.length ? state.documents.length - 1 : index);
    state.currentDocumentIndex = newIdx;
    state.currentDocument = state.documents[newIdx];
  }
  return true;
}
