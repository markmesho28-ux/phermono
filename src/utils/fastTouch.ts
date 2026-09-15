/**
 * Direct Fast Touch Event Listener
 *
 * Directly intercepts touch contact on interactive elements via pointerdown / touchstart
 * and immediately triggers the action handler (.click()) on the very first touch contact (0ms delay),
 * completely bypassing browser tap wait times, double-tap delays, and dropped touches.
 *
 * Desktop mouse clicks and form inputs remain 100% untouched.
 */

let initialized = false;
let cleanupFn: (() => void) | null = null;

export function initFastTouch() {
  if (typeof window === "undefined") return () => {};
  if (initialized && cleanupFn) return cleanupFn;

  let lastFiredTarget: HTMLElement | null = null;
  let lastFiredTime = 0;

  function getInteractiveTarget(target: EventTarget | null): HTMLElement | null {
    if (!target || !(target instanceof Element)) return null;

    // Never fast-activate form inputs or editable fields so users can focus and type
    if (target.closest('input, textarea, select, [contenteditable="true"]')) {
      return null;
    }

    const el = target.closest<HTMLElement>(
      'button, a, [role="button"], .touch-target, .sidebar-nav-item, .category-filter-tab, .card-add-btn, .header-wishlist-btn, .header-cart-btn, .header-track-btn, .header-assistant-btn, .header-auth-btn, [data-clickable="true"]'
    );

    if (!el || el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") {
      return null;
    }

    return el;
  }

  function handleDirectTouch(target: EventTarget | null) {
    const el = getInteractiveTarget(target);
    if (!el) return;

    // Avoid double-firing on the exact same touch down within 250ms
    const now = Date.now();
    if (lastFiredTarget === el && now - lastFiredTime < 250) {
      return;
    }

    lastFiredTarget = el;
    lastFiredTime = now;

    // Execute immediately on the very first touch contact (0ms delay)
    try {
      el.click();
    } catch {
      const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      el.dispatchEvent(evt);
    }

    // Clean up focus state on next animation frame after click has executed
    requestAnimationFrame(() => {
      try {
        const active = document.activeElement;
        if (active && active instanceof HTMLElement) {
          const tag = active.tagName.toUpperCase();
          if (tag !== "INPUT" && tag !== "TEXTAREA" && !active.isContentEditable) {
            active.blur();
          }
        }
      } catch {
        // noop
      }
    });
  }

  // Pointerdown handler (fires on first finger touch contact)
  function onPointerDown(e: PointerEvent) {
    // Strictly touch pointer only — desktop mouse and pen are completely untouched
    if (e.pointerType !== "touch") return;
    handleDirectTouch(e.target);
  }

  // Touchstart fallback for touch devices without PointerEvent touch support
  function onTouchStart(e: TouchEvent) {
    if (window.PointerEvent) return; // Handled by pointerdown
    if (e.touches && e.touches.length === 1) {
      handleDirectTouch(e.target);
    }
  }

  // Capture phase listener to suppress duplicate browser-synthesized native clicks
  function onDocumentClickCapture(e: MouseEvent) {
    // Allow non-trusted programmatic clicks through
    if (!e.isTrusted && !(e as any).__isMockTrusted) return;

    if (lastFiredTarget && Date.now() - lastFiredTime < 500) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      lastFiredTarget = null;
    }
  }

  window.addEventListener("pointerdown", onPointerDown, { passive: true, capture: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
  document.addEventListener("click", onDocumentClickCapture, true);

  initialized = true;

  cleanupFn = function destroy() {
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("touchstart", onTouchStart, true);
    document.removeEventListener("click", onDocumentClickCapture, true);
    initialized = false;
    cleanupFn = null;
  };

  return cleanupFn;
}

export default initFastTouch;
