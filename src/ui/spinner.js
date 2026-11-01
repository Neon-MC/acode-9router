/**
 * Onboarding Loading Spinner Component
 * Follows the visual architecture of acode-opencode:
 * - 60fps GPU rotation via requestAnimationFrame and performance.now()
 * - Conic gradient arc ring with CSS radial-gradient mask
 * - Adaptive colors using Acode theme CSS custom properties
 * - Real-time monospace progress line for live apk/npm streaming
 */

const SPINNER_DEG_PER_SEC = 270;

export function createSpinner(statusText = "Setting up 9Router...") {
  const container = document.createElement("div");
  container.className = "as-onboarding-container";

  const ring = document.createElement("div");
  ring.className = "as-spinner-ring";
  container.appendChild(ring);

  const label = document.createElement("p");
  label.className = "as-spinner-label";
  label.textContent = statusText;
  container.appendChild(label);

  const progress = document.createElement("p");
  progress.className = "as-spinner-progress";
  progress.style.visibility = "hidden";
  container.appendChild(progress);

  let angle = 0;
  let lastTime = performance.now();
  let rafId = null;

  function tick(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    angle = (angle + SPINNER_DEG_PER_SEC * dt) % 360;
    ring.style.transform = `rotate(${angle}deg)`;
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  return {
    element: container,
    setStatus: (text) => {
      label.textContent = text;
    },
    setProgress: (text) => {
      progress.textContent = text;
      progress.style.visibility = text ? "visible" : "hidden";
    },
    stop: () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}
