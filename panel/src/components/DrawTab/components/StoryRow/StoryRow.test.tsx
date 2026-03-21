import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StoryRow } from './StoryRow';

const story = { id: 'components-badge--blue', title: 'Components/Badge', name: 'Blue' };
const iframeSrc = '/storybook/iframe.html?id=components-badge--blue&viewMode=story';
const storybookUrl = '/storybook';

function renderRow() {
  return render(<StoryRow story={story} iframeSrc={iframeSrc} storybookUrl={storybookUrl} />);
}

/** Dispatch a storybook-channel storyPrepared postMessage */
function fireStoryPrepared(storyId: string, argTypes: Record<string, unknown> = {}) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          key: 'storybook-channel',
          event: { type: 'storyPrepared', args: [{ id: storyId, argTypes }] },
        }),
      })
    );
  });
}

test('renders story name as a link to storybook', () => {
  renderRow();
  const link = screen.getByRole('link', { name: 'Blue' });
  expect(link).toHaveAttribute('href', '/storybook/?path=/story/components-badge--blue');
  expect(link).toHaveAttribute('target', '_blank');
});

test('shows Open button initially', () => {
  renderRow();
  expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
});

test('does not show args indicator before opening', () => {
  renderRow();
  expect(screen.queryByTestId('args-indicator')).not.toBeInTheDocument();
});

describe('open/close', () => {
  test('clicking Open renders the iframe', () => {
    renderRow();
    expect(screen.queryByTitle('Blue')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const iframe = screen.getByTitle('Blue') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toContain('components-badge--blue');
  });

  test('button label changes to Close when open', () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  test('clicking Close removes the iframe', () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTitle('Blue')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTitle('Blue')).not.toBeInTheDocument();
  });
});

describe('iframe height and style injection', () => {
  test('iframe starts at 160px height', () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const iframe = screen.getByTitle('Blue') as HTMLIFrameElement;
    expect(iframe.style.height).toBe('160px');
  });

  test('height resets to 160px when closed and reopened', () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    // Reset by closing
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const iframe = screen.getByTitle('Blue') as HTMLIFrameElement;
    expect(iframe.style.height).toBe('160px');
  });
});

describe('args detection via postMessage', () => {
  test('shows green indicator after storyPrepared with argTypes', () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.queryByTestId('args-indicator')).not.toBeInTheDocument();

    fireStoryPrepared(story.id, { color: { control: 'select' } });

    expect(screen.getByTestId('args-indicator')).toBeInTheDocument();
  });

  test('does not show indicator when storyPrepared has empty argTypes', () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireStoryPrepared(story.id, {});

    expect(screen.queryByTestId('args-indicator')).not.toBeInTheDocument();
  });

  test('ignores storyPrepared for a different story id', () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireStoryPrepared('components-button--primary', { variant: { control: 'select' } });

    expect(screen.queryByTestId('args-indicator')).not.toBeInTheDocument();
  });

  test('indicator resets to hidden when closed and reopened', () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireStoryPrepared(story.id, { color: { control: 'select' } });
    expect(screen.getByTestId('args-indicator')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    // Not shown again until storyPrepared fires for the new load
    expect(screen.queryByTestId('args-indicator')).not.toBeInTheDocument();
  });
});
