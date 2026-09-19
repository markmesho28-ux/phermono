const READY_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  '.touch-target',
  '.sidebar-nav-item',
  '[data-rapid-touch]'
].join(', ');

function activateQuickTouch(target: HTMLElement) {
  if (!target || target.dataset.rapidTouchActivated === 'true') {
    return;
  }

  const isField = target.matches('input, select, textarea, [contenteditable="true"]');
  const isDisabled = target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true';

  if (isField || isDisabled) {
    return;
  }

  target.dataset.rapidTouchActivated = 'true';

  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
  });

  target.dispatchEvent(clickEvent);

  window.setTimeout(() => {
    delete target.dataset.rapidTouchActivated;
  }, 220);
}

export function initFastTouch() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return function destroy() {};
  }

  const owner = document as Document & { __phermonoFastTouch?: boolean };
  if (owner.__phermonoFastTouch) {
    return function destroy() {};
  }

  const handleTouchStart = (event: Event) => {
    const target = event.target as HTMLElement | null;
    const interactive = target?.closest(READY_SELECTOR) as HTMLElement | null;

    if (!interactive) {
      return;
    }

    if (!interactive.isConnected) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    activateQuickTouch(interactive);
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') {
      return;
    }

    const target = event.target as HTMLElement | null;
    const interactive = target?.closest(READY_SELECTOR) as HTMLElement | null;

    if (!interactive || !interactive.isConnected) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    activateQuickTouch(interactive);
  };

  document.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
  document.addEventListener('pointerdown', handlePointerDown, { passive: false, capture: true });
  owner.__phermonoFastTouch = true;

  return function destroy() {
    document.removeEventListener('touchstart', handleTouchStart, true);
    document.removeEventListener('pointerdown', handlePointerDown, true);
    owner.__phermonoFastTouch = false;
  };
}

export default initFastTouch;
