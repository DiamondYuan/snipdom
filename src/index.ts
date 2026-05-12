import { initOverlay } from "./overlay";

(function () {
  if (window.__snipdomOverlay) return;
  window.__snipdomOverlay = true;

  if (document.documentElement) {
    initOverlay();
  } else {
    document.addEventListener("DOMContentLoaded", () => initOverlay());
  }
})();
