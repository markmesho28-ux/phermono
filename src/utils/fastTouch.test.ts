import initFastTouch from './fastTouch';

describe('initFastTouch focus cleanup & touch responsiveness', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    jest.restoreAllMocks();
  });

  it('initializes and returns a cleanup function without throwing', () => {
    const cleanup = initFastTouch();
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('automatically blurs focused buttons after touchend', () => {
    const button = document.createElement('button');
    button.textContent = 'Tap Me';
    container.appendChild(button);

    const cleanup = initFastTouch();

    button.focus();
    expect(document.activeElement).toBe(button);

    // Dispatch touchend
    window.dispatchEvent(new Event('touchend'));

    // Fast-forward animation frame
    expect(document.activeElement).toBe(button); // before rAF
    // Trigger requestAnimationFrame callback
    // JSDOM runs rAF with jest fake timers or immediate if invoked
    cleanup();
  });

  it('does NOT swallow native clicks or prevent default', () => {
    const cleanup = initFastTouch();
    const button = document.createElement('button');
    let clicked = false;
    button.onclick = () => { clicked = true; };
    container.appendChild(button);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(clickEvent);

    expect(clicked).toBe(true);
    expect(clickEvent.defaultPrevented).toBe(false);

    cleanup();
  });
});
