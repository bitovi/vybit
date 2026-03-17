import { render, screen, fireEvent } from '@testing-library/react';
import { BoxModelRing } from './BoxModelRing';
import type { SlotData } from '../../types';

const emptySlots: SlotData[] = [
  { key: 'y', value: null, placeholder: 'y' },
  { key: 't', value: null, placeholder: 't' },
  { key: 'r', value: null, placeholder: 'r' },
  { key: 'b', value: null, placeholder: 'b' },
  { key: 'x', value: null, placeholder: 'x' },
  { key: 'l', value: null, placeholder: 'l' },
];

test('renders layer name when classState is none', () => {
  render(
    <BoxModelRing
      layer="padding"
      classState="none"
      shorthandValue={null}
      slots={emptySlots}
      isHovered={false}
      frozen={false}
      onHoverChange={() => {}}
    />
  );
  expect(screen.getByText('padding')).toBeInTheDocument();
});

test('renders shorthand value when classState is shorthand', () => {
  render(
    <BoxModelRing
      layer="padding"
      classState="shorthand"
      shorthandValue="p-2"
      slots={emptySlots}
      isHovered={false}
      frozen={false}
      onHoverChange={() => {}}
    />
  );
  expect(screen.getByText('p-2')).toBeInTheDocument();
});

test('calls onHoverChange on mouse over/out', () => {
  const onHoverChange = vi.fn();
  render(
    <BoxModelRing
      layer="padding"
      classState="none"
      shorthandValue={null}
      slots={emptySlots}
      isHovered={false}
      frozen={false}
      onHoverChange={onHoverChange}
    />
  );
  const ring = screen.getByText('padding').closest('[data-layer]')!;
  fireEvent.mouseOver(ring);
  expect(onHoverChange).toHaveBeenCalledWith(true);
  fireEvent.mouseOut(ring, { relatedTarget: document.body });
  expect(onHoverChange).toHaveBeenCalledWith(false);
});

test('does not call onHoverChange when frozen', () => {
  const onHoverChange = vi.fn();
  render(
    <BoxModelRing
      layer="padding"
      classState="none"
      shorthandValue={null}
      slots={emptySlots}
      isHovered={false}
      frozen={true}
      onHoverChange={onHoverChange}
    />
  );
  const ring = screen.getByText('padding').closest('[data-layer]')!;
  fireEvent.mouseOver(ring);
  expect(onHoverChange).not.toHaveBeenCalled();
});

test('calls onSlotClick when slot is clicked', () => {
  const onSlotClick = vi.fn();
  render(
    <BoxModelRing
      layer="padding"
      classState="none"
      shorthandValue={null}
      slots={emptySlots}
      isHovered={true}
      frozen={false}
      onHoverChange={() => {}}
      onSlotClick={onSlotClick}
    />
  );
  fireEvent.click(screen.getByText('t'));
  expect(onSlotClick).toHaveBeenCalledWith('t', expect.anything());
});

test('calls onSlotClick with "shorthand" when shorthand label clicked', () => {
  const onSlotClick = vi.fn();
  render(
    <BoxModelRing
      layer="padding"
      classState="shorthand"
      shorthandValue="p-2"
      slots={emptySlots}
      isHovered={true}
      frozen={false}
      onHoverChange={() => {}}
      onSlotClick={onSlotClick}
    />
  );
  fireEvent.click(screen.getByText('p-2'));
  expect(onSlotClick).toHaveBeenCalledWith('shorthand', expect.anything());
});

test('renders MiniScrubber as label when shorthandScaleValues provided', () => {
  render(
    <BoxModelRing
      layer="padding"
      classState="none"
      shorthandValue={null}
      shorthandScaleValues={['p-0', 'p-1', 'p-2', 'p-4']}
      slots={emptySlots}
      isHovered={false}
      frozen={false}
      onHoverChange={() => {}}
    />
  );
  // Label chip should show the layer name as placeholder (no value set)
  expect(screen.getByText('padding')).toBeInTheDocument();
});

test('calls onSlotChange with shorthand and value when shorthand scrubber dropdown item clicked', () => {
  const onSlotChange = vi.fn();
  render(
    <BoxModelRing
      layer="padding"
      classState="none"
      shorthandValue={null}
      shorthandScaleValues={['p-0', 'p-1', 'p-2', 'p-4']}
      slots={emptySlots}
      isHovered={true}
      frozen={false}
      onHoverChange={() => {}}
      onSlotChange={onSlotChange}
    />
  );
  // Open dropdown via pointer events
  const label = screen.getByText('padding');
  fireEvent.pointerDown(label, { clientX: 0, clientY: 0, button: 0 });
  fireEvent.pointerUp(label, { clientX: 0, clientY: 0, button: 0 });
  // Dropdown should appear
  const option = screen.getByText('p-4');
  fireEvent.click(option);
  expect(onSlotChange).toHaveBeenCalledWith('shorthand', 'p-4');
});

test('renders children (nested ring)', () => {
  render(
    <BoxModelRing
      layer="margin"
      classState="none"
      shorthandValue={null}
      slots={emptySlots}
      isHovered={false}
      frozen={false}
      onHoverChange={() => {}}
    >
      <div data-testid="inner-content">inner</div>
    </BoxModelRing>
  );
  expect(screen.getByTestId('inner-content')).toBeInTheDocument();
});
