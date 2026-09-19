const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '.touch-target',
  '.sidebar-nav-item',
  '[data-rapid-touch]'
].join(', ');

const applyTouchOptimization = (target: HTMLElement | null) => {
  if (!target || !target.isConnected) {
    return;
  }

  try {
    target.style.touchAction = 'manipulation';
    (target.style as CSSStyleDeclaration & { WebkitTapHighlightColor?: string }).WebkitTapHighlightColor = 'transparent';
  } catch (error) {
    // ignore style application failures on unsupported elements
  }
};

export function initFastTouch() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return function destroy() {};
  }

  const owner = document as Document & { __phermonoFastTouch?: boolean };
  if (owner.__phermonoFastTouch) {
    return function destroy() {};
  }

  const handlePointerDown = (event: Event) => {
    const target = event.target as HTMLElement | null;
    const interactive = target?.closest(INTERACTIVE_SELECTOR) as HTMLElement | null;

    if (interactive) {
      applyTouchOptimization(interactive);
    }
  };

  const handleTouchStart = (event: Event) => {
    const target = event.target as HTMLElement | null;
    const interactive = target?.closest(INTERACTIVE_SELECTOR) as HTMLElement | null;

    if (interactive) {
      applyTouchOptimization(interactive);
    }
  };

  document.addEventListener('pointerdown', handlePointerDown, { passive: true, capture: true });
  document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
  owner.__phermonoFastTouch = true;

  return function destroy() {
    document.removeEventListener('pointerdown', handlePointerDown, true);
    document.removeEventListener('touchstart', handleTouchStart, true);
    owner.__phermonoFastTouch = false;
  };
}

export default initFastTouch;
