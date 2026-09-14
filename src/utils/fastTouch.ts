// Delegated fast-touch handler for elements marked with the `.touch-target` class.
// Purpose: ensure immediate activation of interactive elements on first touch
// without changing desktop mouse behavior.

type MaybeElement = HTMLElement | null;

export function initFastTouch(selector = ".touch-target") {
  if (typeof window === "undefined" || !("ontouchstart" in window)) return;

  let startX = 0;
  let startY = 0;
  let startTarget: MaybeElement = null;
  const MOVE_THRESHOLD = 10; // px

  function findTarget(t: EventTarget | null): MaybeElement {
    try {
      const el = t as HTMLElement | null;
      return el ? el.closest(selector) as HTMLElement : null;
    } catch (err) {
      return null;
    }
  }

  function onTouchStart(e: TouchEvent) {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const el = findTarget(e.target);
    if (!el) return;
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

  function onTouchEnd(e: TouchEvent) {
    if (!startTarget) return;
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) { startTarget = null; return; }
    const dx = Math.abs(touch.clientX - startX);
    const dy = Math.abs(touch.clientY - startY);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) { startTarget = null; return; }

    // Prevent the synthetic mouse events that follow a touch sequence
    // and immediately trigger a click on the target so handlers run without delay.
    e.preventDefault();

    try {
      // focus for accessibility
      (startTarget as HTMLElement).focus?.();
    } catch {}

    const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
    startTarget.dispatchEvent(clickEvent);

    // clear
    startTarget = null;
  }

  document.addEventListener("touchstart", onTouchStart, { passive: false });
  document.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("touchend", onTouchEnd, { passive: false });

  // Return a cleanup function in case the app wants to remove listeners later.
  return function destroy() {
    document.removeEventListener("touchstart", onTouchStart as EventListener);
    document.removeEventListener("touchmove", onTouchMove as EventListener);
    document.removeEventListener("touchend", onTouchEnd as EventListener);
  };
}

export default initFastTouch;
