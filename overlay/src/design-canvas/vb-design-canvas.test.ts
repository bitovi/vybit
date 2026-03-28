// @vitest-environment jsdom
import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';

// Register the element
import './index';
import { VbDesignCanvas } from './vb-design-canvas';

describe('VbDesignCanvas', () => {
  beforeAll(() => {
    // Ensure registration happened
    expect(customElements.get('vb-design-canvas')).toBe(VbDesignCanvas);
  });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('creates wrapper with data attribute', () => {
    const el = document.createElement('vb-design-canvas') as VbDesignCanvas;
    document.body.appendChild(el);

    const wrapper = el.getWrapper();
    expect(wrapper).toBeTruthy();
    expect(wrapper.getAttribute('data-tw-design-canvas')).toBe('true');
  });

  test('creates an iframe inside the wrapper', () => {
    const el = document.createElement('vb-design-canvas') as VbDesignCanvas;
    document.body.appendChild(el);

    const iframe = el.getIframe();
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    expect(iframe.allow).toBe('microphone');
  });

  test('syncs src attribute to iframe', () => {
    const el = document.createElement('vb-design-canvas') as VbDesignCanvas;
    el.setAttribute('src', 'http://localhost:3333/panel/?mode=design');
    document.body.appendChild(el);

    expect(el.getIframe().src).toBe('http://localhost:3333/panel/?mode=design');
  });

  test('syncs width and height attributes to wrapper', () => {
    const el = document.createElement('vb-design-canvas') as VbDesignCanvas;
    el.setAttribute('width', '500px');
    el.setAttribute('height', '300px');
    document.body.appendChild(el);

    expect(el.getWrapper().style.width).toBe('500px');
    expect(el.getWrapper().style.height).toBe('300px');
  });

  test('syncs min-height attribute', () => {
    const el = document.createElement('vb-design-canvas') as VbDesignCanvas;
    el.setAttribute('min-height', '100px');
    document.body.appendChild(el);

    expect(el.getWrapper().style.minHeight).toBe('100px');
  });

  test('has default width, height, and min-height', () => {
    const el = document.createElement('vb-design-canvas') as VbDesignCanvas;
    document.body.appendChild(el);

    expect(el.getWrapper().style.width).toBe('100%');
    expect(el.getWrapper().style.height).toBe('400px');
    expect(el.getWrapper().style.minHeight).toBe('200px');
  });

  test('uses display:contents on host', () => {
    const el = document.createElement('vb-design-canvas') as VbDesignCanvas;
    document.body.appendChild(el);

    expect(el.style.display).toBe('contents');
  });

  test('has resize handle children', () => {
    const el = document.createElement('vb-design-canvas') as VbDesignCanvas;
    document.body.appendChild(el);

    // wrapper children: iframe, resize handle (with bar), corner handle (with deco)
    const wrapper = el.getWrapper();
    expect(wrapper.children.length).toBe(3); // iframe, resizeHandle, cornerHandle
  });

  test('dispatches vb-canvas-ready on iframe load', () => {
    const el = document.createElement('vb-design-canvas') as VbDesignCanvas;
    document.body.appendChild(el);

    const handler = vi.fn();
    el.addEventListener('vb-canvas-ready', handler);

    // Simulate iframe load
    const iframe = el.getIframe();
    iframe.dispatchEvent(new Event('load'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.iframe).toBe(iframe);
  });

  test('cleans up document listeners on disconnect', () => {
    const el = document.createElement('vb-design-canvas') as VbDesignCanvas;
    document.body.appendChild(el);

    const spy = vi.spyOn(document, 'removeEventListener');
    el.remove();

    // Should have removed 4 listeners (resize move/up + corner move/up)
    const removeCalls = spy.mock.calls.filter(
      ([event]) => event === 'mousemove' || event === 'mouseup'
    );
    expect(removeCalls.length).toBe(4);

    spy.mockRestore();
  });
});
