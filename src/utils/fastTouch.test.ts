import initFastTouch from './fastTouch';

describe('initFastTouch instant 0ms touch responsiveness', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    cleanup = initFastTouch();
  });

  afterEach(() => {
    cleanup();
    document.body.removeChild(container);
    jest.restoreAllMocks();
  });

  it('instantly executes button click on touch pointerdown (0ms delay)', () => {
    const button = document.createElement('button');
    let clicked = false;
    button.onclick = () => { clicked = true; };
    container.appendChild(button);

    // Simulate mobile touch pointerdown
    const touchPointerDown = new Event('pointerdown', { bubbles: true }) as any;
    touchPointerDown.pointerType = 'touch';
    button.dispatchEvent(touchPointerDown);

    expect(clicked).toBe(true);
  });

  it('ignores desktop mouse pointerdown events completely', () => {
    const button = document.createElement('button');
    let clicked = false;
    button.onclick = () => { clicked = true; };
    container.appendChild(button);

    // Simulate desktop mouse pointerdown
    const mousePointerDown = new Event('pointerdown', { bubbles: true }) as any;
    mousePointerDown.pointerType = 'mouse';
    button.dispatchEvent(mousePointerDown);

    expect(clicked).toBe(false);
  });

  it('does not trigger disabled buttons', () => {
    const button = document.createElement('button');
    button.disabled = true;
    let clicked = false;
    button.onclick = () => { clicked = true; };
    container.appendChild(button);

    const touchPointerDown = new Event('pointerdown', { bubbles: true }) as any;
    touchPointerDown.pointerType = 'touch';
    button.dispatchEvent(touchPointerDown);

    expect(clicked).toBe(false);
  });

  it('suppresses duplicate native click following fast touch', () => {
    const button = document.createElement('button');
    let clickCount = 0;
    button.onclick = () => { clickCount++; };
    container.appendChild(button);

    // 1. Fast touch on pointerdown
    const touchPointerDown = new Event('pointerdown', { bubbles: true }) as any;
    touchPointerDown.pointerType = 'touch';
    button.dispatchEvent(touchPointerDown);

    expect(clickCount).toBe(1);

    // 2. Subsequent native browser click event
    const nativeClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    (nativeClick as any).__isMockTrusted = true;
    button.dispatchEvent(nativeClick);

    // Should still be 1 (duplicate suppressed)
    expect(clickCount).toBe(1);
  });
});

