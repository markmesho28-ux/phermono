import initFastTouch from './fastTouch';

describe('Native touch responsiveness and keyboard input focus', () => {
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

  it('initializes and cleans up cleanly without throwing', () => {
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });

  it('allows native button clicks to fire immediately on first interaction', () => {
    const button = document.createElement('button');
    let clicked = false;
    button.onclick = () => { clicked = true; };
    container.appendChild(button);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(clickEvent);

    expect(clicked).toBe(true);
    expect(clickEvent.defaultPrevented).toBe(false);
  });

  it('allows text inputs to receive click events without prevention or interception', () => {
    const input = document.createElement('input');
    input.type = 'text';
    container.appendChild(input);

    let inputClicked = false;
    input.onclick = () => { inputClicked = true; };

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    input.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(inputClicked).toBe(true);
  });

  it('allows natural mobile virtual keyboard focus on input fields', () => {
    const input = document.createElement('input');
    input.type = 'text';
    container.appendChild(input);

    let focused = false;
    input.onfocus = () => { focused = true; };

    input.focus();
    expect(document.activeElement).toBe(input);
    expect(focused).toBe(true);
  });

  it('does not suppress native touchstart or synthesize a click before the browser click fires', () => {
    const button = document.createElement('button');
    let clicked = 0;
    button.type = 'button';
    button.onclick = () => { clicked += 1; };
    container.appendChild(button);

    const touchStart = new Event('touchstart', { bubbles: true, cancelable: true });
    button.dispatchEvent(touchStart);

    expect(touchStart.defaultPrevented).toBe(false);
    expect(clicked).toBe(0);
  });

  it('ensures textarea fields allow immediate focus for typing', () => {
    const textarea = document.createElement('textarea');
    container.appendChild(textarea);

    let focused = false;
    textarea.onfocus = () => { focused = true; };

    textarea.focus();
    expect(document.activeElement).toBe(textarea);
    expect(focused).toBe(true);
  });
});

