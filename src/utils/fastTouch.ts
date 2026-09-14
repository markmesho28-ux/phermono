// Delegated fast-touch handler for elements marked with the `.touch-target` class.
// Purpose: ensure immediate activation of interactive elements on first touch
// without changing desktop mouse behavior.

type MaybeElement = HTMLElement | null;

export function initFastTouch(selector = ".touch-target, button, a[href], [role=\"button\"]") {
  if (typeof window === "undefined" || !("ontouchstart" in window)) return;

  let startX = 0;
  let startY = 0;
  let startTarget: MaybeElement = null;
  const MOVE_THRESHOLD = 10; // px

  const recentFastClick = new WeakMap<HTMLElement, number>();
  const RECENT_MS = 800;

  function findTarget(t: EventTarget | null): MaybeElement {
    try {
      const el = t as HTMLElement | null;
      const candidate = el ? (el.closest(selector) as HTMLElement) : null;
      if (!candidate) return null;
      // Allow opt-out per-element
      if (candidate.hasAttribute("data-no-fast-touch")) return null;
      return candidate;
    } catch (err) {
      return null;
    }
  }

  function onTouchStart(e: TouchEvent) {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const el = findTarget(e.target);
    if (!el) { startTarget = null; return; }
    startX = touch.clientX;
    startY = touch.clientY;
    startTarget = el;
  }

  function onTouchMove(e: TouchEvent) {
    if (!startTarget) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - startX);
    const dy = Math.abs(touch.clientY - startY);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      startTarget = null; // considered a scroll/drag
    }
  }

  // Capture native clicks and suppress them if we already triggered
  // a programmatic click for the same target recently. This prevents
  // double-invocation while leaving desktop mouse clicks untouched.
  function onDocumentClickCapture(e: MouseEvent) {
    try {
      const el = findTarget(e.target);
      if (!el) return;
      const ts = recentFastClick.get(el as HTMLElement);
      if (!ts) return;
      const now = Date.now();
      if (now - ts <= RECENT_MS && e.isTrusted) {
        // Native click following our touch — prevent duplicate.
        e.stopImmediatePropagation();
        e.preventDefault();
        recentFastClick.delete(el as HTMLElement);
      }
    } catch (err) {
      // noop
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (!startTarget) return;
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) { startTarget = null; return; }
    const dx = Math.abs(touch.clientX - startX);
    const dy = Math.abs(touch.clientY - startY);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) { startTarget = null; return; }

    // Programmatically trigger activation on the target so React handlers run.
    try {
      (startTarget as HTMLElement).focus?.({ preventScroll: true } as any);
    } catch {}

    try {
      // Use the built-in click() to better emulate a user activation.
      (startTarget as HTMLElement).click();
    } catch (err) {
      // Fallback to dispatching a synthetic event
      const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      startTarget.dispatchEvent(clickEvent);
    }

    // Mark this element so the following native click can be ignored.
    recentFastClick.set(startTarget as HTMLElement, Date.now());

    // clear
    startTarget = null;
  }

  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("touchend", onTouchEnd, { passive: true });

  // capture native clicks so we can suppress duplicates only when needed
  document.addEventListener("click", onDocumentClickCapture, true);

  // Return a cleanup function in case the app wants to remove listeners later.
  return function destroy() {
    document.removeEventListener("touchstart", onTouchStart as EventListener);
    document.removeEventListener("touchmove", onTouchMove as EventListener);
    document.removeEventListener("touchend", onTouchEnd as EventListener);
    document.removeEventListener("click", onDocumentClickCapture as EventListener, true as any);
  };
}

export default initFastTouch;
