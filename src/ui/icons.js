/**
 * 9Router Icon Definition & Style Injection
 * Uses user-provided SVG vector mask matching Acode AI Agent pattern
 */

export const ROUTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="4" r="2"/><circle cx="19.6" cy="9.5" r="2"/><circle cx="16.7" cy="18.5" r="2"/><circle cx="7.3" cy="18.5" r="2"/><circle cx="4.4" cy="9.5" r="2"/><path d="M12 9.5V6"/><path d="m14.4 11.2 3.3-1.1"/><path d="m13.5 14 2 2.9"/><path d="m10.5 14-2 2.9"/><path d="m9.6 11.2-3.3-1.1"/></svg>`;

export const ICON_CLASS = "acode-9router-icon";
export const ICON_MASK = `url("data:image/svg+xml,${encodeURIComponent(ROUTER_SVG)}") center / contain no-repeat`;

/**
 * Injects stylesheet for the sidebar tab icon into document.head
 * @returns {Function} cleanup remover
 */
export function installIcon() {
  const existing = document.getElementById("acode-9router-icon-style");
  if (existing) existing.remove();

  const style = document.createElement("style");
  style.id = "acode-9router-icon-style";
  style.textContent = `
    .icon.${ICON_CLASS} {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    .icon.${ICON_CLASS}::before {
      content: "" !important;
      display: inline-block !important;
      width: 1em !important;
      height: 1em !important;
      background: currentColor !important;
      -webkit-mask: ${ICON_MASK} !important;
      mask: ${ICON_MASK} !important;
      vertical-align: middle !important;
    }
  `;
  document.head.append(style);

  return () => {
    style.remove();
  };
}
