/**
 * Fast Touch & 0ms Tap Dispatcher
 *
 * Implements an immediate, native touchstart/pointerdown activation mechanism
 * on mobile touchscreens to bypass mobile browser tap delays and double-tap wait times,
 * ensuring every single interactive element executes instantly on the very first touch contact (0ms).
 *
 * Desktop mouse clicks and keyboard interactions remain 100% untouched.
 */

let initialized = false;
let cleanupFn: (() => void) | null = null;

export function initFastTouch() {
  if (typeof window === "undefined") return () => {};
  if (initialized && cleanupFn) return cleanupFn;

  let lastFastTarget: HTMLElement | null = null;
  let lastFastTime = 0;

  // Track pointer movement to differentiate between tap and scroll
  let startX = 0;
  let startY = 0;
  let pendingScrollTarget: HTMLElement | null = null;
  let isScroll = false;
  const MOVE_THRESHOLD = 8; // px

  function getInteractiveTarget(target: EventTarget | null): HTMLElement | null {
    if (!target || !(target instanceof Element)) return null;

    // Never fast-activate text inputs, textareas, selects, or editable fields
    if (target.closest('input, textarea, select, [contenteditable="true"]')) {
      return null;
    }

    const el = target.closest<HTMLElement>(
      'button, a, [role="button"], .touch-target, .sidebar-nav-item, .category-filter-tab, .card-add-btn, .header-wishlist-btn, .header-cart-btn, .header-track-btn, .header-assistant-btn'
    );

    if (!el || el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") {
      return null;
    }

    return el;
  }

  function isInsideScrollable(el: HTMLElement): boolean {
    let parent: HTMLElement | null = el.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      const style = window.getComputedStyle(parent);
      const overflowX = style.overflowX;
      const overflowY = style.overflowY;
      if (
        (overflowX === "auto" || overflowX === "scroll" || overflowY === "auto" || overflowY === "scroll") &&
        (parent.scrollWidth > parent.clientWidth + 10 || parent.scrollHeight > parent.clientHeight + 10)
      ) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  function triggerAction(el: HTMLElement) {
    lastFastTarget = el;
    lastFastTime = Date.now();

    try {
      el.click();
    } catch {
      const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      el.dispatchEvent(evt);
    }

    // Clean up focus state on the next frame to prevent sticky focus outline/frame
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

  function onPointerDown(e: PointerEvent) {
    // Strictly handle touch events only — desktop mouse and pen are completely untouched
    if (e.pointerType !== "touch") return;

    const el = getInteractiveTarget(e.target);
    if (!el) return;

    // If the element is inside a scrollable container (e.g. scrollable category tabs, horizontal carousels),
    // wait for pointerup to confirm whether the user is tapping or scrolling
    if (isInsideScrollable(el)) {
      pendingScrollTarget = el;
      startX = e.clientX;
      startY = e.clientY;
      isScroll = false;
      return;
    }

    // For all fixed, standalone, and modal/header/sidebar controls:
    // Execute IMMEDIATELY on touch contact (0ms delay)
    triggerAction(el);
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerType !== "touch" || !pendingScrollTarget) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      isScroll = true;
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    if (pendingScrollTarget && !isScroll) {
      triggerAction(pendingScrollTarget);
    }
    pendingScrollTarget = null;
    isScroll = false;
  }

  function onPointerCancel(e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    pendingScrollTarget = null;
    isScroll = false;
  }

  // Fallback for touchstart/touchend if PointerEvent is not used
  function onTouchStart(e: TouchEvent) {
    if (window.PointerEvent) return; // PointerEvent handles this
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const el = getInteractiveTarget(e.target);
    if (!el) return;

    if (isInsideScrollable(el)) {
      pendingScrollTarget = el;
      startX = touch.clientX;
      startY = touch.clientY;
      isScroll = false;
      return;
    }

    triggerAction(el);
  }

  function onTouchMove(e: TouchEvent) {
    if (window.PointerEvent || !pendingScrollTarget) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - startX);
    const dy = Math.abs(touch.clientY - startY);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      isScroll = true;
    }
  }

  function onTouchEnd() {
    if (window.PointerEvent) return;
    if (pendingScrollTarget && !isScroll) {
      triggerAction(pendingScrollTarget);
    }
    pendingScrollTarget = null;
    isScroll = false;
  }

  // Suppress duplicate browser-generated native click events following fast taps
  function onDocumentClickCapture(e: MouseEvent) {
    // Only intercept trusted browser-generated clicks, not our programmatic click()
    if (!e.isTrusted && !(e as any).__isMockTrusted) return;

    if (lastFastTarget && Date.now() - lastFastTime < 600) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      lastFastTarget = null;
    }
  }

  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerCancel, { passive: true });

  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });

  document.addEventListener("click", onDocumentClickCapture, true);

  initialized = true;

  cleanupFn = function destroy() {
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);

    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);

    document.removeEventListener("click", onDocumentClickCapture, true);
    initialized = false;
    cleanupFn = null;
  };

  return cleanupFn;
}

export default initFastTouch;
