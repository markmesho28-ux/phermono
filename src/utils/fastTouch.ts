/**
 * Mobile Touch & Focus Management Utility
 * 
 * Purged all synthetic click dispatching, capture-phase suppression,
 * stopImmediatePropagation, and WeakMap throttling to eliminate event race conditions.
 * 
 * Relies 100% on native browser touch-to-click execution with `touch-action: manipulation`.
 * Provides a lightweight, passive post-tap focus cleanup to prevent interactive elements
 * (buttons, links) from getting stuck in an active/focus visual state on touch viewports.
 */

export function initFastTouch(_selector?: string) {
  if (typeof window === "undefined" || !("ontouchstart" in window)) return () => {};

  // Passive touch listener to clean up persistent button focus on mobile touchscreens
  const onTouchEnd = () => {
    // Run after native click dispatch has fired and React processed the event
    requestAnimationFrame(() => {
      try {
        const active = document.activeElement;
        if (active && active instanceof HTMLElement) {
          const tagName = active.tagName.toUpperCase();
          // Never blur form inputs or textareas so typing is never interrupted
          if (tagName === "INPUT" || tagName === "TEXTAREA" || active.isContentEditable) {
            return;
          }
          if (
            tagName === "BUTTON" ||
            tagName === "A" ||
            active.getAttribute("role") === "button" ||
            active.classList.contains("touch-target")
          ) {
            active.blur();
          }
        }
      } catch {
        // noop
      }
    });
  };

  window.addEventListener("touchend", onTouchEnd, { passive: true });

  return function destroy() {
    window.removeEventListener("touchend", onTouchEnd);
  };
}

export default initFastTouch;
