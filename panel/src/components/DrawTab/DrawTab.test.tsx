import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DrawTab } from './DrawTab';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

function renderDrawTab() {
  return render(<DrawTab />);
}

// Fixture entries
const BUTTON_PRIMARY = {
  id: 'components-button--primary',
  title: 'Components/Button',
  name: 'Primary',
};
const BUTTON_SECONDARY = {
  id: 'components-button--secondary',
  title: 'Components/Button',
  name: 'Secondary',
};
const BADGE_BLUE = {
  id: 'components-badge--blue',
  title: 'Components/Badge',
  name: 'Blue',
};

/** Sets up fetch to respond to /api/storybook-data */
function setupFetch({
  storybookAvailable = true,
  entries = {} as Record<string, unknown>,
  argTypes = {} as Record<string, unknown>,
} = {}) {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/storybook-data') {
      return Promise.resolve({
        json: async () => ({
          available: storybookAvailable,
          directUrl: storybookAvailable ? '/storybook' : undefined,
          index: storybookAvailable ? { v: 4, entries } : undefined,
          argTypes: storybookAvailable ? argTypes : undefined,
        }),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

test('shows loading state initially', () => {
  mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
  renderDrawTab();
  expect(screen.getByText('Loading components…')).toBeInTheDocument();
});

test('shows error when storybook not detected', async () => {
  setupFetch({ storybookAvailable: false });
  renderDrawTab();
  expect(await screen.findByText('Storybook not detected.')).toBeInTheDocument();
});

test('shows component list when storybook is available', async () => {
  setupFetch({
    entries: {
      [BUTTON_PRIMARY.id]: BUTTON_PRIMARY,
      [BUTTON_SECONDARY.id]: BUTTON_SECONDARY,
      [BADGE_BLUE.id]: BADGE_BLUE,
    },
  });

  renderDrawTab();

  expect(await screen.findByText('Button')).toBeInTheDocument();
  expect(screen.getByText('Badge')).toBeInTheDocument();
  expect(screen.getByText('2 stories')).toBeInTheDocument();
  expect(screen.getByText('1 story')).toBeInTheDocument();
});

test('shows "no stories found" when entries is empty', async () => {
  setupFetch({ entries: {} });
  renderDrawTab();
  expect(await screen.findByText('No stories found.')).toBeInTheDocument();
});

describe('expand/collapse', () => {
  test('clicking a component expands to show its story names', async () => {
    setupFetch({
      entries: { [BUTTON_PRIMARY.id]: BUTTON_PRIMARY, [BUTTON_SECONDARY.id]: BUTTON_SECONDARY },
    });
    renderDrawTab();
    const buttonRow = await screen.findByRole('button', { name: /button/i });

    expect(screen.queryByText('Primary')).not.toBeInTheDocument();
    fireEvent.click(buttonRow);
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Secondary')).toBeInTheDocument();
  });

  test('clicking an expanded component collapses it', async () => {
    setupFetch({ entries: { [BUTTON_PRIMARY.id]: BUTTON_PRIMARY } });
    renderDrawTab();
    const buttonRow = await screen.findByRole('button', { name: /button/i });

    fireEvent.click(buttonRow);
    expect(screen.getByText('Primary')).toBeInTheDocument();

    fireEvent.click(buttonRow);
    expect(screen.queryByText('Primary')).not.toBeInTheDocument();
  });

  test('multiple components can be expanded independently', async () => {
    setupFetch({
      entries: { [BUTTON_PRIMARY.id]: BUTTON_PRIMARY, [BADGE_BLUE.id]: BADGE_BLUE },
    });
    renderDrawTab();
    const buttonRow = await screen.findByRole('button', { name: /button/i });
    const badgeRow = screen.getByRole('button', { name: /badge/i });

    fireEvent.click(buttonRow);
    fireEvent.click(badgeRow);
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
  });
});

describe('props display', () => {
  test('shows prop names and control types from server argTypes', async () => {
    setupFetch({
      entries: { [BUTTON_PRIMARY.id]: BUTTON_PRIMARY },
      argTypes: {
        Button: {
          variant: { control: 'select', options: ['primary', 'secondary'] },
          children: { control: 'text' },
        },
      },
    });
    renderDrawTab();
    fireEvent.click(await screen.findByRole('button', { name: /button/i }));

    expect(screen.getByText('Props')).toBeInTheDocument();
    expect(screen.getByText('variant')).toBeInTheDocument();
    expect(screen.getByText('children')).toBeInTheDocument();
  });

  test('shows select options for select controls', async () => {
    setupFetch({
      entries: { [BUTTON_PRIMARY.id]: BUTTON_PRIMARY },
      argTypes: {
        Button: {
          variant: { control: 'select', options: ['primary', 'secondary'] },
        },
      },
    });
    renderDrawTab();
    fireEvent.click(await screen.findByRole('button', { name: /button/i }));

    expect(screen.getByText('(primary, secondary)')).toBeInTheDocument();
  });

  test('omits Props section when no argTypes are available', async () => {
    setupFetch({ entries: { [BUTTON_PRIMARY.id]: BUTTON_PRIMARY }, argTypes: {} });
    renderDrawTab();
    fireEvent.click(await screen.findByRole('button', { name: /button/i }));

    expect(screen.queryByText('Props')).not.toBeInTheDocument();
  });
});

