import { render, screen, fireEvent } from '@testing-library/react';
import { BoxModel } from './BoxModel';
import type { LayerState } from './types';

function makeLayer(overrides: Partial<LayerState> = {}): LayerState {
  return {
    layer: 'padding',
    classState: 'none',
    shorthandValue: null,
    slots: [
      { key: 'y', value: null, placeholder: 'y' },
      { key: 't', value: null, placeholder: 't' },
      { key: 'r', value: null, placeholder: 'r' },
      { key: 'b', value: null, placeholder: 'b' },
      { key: 'x', value: null, placeholder: 'x' },
      { key: 'l', value: null, placeholder: 'l' },
    ],
    ...overrides,
  };
}

const allLayers: LayerState[] = [
  makeLayer({ layer: 'margin' }),
  makeLayer({ layer: 'outline', slots: [
    { key: 'y', value: null, placeholder: 'y' },
    { key: 't', value: null, placeholder: 't' },
    { key: 'r', value: null, placeholder: 'r' },
    { key: 'b', value: null, placeholder: 'b' },
    { key: 'x', value: null, placeholder: 'x' },
    { key: 'l', value: null, placeholder: 'l' },
    { key: 'color', value: null, placeholder: 'color' },
    { key: 'style', value: null, placeholder: 'style' },
    { key: 'offset', value: null, placeholder: 'offset' },
  ]}),
  makeLayer({ layer: 'border', slots: [
    { key: 'y', value: null, placeholder: 'y' },
    { key: 't', value: null, placeholder: 't' },
    { key: 'r', value: null, placeholder: 'r' },
    { key: 'b', value: null, placeholder: 'b' },
    { key: 'x', value: null, placeholder: 'x' },
    { key: 'l', value: null, placeholder: 'l' },
    { key: 'color', value: null, placeholder: 'color' },
    { key: 'style', value: null, placeholder: 'style' },
  ]}),
  makeLayer({ layer: 'padding' }),
];

test('renders all four layer labels', () => {
  render(<BoxModel layers={allLayers} />);
  expect(screen.getByText('margin')).toBeInTheDocument();
  expect(screen.getByText('outline')).toBeInTheDocument();
  expect(screen.getByText('border')).toBeInTheDocument();
  expect(screen.getByText('padding')).toBeInTheDocument();
});

test('renders content box', () => {
  const { container } = render(<BoxModel layers={allLayers} />);
  expect(container.querySelector('.bm-content')).toBeInTheDocument();
});

test('adds bm-frozen class when frozen', () => {
  const { container } = render(<BoxModel layers={allLayers} frozen />);
  expect(container.querySelector('.bm-root')).toHaveClass('bm-frozen');
});

test('calls onSlotClick with layer and slot key', () => {
  const onSlotClick = vi.fn();
  render(<BoxModel layers={allLayers} onSlotClick={onSlotClick} />);

  // Hover the padding layer first to reveal slots
  const paddingRing = screen.getByText('padding').closest('[data-layer]')!;
  fireEvent.mouseOver(paddingRing);

  // Click the 't' slot inside the padding ring
  const tSlots = screen.getAllByText('t');
  const paddingT = tSlots.find(el => el.closest('[data-layer="padding"]'))!;
  fireEvent.click(paddingT);
  expect(onSlotClick).toHaveBeenCalledWith('padding', 't', expect.anything());
});

test('shows shorthand value when classState is shorthand', () => {
  const layers = [
    ...allLayers.slice(0, 3),
    makeLayer({ layer: 'padding', classState: 'shorthand', shorthandValue: 'p-2' }),
  ];
  render(<BoxModel layers={layers} />);
  expect(screen.getByText('p-2')).toBeInTheDocument();
});
