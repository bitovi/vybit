import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FocusTrapContainer } from './FocusTrapContainer';

function setup(onClose = vi.fn()) {
  render(
    <FocusTrapContainer onClose={onClose} data-testid="trap">
      <button>item A</button>
      <button>item B</button>
    </FocusTrapContainer>
  );
  return { onClose };
}

describe('FocusTrapContainer', () => {
  it('auto-focuses on mount', () => {
    setup();
    expect(document.activeElement).toBe(screen.getByTestId('trap'));
  });

  it('does not call onClose when focus moves between children', async () => {
    const { onClose } = setup();
    await userEvent.tab();  // focus item A
    await userEvent.tab();  // focus item B
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape', async () => {
    const { onClose } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
