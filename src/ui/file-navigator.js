/**
 * TOOL-MULTI-001
 * File navigator bar + sidebar for multi-file mode.
 *
 * renderNavigator(docs, currentIndex, onNavigate) — call after any doc list change.
 * Hides itself when only 0-1 docs are loaded.
 */

const NAV_BAR_ID = "fileNavigator";
const SIDEBAR_ID = "fileSidebar";

/**
 * @param {object[]} docs - array of FrsDocument
 * @param {number}   currentIndex
 * @param {function} onNavigate - called with new index when user navigates
 * @param {function} [onRemove] - called with index to remove a file
 */
export function renderNavigator(docs, currentIndex, onNavigate, onRemove) {
  renderNavBar(docs, currentIndex, onNavigate);
  renderSidebar(docs, currentIndex, onNavigate, onRemove);
}

// ── Navigator bar ─────────────────────────────────────────────────────────

function renderNavBar(docs, currentIndex, onNavigate) {
  const bar = document.getElementById(NAV_BAR_ID);
  if (!bar) return;

  if (docs.length === 0) {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;
  const total = docs.length;
  const position = currentIndex + 1;
  const currentId = docs[currentIndex]?.frontmatter?.id ?? docs[currentIndex]?.fileName ?? "—";
  const atFirst = currentIndex === 0;
  const atLast  = currentIndex === total - 1;
  const multiFile = total > 1;

  bar.innerHTML = `
    <button id="navPrev" class="btn btn--sm nav-arrow"
      aria-label="Previous file"${!multiFile || atFirst ? " disabled" : ""}>&#x2039; Prev</button>
    <span class="nav-position">
      <span class="nav-count">${position} of ${total}</span>
      <span class="nav-id">${esc(currentId)}</span>
    </span>
    <button id="navNext" class="btn btn--sm nav-arrow"
      aria-label="Next file"${!multiFile || atLast ? " disabled" : ""}>Next &#x203a;</button>
    <button id="sidebarToggle" class="btn btn--sm btn--ghost nav-sidebar-toggle"
      aria-expanded="${!document.getElementById(SIDEBAR_ID)?.hidden}"
      aria-controls="${SIDEBAR_ID}">Files ▾</button>`;

  bar.querySelector("#navPrev")?.addEventListener("click", () => {
    if (currentIndex > 0) onNavigate(currentIndex - 1);
  });

  bar.querySelector("#navNext")?.addEventListener("click", () => {
    if (currentIndex < total - 1) onNavigate(currentIndex + 1);
  });

  bar.querySelector("#sidebarToggle")?.addEventListener("click", () => {
    const sidebar = document.getElementById(SIDEBAR_ID);
    if (!sidebar) return;
    sidebar.hidden = !sidebar.hidden;
    bar.querySelector("#sidebarToggle")
       ?.setAttribute("aria-expanded", String(!sidebar.hidden));
  });
}

// ── File list sidebar ─────────────────────────────────────────────────────

function renderSidebar(docs, currentIndex, onNavigate, onRemove) {
  const sidebar = document.getElementById(SIDEBAR_ID);
  if (!sidebar) return;

  if (docs.length === 0) {
    sidebar.hidden = true;
    return;
  }

  const items = docs.map((doc, i) => {
    const id = doc.frontmatter?.id ?? doc.fileName ?? `File ${i + 1}`;
    const hasWarnings = doc.warnings?.length > 0;
    const active = i === currentIndex;
    return `
      <li>
        <div class="sidebar-item${active ? " sidebar-item--active" : ""}">
          <button class="sidebar-nav-btn" data-nav-idx="${i}" title="${esc(doc.fileName ?? id)}">
            <span class="sidebar-status-dot ${hasWarnings ? "dot--warn" : "dot--ok"}"
                  aria-label="${hasWarnings ? "has warnings" : "valid"}"></span>
            <span class="sidebar-id">${esc(id)}</span>
          </button>
          <button class="sidebar-remove-btn btn-icon" data-remove-idx="${i}" title="Unload ${esc(id)}">&#x2715;</button>
        </div>
      </li>`;
  }).join("");

  sidebar.innerHTML = `<ul class="sidebar-list">${items}</ul>`;

  sidebar.querySelectorAll("[data-nav-idx]").forEach((btn) => {
    btn.addEventListener("click", () => onNavigate(Number(btn.dataset.navIdx)));
  });

  if (onRemove) {
    sidebar.querySelectorAll("[data-remove-idx]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        onRemove(Number(btn.dataset.removeIdx));
      });
    });
  }
}

// ── Utility ───────────────────────────────────────────────────────────────

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
