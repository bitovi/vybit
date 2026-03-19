import { render, screen, fireEvent } from '@testing-library/react';
import { ScaleRow } from './ScaleRow';

const tailwindConfig = {
  spacing: { '1': '0.25rem', '2': '0.5rem', '3': '0.75rem', '4': '1rem', '5': '1.25rem' },
};

function setup() {
  const onHover = vi.fn();
  const onLeave = vi.fn();
  const onClick = vi.fn();

  const { container } = render(
    <ScaleRow
      prefix="px-"
      scaleName="spacing"
      currentClass="px-4"
      tailwindConfig={tailwindConfig}
      locked={false}
      lockedValue={null}
      onHover={onHover}
      onLeave={onLeave}
      onClick={onClick}
    />
  );

  return { onHover, onLeave, onClick, container };
}

test('onHover is called for each chip entered, onLeave is called when mouse leaves the row', () => {
  const { onHover, onLeave, container } = setup();

  const chip2 = screen.getByText('px-2');
  const chip3 = screen.getByText('px-3');

  // Enter chip2 — should call onHover
  fireEvent.mouseEnter(chip2);
  expect(onHover).toHaveBeenCalledWith('px-2');
  expect(onLeave).not.toHaveBeenCalled();

  // Enter chip3 directly — should call onHover again, no onLeave yet
  fireEvent.mouseEnter(chip3);
  expect(onHover).toHaveBeenCalledWith('px-3');
  expect(onLeave).not.toHaveBeenCalled();

  // Leave the container row — onLeave should fire once
  fireEvent.mouseLeave(container.firstChild as Element);
  expect(onLeave).toHaveBeenCalledTimes(1);
});

test('onHover is not called when locked', () => {
  const onHover = vi.fn();
  render(
    <ScaleRow
      prefix="px-"
      scaleName="spacing"
      currentClass="px-4"
      tailwindConfig={tailwindConfig}
      locked={true}
      lockedValue="px-2"
      onHover={onHover}
      onLeave={vi.fn()}
      onClick={vi.fn()}
    />
  );

  fireEvent.mouseEnter(screen.getByText('px-2'));
  expect(onHover).not.toHaveBeenCalled();
});

