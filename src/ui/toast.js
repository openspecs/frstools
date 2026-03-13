/**
 * Minimal toast notification utility.
 * Automatically removes each toast after a timeout.
 */

const TOAST_DURATION_MS = 4000;

let container = null;

function getContainer() {
  if (container) return container;

  container = document.createElement("div");
  container.id = "toastContainer";
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-atomic", "false");
  Object.assign(container.style, {
    position: "fixed",
    bottom: "1.5rem",
    right: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    zIndex: "9999",
  });
  document.body.appendChild(container);
  return container;
}

export function showToast(message, type = "info") {
  const c = getContainer();
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.setAttribute("role", "status");

  const colors = {
    info: "#333",
    error: "#b91c1c",
    warning: "#92400e",
    success: "#166534",
  };

  Object.assign(toast.style, {
    background: colors[type] ?? colors.info,
    color: "#fff",
    padding: "0.6rem 1rem",
    borderRadius: "6px",
    fontSize: "0.875rem",
    maxWidth: "320px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    opacity: "1",
    transition: "opacity 0.3s",
  });

  c.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 320);
  }, TOAST_DURATION_MS);
}
