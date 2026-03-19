import { render, screen } from '@testing-library/react';
import { CornerModel } from './CornerModel';
import type { CornerModelState } from './types';

const RADIUS_SCALE = [
  'rounded-none', 'rounded-sm', 'rounded', 'rounded-md',
  'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full',
];

function makeState(overrides: Partial<{
  all: string | null;
  tl: string | null; tr: string | null; br: string | null; bl: string | null;
  t: string | null; r: string | null; b: string | null; l: string | null;
}> = {}): CornerModelState {
  return {
    shorthandValue: overrides.all ?? null,
    shorthandScaleValues: RADIUS_SCALE,
    slots: [
      { key: 'all', value: overrides.all ?? null, placeholder: 'all', scaleValues: RADIUS_SCALE },
      { key: 't',  value: overrides.t  ?? null, placeholder: 't' },
      { key: 'r',  value: overrides.r  ?? null, placeholder: 'r' },
      { key: 'b',  value: overrides.b  ?? null, placeholder: 'b' },
      { key: 'l',  value: overrides.l  ?? null, placeholder: 'l' },
      { key: 'tl', value: overrides.tl ?? null, placeholder: 'tl' },
      { key: 'tr', value: overrides.tr ?? null, placeholder: 'tr' },
      { key: 'br', value: overrides.br ?? null, placeholder: 'br' },
      { key: 'bl', value: overrides.bl ?? null, placeholder: 'bl' },
    ],
  };
}

test('renders the cm-root container', () => {
  const { container } = render(<CornerModel state={makeState()} />);
  expect(container.querySelector('.cm-root')).toBeInTheDocument();
});

test('renders the center content box', () => {
  const { container } = render(<CornerModel state={makeState()} />);
  expect(container.querySelector('.cm-content')).toBeInTheDocument();
});

test('renders the ALL placeholder when no shorthand is set', () => {
  render(<CornerModel state={makeState()} />);
  expect(screen.getByText('all')).toBeInTheDocument();
});

test('displays truncated shorthand value', () => {
  render(<CornerModel state={makeState({ all: 'rounded-lg' })} />);
  expect(screen.getByText('lg')).toBeInTheDocument();
});

test('displays bare rounded as em dash', () => {
  render(<CornerModel state={makeState({ all: 'rounded' })} />);
  expect(screen.getByText('—')).toBeInTheDocument();
});

test('applies cm-frozen class when frozen prop is true', () => {
  const { container } = render(<CornerModel state={makeState()} frozen />);
  expect(container.querySelector('.cm-root')).toHaveClass('cm-frozen');
});

test('calls onSlotClick for the all slot', () => {
  // Without scaleValues so it renders a plain button span
  const state: CornerModelState = {
    shorthandValue: null,
    slots: [
      { key: 'all', value: null, placeholder: 'all' },
    ],
  };
  const onSlotClick = vi.fn();
  render(<CornerModel state={state} onSlotClick={onSlotClick} />);
  screen.getByText('all').click();
  expect(onSlotClick).toHaveBeenCalledWith('all', expect.any(Element));
});

test('does not call onSlotClick when frozen', () => {
  const state: CornerModelState = {
    shorthandValue: null,
    slots: [{ key: 'all', value: null, placeholder: 'all' }],
  };
  const onSlotClick = vi.fn();
  render(<CornerModel state={state} frozen onSlotClick={onSlotClick} />);
  screen.getByText('all').click();
  expect(onSlotClick).not.toHaveBeenCalled();
});

test('shows has-val class when corner has a value', () => {
  const state: CornerModelState = {
    shorthandValue: null,
    slots: [
      { key: 'all', value: null, placeholder: 'all' },
      { key: 'tl', value: 'rounded-tl-xl', placeholder: 'tl' },
    ],
  };
  const { container } = render(<CornerModel state={state} />);
  // The tl slot should render its scale value only (no corner prefix)
  expect(screen.getByText('xl')).toBeInTheDocument();
  const slotEl = screen.getByText('xl');
  expect(slotEl).toHaveClass('cm-has-val');
});

test('renders all 9 grid cells', () => {
  const { container } = render(<CornerModel state={makeState()} />);
  const cells = container.querySelectorAll('.cm-cell');
  expect(cells).toHaveLength(9);
});
