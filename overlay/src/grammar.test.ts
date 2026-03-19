import { describe, it, expect } from 'vitest';
import {
  nothing, keyword, color, scale, withSide, withCorner, oneOf, custom,
  makeParser, sideParser, cornerParser, enumParser, parseToken, parseTokens,
  TAILWIND_PARSERS,
} from './grammar';
import type { ParsedToken } from './grammar';

/** Shorthand: parse one class against the full registry */
function parse(cls: string): ParsedToken | null {
  return parseToken(cls, TAILWIND_PARSERS);
}

// ─────────────────────────────────────────────────────────────
// Combinators in isolation
// ─────────────────────────────────────────────────────────────

describe('nothing()', () => {
  it('matches empty suffix', () => expect(nothing()('')).toEqual({ props: {} }));
  it('rejects non-empty suffix', () => expect(nothing()('2')).toBeNull());
});

describe('keyword()', () => {
  const seg = keyword('style', ['solid', 'dashed', 'dotted']);
  it('matches a listed value', () => expect(seg('dashed')).toEqual({ props: { style: 'dashed' } }));
  it('rejects unlisted value', () => expect(seg('wavy')).toBeNull());
  it('rejects empty string', () => expect(seg('')).toBeNull());
});

describe('scale()', () => {
  const seg = scale('spacing');
  it('matches a scale token', () => expect(seg('4')).toEqual({ props: { scale: '4', scaleName: 'spacing' } }));
  it('matches named scale token', () => expect(seg('px')).toEqual({ props: { scale: 'px', scaleName: 'spacing' } }));
  it('rejects empty string', () => expect(seg('')).toBeNull());
});

describe('color()', () => {
  const seg = color();
  it('matches a color token', () => expect(seg('red-500')).toEqual({ props: { color: 'red-500' } }));
  it('matches a named color', () => expect(seg('white')).toEqual({ props: { color: 'white' } }));
  it('rejects empty string', () => expect(seg('')).toBeNull());
});

describe('withSide()', () => {
  const seg = withSide(scale('spacing'));

  it('extracts directional side + scale', () =>
    expect(seg('t-4')).toEqual({ props: { side: 't', scale: '4', scaleName: 'spacing' } }));

  it('extracts x axis + scale', () =>
    expect(seg('x-8')).toEqual({ props: { side: 'x', scale: '8', scaleName: 'spacing' } }));

  it('falls through to inner when no side present', () =>
    expect(seg('4')).toEqual({ props: { scale: '4', scaleName: 'spacing' } }));

  it('returns null when inner also rejects', () =>
    expect(seg('')).toBeNull());
});

describe('withCorner()', () => {
  const seg = withCorner(scale('borderRadius'));

  it('extracts corner + scale', () =>
    expect(seg('tl-lg')).toEqual({ props: { corner: 'tl', scale: 'lg', scaleName: 'borderRadius' } }));

  it('falls through to inner when no corner', () =>
    expect(seg('lg')).toEqual({ props: { scale: 'lg', scaleName: 'borderRadius' } }));
});

describe('oneOf()', () => {
  const seg = oneOf(
    nothing(),
    keyword('style', ['solid', 'dashed']),
    color(),
  );

  it('matches first branch (empty)', () => expect(seg('')).toEqual({ props: {} }));
  it('matches second branch (keyword)', () => expect(seg('dashed')).toEqual({ props: { style: 'dashed' } }));
  it('matches third branch (color)', () => expect(seg('red-500')).toEqual({ props: { color: 'red-500' } }));
  it('returns null when nothing matches', () => {
    // This combinator returns null ONLY if all branches return null.
    // To test this, we'd need branches that never match — not realistic with color() as fallback.
    // Instead, verify the order: if we try an empty keyword set, then color catches it.
    const strictSeg = oneOf(nothing(), keyword('style', []));
    expect(strictSeg('anything')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// makeParser / parseToken
// ─────────────────────────────────────────────────────────────

describe('parseToken()', () => {
  // Border width values that can appear after border- or border-{side}-
  const BORDER_WIDTH_VALUES = ['0', '2', '4', '8'];

  const parsers = [
    makeParser('border', oneOf(
      nothing(),
      keyword('style', ['solid', 'dashed', 'dotted', 'double', 'none']),
      withSide(keyword('scale', BORDER_WIDTH_VALUES)),
      color(),
    )),
    makeParser('rounded', oneOf(
      nothing(),
      withCorner(scale('borderRadius')),
      scale('borderRadius'),
    )),
    ...sideParser('p', scale('spacing')),
    ...sideParser('m', scale('spacing')),
  ];

  // border
  it('border (bare)', () =>
    expect(parseToken('border', parsers)).toEqual({ property: 'border', fullClass: 'border' }));

  it('border-2 (width)', () =>
    expect(parseToken('border-2', parsers)).toEqual(
      { property: 'border', fullClass: 'border-2', scale: '2' }));

  it('border-t-2 (side + width)', () =>
    expect(parseToken('border-t-2', parsers)).toEqual(
      { property: 'border', fullClass: 'border-t-2', side: 't', scale: '2' }));

  it('border-dashed (style)', () =>
    expect(parseToken('border-dashed', parsers)).toEqual(
      { property: 'border', fullClass: 'border-dashed', style: 'dashed' }));

  it('border-red-500 (color)', () =>
    expect(parseToken('border-red-500', parsers)).toEqual(
      { property: 'border', fullClass: 'border-red-500', color: 'red-500' }));

  it('border-something-weird (unknown suffix)', () =>
    expect(parseToken('border-something-weird', parsers)).toEqual(
      { property: 'border', fullClass: 'border-something-weird', color: 'something-weird' }));

  // rounded
  it('rounded (bare)', () =>
    expect(parseToken('rounded', parsers)).toEqual({ property: 'rounded', fullClass: 'rounded' }));

  it('rounded-lg', () =>
    expect(parseToken('rounded-lg', parsers)).toEqual(
      { property: 'rounded', fullClass: 'rounded-lg', scale: 'lg', scaleName: 'borderRadius' }));

  it('rounded-tl-lg (corner)', () =>
    expect(parseToken('rounded-tl-lg', parsers)).toEqual(
      { property: 'rounded', fullClass: 'rounded-tl-lg', corner: 'tl', scale: 'lg', scaleName: 'borderRadius' }));

  // padding
  it('pt-4', () =>
    expect(parseToken('pt-4', parsers)).toEqual(
      { property: 'p', fullClass: 'pt-4', side: 't', scale: '4', scaleName: 'spacing' }));

  it('p-0', () =>
    expect(parseToken('p-0', parsers)).toEqual(
      { property: 'p', fullClass: 'p-0', scale: '0', scaleName: 'spacing' }));

  // no match
  it('returns null for unregistered prefix', () =>
    expect(parseToken('opacity-50', parsers)).toBeNull());
});

// ─────────────────────────────────────────────────────────────
// parseTokens (multiple classes)
// ─────────────────────────────────────────────────────────────

describe('parseTokens()', () => {
  const BORDER_WIDTH_VALUES = ['0', '2', '4', '8'];
  const parsers = [
    makeParser('border', oneOf(nothing(), keyword('style', ['solid', 'dashed']), withSide(keyword('scale', BORDER_WIDTH_VALUES)), color())),
    ...sideParser('p', scale('spacing')),
  ];

  it('parses multiple classes', () => {
    const result = parseTokens('border border-dashed pt-4', parsers);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ property: 'border', fullClass: 'border' });
    expect(result[1]).toMatchObject({ property: 'border', style: 'dashed' });
    expect(result[2]).toMatchObject({ property: 'p', side: 't', scale: '4' });
  });

  it('omits unrecognized prefixes', () => {
    const result = parseTokens('opacity-50 p-4', parsers);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ property: 'p', scale: '4' });
  });
});

// ─────────────────────────────────────────────────────────────
// TAILWIND_PARSERS registry — full coverage
// ─────────────────────────────────────────────────────────────

describe('TAILWIND_PARSERS — spacing', () => {
  it('m-4',  () => expect(parse('m-4')).toMatchObject({ property: 'm', scale: '4', scaleName: 'spacing' }));
  it('mx-2', () => expect(parse('mx-2')).toMatchObject({ property: 'm', side: 'x', scale: '2' }));
  it('my-auto', () => expect(parse('my-auto')).toMatchObject({ property: 'm', side: 'y', scale: 'auto' }));
  it('mt-0', () => expect(parse('mt-0')).toMatchObject({ property: 'm', side: 't', scale: '0' }));
  it('mr-1', () => expect(parse('mr-1')).toMatchObject({ property: 'm', side: 'r', scale: '1' }));
  it('mb-8', () => expect(parse('mb-8')).toMatchObject({ property: 'm', side: 'b', scale: '8' }));
  it('ml-3', () => expect(parse('ml-3')).toMatchObject({ property: 'm', side: 'l', scale: '3' }));
  it('ms-4 (logical)', () => expect(parse('ms-4')).toMatchObject({ property: 'm', side: 's', scale: '4' }));
  it('me-4 (logical)', () => expect(parse('me-4')).toMatchObject({ property: 'm', side: 'e', scale: '4' }));
  it('mbs-4 (block-axis logical)', () => expect(parse('mbs-4')).toMatchObject({ property: 'm', side: 'bs', scale: '4' }));
  it('mbe-2 (block-axis logical)', () => expect(parse('mbe-2')).toMatchObject({ property: 'm', side: 'be', scale: '2' }));

  it('p-4',  () => expect(parse('p-4')).toMatchObject({ property: 'p', scale: '4' }));
  it('px-6', () => expect(parse('px-6')).toMatchObject({ property: 'p', side: 'x', scale: '6' }));
  it('py-3', () => expect(parse('py-3')).toMatchObject({ property: 'p', side: 'y', scale: '3' }));
  it('pt-2', () => expect(parse('pt-2')).toMatchObject({ property: 'p', side: 't', scale: '2' }));
  it('pr-1', () => expect(parse('pr-1')).toMatchObject({ property: 'p', side: 'r', scale: '1' }));
  it('pb-0', () => expect(parse('pb-0')).toMatchObject({ property: 'p', side: 'b', scale: '0' }));
  it('pl-5', () => expect(parse('pl-5')).toMatchObject({ property: 'p', side: 'l', scale: '5' }));
  it('ps-2 (logical)', () => expect(parse('ps-2')).toMatchObject({ property: 'p', side: 's', scale: '2' }));
  it('pe-2 (logical)', () => expect(parse('pe-2')).toMatchObject({ property: 'p', side: 'e', scale: '2' }));

  it('gap-4',   () => expect(parse('gap-4')).toMatchObject({ property: 'gap', scale: '4' }));
  it('gap-x-2', () => expect(parse('gap-x-2')).toMatchObject({ property: 'gap-x', scale: '2' }));
  it('gap-y-8', () => expect(parse('gap-y-8')).toMatchObject({ property: 'gap-y', scale: '8' }));
  it('space-x-4', () => expect(parse('space-x-4')).toMatchObject({ property: 'space-x', scale: '4' }));
  it('space-y-2', () => expect(parse('space-y-2')).toMatchObject({ property: 'space-y', scale: '2' }));
});

describe('TAILWIND_PARSERS — sizing', () => {
  it('w-64',    () => expect(parse('w-64')).toMatchObject({ property: 'w', scale: '64' }));
  it('w-full',  () => expect(parse('w-full')).toMatchObject({ property: 'w', scale: 'full' }));
  it('h-screen', () => expect(parse('h-screen')).toMatchObject({ property: 'h', scale: 'screen' }));
  it('min-w-0', () => expect(parse('min-w-0')).toMatchObject({ property: 'min-w', scale: '0' }));
  it('max-w-lg', () => expect(parse('max-w-lg')).toMatchObject({ property: 'max-w', scale: 'lg' }));
  it('min-h-full', () => expect(parse('min-h-full')).toMatchObject({ property: 'min-h', scale: 'full' }));
  it('max-h-screen', () => expect(parse('max-h-screen')).toMatchObject({ property: 'max-h', scale: 'screen' }));
  it('size-10', () => expect(parse('size-10')).toMatchObject({ property: 'size', scale: '10' }));
});

describe('TAILWIND_PARSERS — typography', () => {
  it('font-bold (weight)', () => expect(parse('font-bold')).toMatchObject({ property: 'font', scale: 'bold' }));
  it('font-extralight (weight)', () => expect(parse('font-extralight')).toMatchObject({ property: 'font', scale: 'extralight' }));
  it('font-sans (family)', () => expect(parse('font-sans')).toMatchObject({ property: 'font-sans', fullClass: 'font-sans' }));
  it('font-serif', () => expect(parse('font-serif')).toMatchObject({ property: 'font-serif' }));
  it('font-mono', () => expect(parse('font-mono')).toMatchObject({ property: 'font-mono' }));

  it('text-sm (size)', () => expect(parse('text-sm')).toMatchObject({ property: 'text', size: 'sm' }));
  it('text-xl (size)', () => expect(parse('text-xl')).toMatchObject({ property: 'text', size: 'xl' }));
  it('text-center (align)', () => expect(parse('text-center')).toMatchObject({ property: 'text', align: 'center' }));
  it('text-left (align)', () => expect(parse('text-left')).toMatchObject({ property: 'text', align: 'left' }));
  it('text-red-500 (color)', () => expect(parse('text-red-500')).toMatchObject({ property: 'text', color: 'red-500' }));
  it('text-white (color)', () => expect(parse('text-white')).toMatchObject({ property: 'text', color: 'white' }));

  it('leading-6', () => expect(parse('leading-6')).toMatchObject({ property: 'leading', scale: '6' }));
  it('tracking-wide', () => expect(parse('tracking-wide')).toMatchObject({ property: 'tracking', scale: 'wide' }));
  it('leading-none (keyword)', () => expect(parse('leading-none')).toMatchObject({ property: 'leading', scale: 'none' }));

  it('italic', () => expect(parse('italic')).toMatchObject({ property: 'italic' }));
  it('not-italic', () => expect(parse('not-italic')).toMatchObject({ property: 'not-italic' }));
  it('underline', () => expect(parse('underline')).toMatchObject({ property: 'underline' }));
  it('line-through', () => expect(parse('line-through')).toMatchObject({ property: 'line-through' }));
  it('uppercase', () => expect(parse('uppercase')).toMatchObject({ property: 'uppercase' }));
  it('lowercase', () => expect(parse('lowercase')).toMatchObject({ property: 'lowercase' }));
  it('capitalize', () => expect(parse('capitalize')).toMatchObject({ property: 'capitalize' }));
  it('normal-case', () => expect(parse('normal-case')).toMatchObject({ property: 'normal-case' }));
  it('truncate', () => expect(parse('truncate')).toMatchObject({ property: 'truncate' }));

  it('align-baseline', () => expect(parse('align-baseline')).toMatchObject({ property: 'align-baseline' }));
  it('align-middle', () => expect(parse('align-middle')).toMatchObject({ property: 'align-middle' }));
  it('align-text-top', () => expect(parse('align-text-top')).toMatchObject({ property: 'align-text-top' }));
  it('align-text-bottom', () => expect(parse('align-text-bottom')).toMatchObject({ property: 'align-text-bottom' }));
});

describe('TAILWIND_PARSERS — colors / backgrounds', () => {
  it('bg-red-500', () => expect(parse('bg-red-500')).toMatchObject({ property: 'bg', color: 'red-500' }));
  it('bg-white', () => expect(parse('bg-white')).toMatchObject({ property: 'bg', color: 'white' }));
  it('bg-gradient-to-r', () => expect(parse('bg-gradient-to-r')).toMatchObject({ property: 'bg-gradient-to', direction: 'r' }));
  it('bg-gradient-to-tl', () => expect(parse('bg-gradient-to-tl')).toMatchObject({ property: 'bg-gradient-to', direction: 'tl' }));
  it('from-blue-500', () => expect(parse('from-blue-500')).toMatchObject({ property: 'from', color: 'blue-500' }));
  it('via-purple-300', () => expect(parse('via-purple-300')).toMatchObject({ property: 'via', color: 'purple-300' }));
  it('to-pink-400', () => expect(parse('to-pink-400')).toMatchObject({ property: 'to', color: 'pink-400' }));
  it('ring-blue-500', () => expect(parse('ring-blue-500')).toMatchObject({ property: 'ring', color: 'blue-500' }));
  it('outline-red-500', () => expect(parse('outline-red-500')).toMatchObject({ property: 'outline', color: 'red-500' }));
  it('fill-green-200', () => expect(parse('fill-green-200')).toMatchObject({ property: 'fill', color: 'green-200' }));
  it('stroke-gray-400', () => expect(parse('stroke-gray-400')).toMatchObject({ property: 'stroke', color: 'gray-400' }));
  it('decoration-blue-500', () => expect(parse('decoration-blue-500')).toMatchObject({ property: 'decoration', color: 'blue-500' }));
});

describe('TAILWIND_PARSERS — borders', () => {
  it('border (bare)', () => expect(parse('border')).toMatchObject({ property: 'border', fullClass: 'border' }));
  it('border-2 (width)', () => expect(parse('border-2')).toMatchObject({ property: 'border', scale: '2' }));
  it('border-4 (width)', () => expect(parse('border-4')).toMatchObject({ property: 'border', scale: '4' }));
  it('border-t-2 (side width)', () => expect(parse('border-t-2')).toMatchObject({ property: 'border', side: 't', scale: '2' }));
  it('border-b-4 (side width)', () => expect(parse('border-b-4')).toMatchObject({ property: 'border', side: 'b', scale: '4' }));
  it('border-solid (style)', () => expect(parse('border-solid')).toMatchObject({ property: 'border', style: 'solid' }));
  it('border-dashed (style)', () => expect(parse('border-dashed')).toMatchObject({ property: 'border', style: 'dashed' }));
  it('border-dotted (style)', () => expect(parse('border-dotted')).toMatchObject({ property: 'border', style: 'dotted' }));
  it('border-double (style)', () => expect(parse('border-double')).toMatchObject({ property: 'border', style: 'double' }));
  it('border-none (style)', () => expect(parse('border-none')).toMatchObject({ property: 'border', style: 'none' }));
  it('border-red-500 (color)', () => expect(parse('border-red-500')).toMatchObject({ property: 'border', color: 'red-500' }));
  it('border-slate-200 (color)', () => expect(parse('border-slate-200')).toMatchObject({ property: 'border', color: 'slate-200' }));
  it('border-something-weird (unknown → color fallback)', () => {
    const token = parse('border-something-weird');
    expect(token).toMatchObject({ property: 'border', color: 'something-weird' });
    expect(token?.unknown).toBeUndefined();
  });

  it('outline-dashed (style)', () => expect(parse('outline-dashed')).toMatchObject({ property: 'outline', style: 'dashed' }));
});

describe('TAILWIND_PARSERS — rounded', () => {
  it('rounded (bare)', () => expect(parse('rounded')).toMatchObject({ property: 'rounded', fullClass: 'rounded' }));
  it('rounded-lg', () => expect(parse('rounded-lg')).toMatchObject({ property: 'rounded', scale: 'lg' }));
  it('rounded-full', () => expect(parse('rounded-full')).toMatchObject({ property: 'rounded', scale: 'full' }));
  it('rounded-none', () => expect(parse('rounded-none')).toMatchObject({ property: 'rounded', scale: 'none' }));
  it('rounded-t-lg (side)', () => expect(parse('rounded-t-lg')).toMatchObject({ property: 'rounded', side: 't', scale: 'lg' }));
  it('rounded-b-xl (side)', () => expect(parse('rounded-b-xl')).toMatchObject({ property: 'rounded', side: 'b', scale: 'xl' }));
  it('rounded-tl-md (corner)', () => expect(parse('rounded-tl-md')).toMatchObject({ property: 'rounded', corner: 'tl', scale: 'md' }));
  it('rounded-tr-sm (corner)', () => expect(parse('rounded-tr-sm')).toMatchObject({ property: 'rounded', corner: 'tr', scale: 'sm' }));
  it('rounded-br-lg (corner)', () => expect(parse('rounded-br-lg')).toMatchObject({ property: 'rounded', corner: 'br', scale: 'lg' }));
  it('rounded-bl-none (corner)', () => expect(parse('rounded-bl-none')).toMatchObject({ property: 'rounded', corner: 'bl', scale: 'none' }));
});

describe('TAILWIND_PARSERS — effects', () => {
  it('opacity-50', () => expect(parse('opacity-50')).toMatchObject({ property: 'opacity', scale: '50' }));
  it('opacity-100', () => expect(parse('opacity-100')).toMatchObject({ property: 'opacity', scale: '100' }));
  it('shadow-lg', () => expect(parse('shadow-lg')).toMatchObject({ property: 'shadow', size: 'lg' }));
  it('shadow-none', () => expect(parse('shadow-none')).toMatchObject({ property: 'shadow', size: 'none' }));
  it('shadow-xs (v4)', () => expect(parse('shadow-xs')).toMatchObject({ property: 'shadow', size: 'xs' }));
  it('shadow-2xs (v4)', () => expect(parse('shadow-2xs')).toMatchObject({ property: 'shadow', size: '2xs' }));
  it('shadow-inner is no longer valid in v4', () => {
    const t = parse('shadow-inner');
    expect(t?.unknown).toBe(true);
  });
});

describe('TAILWIND_PARSERS — layout', () => {
  // Display: all values route to prefix 'display'
  it('block', () => expect(parse('block')).toMatchObject({ property: 'display', value: 'block' }));
  it('inline-block', () => expect(parse('inline-block')).toMatchObject({ property: 'display', value: 'inline-block' }));
  it('inline', () => expect(parse('inline')).toMatchObject({ property: 'display', value: 'inline' }));
  it('grid', () => expect(parse('grid')).toMatchObject({ property: 'display', value: 'grid' }));
  it('inline-grid', () => expect(parse('inline-grid')).toMatchObject({ property: 'display', value: 'inline-grid' }));
  it('table', () => expect(parse('table')).toMatchObject({ property: 'display', value: 'table' }));
  it('table-row', () => expect(parse('table-row')).toMatchObject({ property: 'display', value: 'table-row' }));
  it('table-cell', () => expect(parse('table-cell')).toMatchObject({ property: 'display', value: 'table-cell' }));
  it('contents', () => expect(parse('contents')).toMatchObject({ property: 'display', value: 'contents' }));
  it('hidden', () => expect(parse('hidden')).toMatchObject({ property: 'display', value: 'hidden' }));
  it('flow-root', () => expect(parse('flow-root')).toMatchObject({ property: 'display', value: 'flow-root' }));

  // Position: all values route to prefix 'position'
  it('static', () => expect(parse('static')).toMatchObject({ property: 'position', value: 'static' }));
  it('relative', () => expect(parse('relative')).toMatchObject({ property: 'position', value: 'relative' }));
  it('absolute', () => expect(parse('absolute')).toMatchObject({ property: 'position', value: 'absolute' }));
  it('fixed', () => expect(parse('fixed')).toMatchObject({ property: 'position', value: 'fixed' }));
  it('sticky', () => expect(parse('sticky')).toMatchObject({ property: 'position', value: 'sticky' }));

  // Inset: all physical/logical sides canonicalize to prefix 'inset'
  it('inset-0', () => expect(parse('inset-0')).toMatchObject({ property: 'inset', scale: '0' }));
  it('inset-x-4', () => expect(parse('inset-x-4')).toMatchObject({ property: 'inset', side: 'x', scale: '4' }));
  it('inset-y-2', () => expect(parse('inset-y-2')).toMatchObject({ property: 'inset', side: 'y', scale: '2' }));
  it('inset-s-0 (logical)', () => expect(parse('inset-s-0')).toMatchObject({ property: 'inset', side: 's', scale: '0' }));
  it('inset-e-4 (logical)', () => expect(parse('inset-e-4')).toMatchObject({ property: 'inset', side: 'e', scale: '4' }));
  it('top-4', () => expect(parse('top-4')).toMatchObject({ property: 'inset', side: 'top', scale: '4' }));
  it('right-0', () => expect(parse('right-0')).toMatchObject({ property: 'inset', side: 'right', scale: '0' }));
  it('bottom-auto', () => expect(parse('bottom-auto')).toMatchObject({ property: 'inset', side: 'bottom', scale: 'auto' }));
  it('left-1/2', () => expect(parse('left-1/2')).toMatchObject({ property: 'inset', side: 'left', scale: '1/2' }));
  it('z-10', () => expect(parse('z-10')).toMatchObject({ property: 'z', scale: '10' }));
});

describe('TAILWIND_PARSERS — flexbox & grid', () => {
  // bare 'flex' and 'inline-flex' are display values
  it('flex (display)', () => expect(parse('flex')).toMatchObject({ property: 'display', value: 'flex' }));
  it('inline-flex (display)', () => expect(parse('inline-flex')).toMatchObject({ property: 'display', value: 'inline-flex' }));
  it('flex-row', () => expect(parse('flex-row')).toMatchObject({ property: 'flex-row' }));
  it('flex-col', () => expect(parse('flex-col')).toMatchObject({ property: 'flex-col' }));
  it('flex-row-reverse', () => expect(parse('flex-row-reverse')).toMatchObject({ property: 'flex-row-reverse' }));
  it('flex-col-reverse', () => expect(parse('flex-col-reverse')).toMatchObject({ property: 'flex-col-reverse' }));
  it('flex-wrap', () => expect(parse('flex-wrap')).toMatchObject({ property: 'flex-wrap' }));
  it('flex-nowrap', () => expect(parse('flex-nowrap')).toMatchObject({ property: 'flex-nowrap' }));
  it('flex-wrap-reverse', () => expect(parse('flex-wrap-reverse')).toMatchObject({ property: 'flex-wrap-reverse' }));
  // flex-{n} uses numeric scale (not fixed keywords)
  it('flex-1', () => expect(parse('flex-1')).toMatchObject({ property: 'flex', scale: '1' }));
  it('flex-2', () => expect(parse('flex-2')).toMatchObject({ property: 'flex', scale: '2' }));
  it('flex-auto', () => expect(parse('flex-auto')).toMatchObject({ property: 'flex', value: 'auto' }));
  it('flex-none', () => expect(parse('flex-none')).toMatchObject({ property: 'flex', value: 'none' }));

  // grow/shrink accept numeric values in v4
  it('grow', () => expect(parse('grow')).toMatchObject({ property: 'grow', fullClass: 'grow' }));
  it('grow-0', () => expect(parse('grow-0')).toMatchObject({ property: 'grow', scale: '0' }));
  it('grow-3 (v4)', () => expect(parse('grow-3')).toMatchObject({ property: 'grow', scale: '3' }));
  it('shrink', () => expect(parse('shrink')).toMatchObject({ property: 'shrink', fullClass: 'shrink' }));
  it('shrink-0', () => expect(parse('shrink-0')).toMatchObject({ property: 'shrink', scale: '0' }));

  it('justify-center', () => expect(parse('justify-center')).toMatchObject({ property: 'justify', value: 'center' }));
  it('justify-between', () => expect(parse('justify-between')).toMatchObject({ property: 'justify', value: 'between' }));
  it('justify-items-center', () => expect(parse('justify-items-center')).toMatchObject({ property: 'justify-items', value: 'center' }));
  it('items-center', () => expect(parse('items-center')).toMatchObject({ property: 'items', value: 'center' }));
  it('items-stretch', () => expect(parse('items-stretch')).toMatchObject({ property: 'items', value: 'stretch' }));
  it('content-between', () => expect(parse('content-between')).toMatchObject({ property: 'content', value: 'between' }));
  it('self-center', () => expect(parse('self-center')).toMatchObject({ property: 'self', value: 'center' }));
  it('self-auto', () => expect(parse('self-auto')).toMatchObject({ property: 'self', value: 'auto' }));

  it('basis-1/2', () => expect(parse('basis-1/2')).toMatchObject({ property: 'basis', scale: '1/2' }));
  it('grid-cols-3', () => expect(parse('grid-cols-3')).toMatchObject({ property: 'grid-cols', scale: '3' }));
  it('grid-cols-none (v4)', () => expect(parse('grid-cols-none')).toMatchObject({ property: 'grid-cols', value: 'none' }));
  it('grid-cols-subgrid (v4)', () => expect(parse('grid-cols-subgrid')).toMatchObject({ property: 'grid-cols', value: 'subgrid' }));
  it('grid-rows-2', () => expect(parse('grid-rows-2')).toMatchObject({ property: 'grid-rows', scale: '2' }));
  it('grid-rows-subgrid (v4)', () => expect(parse('grid-rows-subgrid')).toMatchObject({ property: 'grid-rows', value: 'subgrid' }));
  it('col-span-2', () => expect(parse('col-span-2')).toMatchObject({ property: 'col-span', scale: '2' }));
  it('row-span-3', () => expect(parse('row-span-3')).toMatchObject({ property: 'row-span', scale: '3' }));
  it('order-1', () => expect(parse('order-1')).toMatchObject({ property: 'order', scale: '1' }));
});

describe('TAILWIND_PARSERS — overflow', () => {
  it('overflow-hidden', () => expect(parse('overflow-hidden')).toMatchObject({ property: 'overflow', value: 'hidden' }));
  it('overflow-auto', () => expect(parse('overflow-auto')).toMatchObject({ property: 'overflow', value: 'auto' }));
  it('overflow-x-auto', () => expect(parse('overflow-x-auto')).toMatchObject({ property: 'overflow-x', value: 'auto' }));
  it('overflow-y-scroll', () => expect(parse('overflow-y-scroll')).toMatchObject({ property: 'overflow-y', value: 'scroll' }));
});

describe('TAILWIND_PARSERS — unknown classes', () => {
  it('returns null for totally unknown prefix', () => {
    expect(parse('foobarbaz')).toBeNull();
  });
  it('returns null for unknown hyphenated prefix', () => {
    expect(parse('wibble-wobble')).toBeNull();
  });
});

describe('TAILWIND_PARSERS — parseTokens integration', () => {
  it('parses a realistic class string', () => {
    const result = parseTokens(
      'flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg shadow-md text-sm text-gray-700',
      TAILWIND_PARSERS,
    );
    expect(result).toHaveLength(11);
    // 'flex' now routes to property 'display'
    expect(result.map(t => t.property)).toEqual([
      'display', 'items', 'justify', 'p', 'bg', 'border', 'border', 'rounded', 'shadow', 'text', 'text',
    ]);
  });

  it('spacing: mbs/pbe block-axis logical sides', () => {
    expect(parse('mbs-4')).toMatchObject({ property: 'm', side: 'bs', scale: '4' });
    expect(parse('pbe-2')).toMatchObject({ property: 'p', side: 'be', scale: '2' });
  });

  it('spacing: negative margins', () => {
    expect(parse('-m-4')).toMatchObject({ property: '-m', scale: '4' });
    expect(parse('-mt-2')).toMatchObject({ property: '-m', side: 't', scale: '2' });
  });

  it('spacing: space-x-reverse / space-y-reverse', () => {
    expect(parse('space-x-reverse')).toMatchObject({ property: 'space-x-reverse', fullClass: 'space-x-reverse' });
    expect(parse('space-y-reverse')).toMatchObject({ property: 'space-y-reverse', fullClass: 'space-y-reverse' });
  });

  it('borders: side variants with width', () => {
    expect(parse('border-x-2')).toMatchObject({ property: 'border', side: 'x', scale: '2' });
    expect(parse('border-s-4')).toMatchObject({ property: 'border', side: 's', scale: '4' });
    expect(parse('border-t')).toMatchObject({ property: 'border', side: 't', fullClass: 'border-t' });
  });

  it('enumParser: only exact whole-class matches', () => {
    // flex-row is NOT a display value
    const t = parse('flex-row');
    expect(t?.property).toBe('flex-row');
    // grid-cols-3 is NOT a display value
    const t2 = parse('grid-cols-3');
    expect(t2?.property).toBe('grid-cols');
  });
});
