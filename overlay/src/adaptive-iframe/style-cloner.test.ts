// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  extractStyles,
  applyStylesToHost,
  injectChildStyles,
  CHILD_STYLE_PROPERTIES,
} from './style-cloner';

/**
 * Mock getComputedStyle so that the given element returns `styles`,
 * while any other element (i.e. the baseline) returns empty strings.
 * The mock is iterable (like real CSSStyleDeclaration) so the
 * baseline-comparison loop in extractStyles/injectChildStyles works.
 */
function mockComputedStyleFor(
  el: Element,
  styles: Record<string, string>,
): void {
  const props = Object.keys(styles);
  const emptyDecl = {
    getPropertyValue: () => '',
    length: 0,
  } as unknown as CSSStyleDeclaration;

  vi.spyOn(window, 'getComputedStyle').mockImplementation((target: Element) => {
    if (target === el) {
      return {
        getPropertyValue(prop: string) { return styles[prop] ?? ''; },
        length: props.length,
        ...Object.fromEntries(props.map((p, i) => [i, p])),
      } as unknown as CSSStyleDeclaration;
    }
    // Baseline or other elements — return defaults (all empty)
    return emptyDecl;
  });
}

describe('extractStyles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns only non-default properties', () => {
    const el = document.createElement('button');
    const styles = {
      display: 'inline-flex',
      color: 'rgb(255, 0, 0)',
      'font-size': '14px',
      'align-items': 'center',
      gap: '8px',
    };
    mockComputedStyleFor(el, styles);

    const result = extractStyles(el);

    for (const [prop, value] of Object.entries(styles)) {
      expect(result[prop]).toBe(value);
    }
  });

  test('skips properties that match the baseline (except always-extract)', () => {
    const el = document.createElement('div');
    const props = ['display', 'color'];
    // Mock: both source and baseline return the same values
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({
      getPropertyValue(prop: string) {
        return prop === 'display' ? 'block' : '';
      },
      length: props.length,
      ...Object.fromEntries(props.map((p, i) => [i, p])),
    } as unknown as CSSStyleDeclaration));

    const result = extractStyles(el);

    // display=block matches baseline and is not in ALWAYS_EXTRACT → skipped
    expect(result['display']).toBeUndefined();
    // color is in ALWAYS_EXTRACT → always included even if it matches baseline
    expect(result['color']).toBe('');
  });

  test('returns empty object when no computed properties', () => {
    const el = document.createElement('div');
    mockComputedStyleFor(el, {});
    const result = extractStyles(el);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('includes display, width, height, color, font-size', () => {
    const el = document.createElement('div');
    const styles = {
      display: 'flex',
      width: '200px',
      height: '100px',
      color: 'rgb(0, 0, 0)',
      'font-size': '16px',
    };
    mockComputedStyleFor(el, styles);

    const result = extractStyles(el);
    expect(result['display']).toBe('flex');
    expect(result['width']).toBe('200px');
    expect(result['height']).toBe('100px');
    expect(result['color']).toBe('rgb(0, 0, 0)');
    expect(result['font-size']).toBe('16px');
  });

  test('creates baseline with same tag as source element', () => {
    const el = document.createElement('button');
    const createSpy = vi.spyOn(document, 'createElement');
    mockComputedStyleFor(el, { display: 'inline-flex' });

    extractStyles(el);

    // Should have been called to create a baseline 'button' element
    expect(createSpy).toHaveBeenCalledWith('button');
  });
});

describe('applyStylesToHost', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('sets inline styles on host element', () => {
    const host = document.createElement('div');
    applyStylesToHost(host, {
      width: '200px',
      height: '100px',
      'background-color': 'red',
    });

    expect(host.style.getPropertyValue('width')).toBe('200px');
    expect(host.style.getPropertyValue('background-color')).toBe('red');
  });

  test('skips height so ghost content drives it naturally', () => {
    const host = document.createElement('div');
    applyStylesToHost(host, { height: '100px', width: '200px' });

    expect(host.style.getPropertyValue('height')).toBe('');
    expect(host.style.getPropertyValue('width')).toBe('200px');
  });

  test('preserves display: inline as-is', () => {
    const host = document.createElement('div');
    applyStylesToHost(host, { display: 'inline' });

    expect(host.style.getPropertyValue('display')).toBe('inline');
  });

  test('preserves display: block as-is', () => {
    const host = document.createElement('div');
    applyStylesToHost(host, { display: 'block' });

    expect(host.style.getPropertyValue('display')).toBe('block');
  });

  test('preserves display: flex as-is', () => {
    const host = document.createElement('div');
    applyStylesToHost(host, { display: 'flex' });

    expect(host.style.getPropertyValue('display')).toBe('flex');
  });

  test('skips block-size so ghost content drives height naturally', () => {
    const host = document.createElement('div');
    applyStylesToHost(host, { 'block-size': '106px', 'inline-size': '200px' });

    expect(host.style.getPropertyValue('block-size')).toBe('');
    expect(host.style.getPropertyValue('inline-size')).toBe('200px');
  });

  test('skips inline-size when it matches containerWidth (auto-fill)', () => {
    const host = document.createElement('div');
    applyStylesToHost(host, { 'inline-size': '800px', 'background-color': 'red' }, 800);

    expect(host.style.getPropertyValue('inline-size')).toBe('');
    expect(host.style.getPropertyValue('background-color')).toBe('red');
  });

  test('skips width when it matches containerWidth (auto-fill)', () => {
    const host = document.createElement('div');
    applyStylesToHost(host, { width: '800px', 'background-color': 'red' }, 800);

    expect(host.style.getPropertyValue('width')).toBe('');
    expect(host.style.getPropertyValue('background-color')).toBe('red');
  });

  test('preserves inline-size when it differs from containerWidth', () => {
    const host = document.createElement('div');
    applyStylesToHost(host, { 'inline-size': '240px' }, 800);

    expect(host.style.getPropertyValue('inline-size')).toBe('240px');
  });

  test('skips perspective-origin and transform-origin (geometry-derived)', () => {
    const host = document.createElement('div');
    applyStylesToHost(host, {
      'perspective-origin': '400px 53px',
      'transform-origin': '400px 53px',
      'background-color': 'red',
    });

    expect(host.style.getPropertyValue('perspective-origin')).toBe('');
    expect(host.style.getPropertyValue('transform-origin')).toBe('');
    expect(host.style.getPropertyValue('background-color')).toBe('red');
  });
});

describe('injectChildStyles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('applies non-default computed styles to cloned element', () => {
    const source = document.createElement('span');
    source.textContent = 'hello';
    document.body.appendChild(source);

    const clone = document.createElement('span');
    clone.textContent = 'hello';

    const mockStyles: Record<string, string> = {
      color: 'rgb(255, 0, 0)',
      'font-size': '14px',
      display: 'inline',
    };
    mockComputedStyleFor(source, mockStyles);

    injectChildStyles(source, clone);

    expect(clone.style.getPropertyValue('color')).toBe('rgb(255, 0, 0)');
    expect(clone.style.getPropertyValue('font-size')).toBe('14px');
    // display: 'inline' is the default for <span>, but our mock returns ''
    // for the baseline, so it shows as non-default here
    expect(clone.style.getPropertyValue('display')).toBe('inline');

    document.body.removeChild(source);
  });

  test('recurses into child elements', () => {
    const source = document.createElement('div');
    const sourceChild = document.createElement('span');
    sourceChild.textContent = 'child';
    source.appendChild(sourceChild);

    const clone = document.createElement('div');
    const cloneChild = document.createElement('span');
    cloneChild.textContent = 'child';
    clone.appendChild(cloneChild);

    // Mock: both source and sourceChild return color: blue (non-default)
    const props = ['color'];
    vi.spyOn(window, 'getComputedStyle').mockImplementation((target: Element) => {
      if (target === source || target === sourceChild) {
        return {
          getPropertyValue: (p: string) => p === 'color' ? 'blue' : '',
          length: props.length,
          ...Object.fromEntries(props.map((p, i) => [i, p])),
        } as unknown as CSSStyleDeclaration;
      }
      return {
        getPropertyValue: () => '',
        length: 0,
      } as unknown as CSSStyleDeclaration;
    });

    injectChildStyles(source, clone);

    expect(cloneChild.style.getPropertyValue('color')).toBe('blue');
  });

  test('skips width and height on children', () => {
    const source = document.createElement('div');
    document.body.appendChild(source);
    const clone = document.createElement('div');

    const mockStyles: Record<string, string> = {
      width: '200px',
      height: '100px',
      'inline-size': '750px',
      'block-size': '24px',
      'perspective-origin': '375px 12px',
      'transform-origin': '375px 12px',
      color: 'rgb(255, 0, 0)',
    };
    mockComputedStyleFor(source, mockStyles);

    injectChildStyles(source, clone);

    expect(clone.style.getPropertyValue('width')).toBe('');
    expect(clone.style.getPropertyValue('height')).toBe('');
    expect(clone.style.getPropertyValue('inline-size')).toBe('');
    expect(clone.style.getPropertyValue('block-size')).toBe('');
    expect(clone.style.getPropertyValue('perspective-origin')).toBe('');
    expect(clone.style.getPropertyValue('transform-origin')).toBe('');
    expect(clone.style.getPropertyValue('color')).toBe('rgb(255, 0, 0)');

    document.body.removeChild(source);
  });

  test('handles null source gracefully', () => {
    expect(() => injectChildStyles(null, document.createElement('div'))).not.toThrow();
  });

  test('handles null clone gracefully', () => {
    expect(() => injectChildStyles(document.createElement('div'), null)).not.toThrow();
  });
});
