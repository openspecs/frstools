/**
 * Tab bar — wires data-tab buttons to tab-panel visibility.
 * Tabs are hidden until a document is loaded; call showTabs() to reveal.
 */

const TAB_BAR_ID = "tabBar";
let tabSwitchCallback = null;

export function onTabSwitch(callback) {
  tabSwitchCallback = callback;
}

export function initTabs() {
  const bar = document.getElementById(TAB_BAR_ID);
  if (!bar) return;

  bar.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-tab]");
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });
}

export function switchTab(tabName) {
  const bar = document.getElementById(TAB_BAR_ID);
  if (!bar) return;

  // Update buttons
  bar.querySelectorAll("[data-tab]").forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle("tab-btn--active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  // Update panels
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `tab-${tabName}`;
  });

  if (tabSwitchCallback) tabSwitchCallback(tabName);
}

export function showTabs() {
  const bar = document.getElementById(TAB_BAR_ID);
  if (bar) bar.hidden = false;
}

export function activeTab() {
  const bar = document.getElementById(TAB_BAR_ID);
  if (!bar) return null;
  return bar.querySelector(".tab-btn--active")?.dataset.tab ?? null;
}
