import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentGroupItem } from './ComponentGroupItem';
import type { ComponentGroup } from '../../types';

const group: ComponentGroup = {
  name: 'Button',
  stories: [
    { id: 'components-button--primary', title: 'Components/Button', name: 'Primary' },
    { id: 'components-button--secondary', title: 'Components/Button', name: 'Secondary' },
  ],
  argTypes: {},
};

const groupWithArgs: ComponentGroup = {
  ...group,
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary'] },
    children: { control: 'text' },
  },
};

function renderItem(g: ComponentGroup = group) {
  return render(<ComponentGroupItem group={g} />);
}

test('renders group name', () => {
  renderItem();
  expect(screen.getByRole('button', { name: /button/i })).toBeInTheDocument();
});

test('shows story count', () => {
  renderItem();
  expect(screen.getByText('2 stories')).toBeInTheDocument();
});

test('shows "1 story" for single story', () => {
  renderItem({ ...group, stories: [group.stories[0]] });
  expect(screen.getByText('1 story')).toBeInTheDocument();
});

test('starts collapsed — no story names visible', () => {
  renderItem();
  expect(screen.queryByText('Primary')).not.toBeInTheDocument();
});

describe('expand/collapse', () => {
  test('clicking header expands to show story names', () => {
    renderItem();
    fireEvent.click(screen.getByRole('button', { name: /button/i }));
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Secondary')).toBeInTheDocument();
  });

  test('clicking again collapses', () => {
    renderItem();
    const header = screen.getByRole('button', { name: /button/i });
    fireEvent.click(header);
    expect(screen.getByText('Primary')).toBeInTheDocument();
    fireEvent.click(header);
    expect(screen.queryByText('Primary')).not.toBeInTheDocument();
  });
});

describe('props section', () => {
  test('shows Props when argTypes are present', () => {
    renderItem(groupWithArgs);
    fireEvent.click(screen.getByRole('button', { name: /button/i }));
    expect(screen.getByText('Props')).toBeInTheDocument();
    expect(screen.getByText('variant')).toBeInTheDocument();
    expect(screen.getByText('children')).toBeInTheDocument();
  });

  test('shows select options', () => {
    renderItem(groupWithArgs);
    fireEvent.click(screen.getByRole('button', { name: /button/i }));
    expect(screen.getByText('(primary, secondary)')).toBeInTheDocument();
  });

  test('hides Props when no argTypes', () => {
    renderItem(group);
    fireEvent.click(screen.getByRole('button', { name: /button/i }));
    expect(screen.queryByText('Props')).not.toBeInTheDocument();
  });
});

describe('story rows', () => {
  test('renders Open button for each story', () => {
    renderItem(group);
    fireEvent.click(screen.getByRole('button', { name: /button/i }));
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(2);
  });

  test('iframeSrc uses /storybook proxy path', () => {
    renderItem(group);
    fireEvent.click(screen.getByRole('button', { name: /button/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    const iframe = screen.getByTitle('Primary') as HTMLIFrameElement;
    expect(iframe.src).toContain('/storybook/iframe.html');
    expect(iframe.src).toContain('components-button--primary');
  });
});
