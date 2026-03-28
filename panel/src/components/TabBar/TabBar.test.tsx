import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from './TabBar';
import type { Tab } from './types';

const tabs: Tab[] = [
  { id: 'design', label: 'Design' },
  { id: 'replace', label: 'Replace' },
  { id: 'place', label: 'Place', disabled: true, tooltip: 'Switch to Insert mode' },
];

describe('TabBar', () => {
  it('renders all tabs', () => {
    render(<TabBar tabs={tabs} activeTab="design" onTabChange={() => {}} />);
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('Replace')).toBeInTheDocument();
    expect(screen.getByText('Place')).toBeInTheDocument();
  });

  it('marks the active tab with aria-selected', () => {
    render(<TabBar tabs={tabs} activeTab="design" onTabChange={() => {}} />);
    expect(screen.getByText('Design')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Replace')).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onTabChange when enabled tab is clicked', () => {
    const onChange = vi.fn();
    render(<TabBar tabs={tabs} activeTab="design" onTabChange={onChange} />);
    fireEvent.click(screen.getByText('Replace'));
    expect(onChange).toHaveBeenCalledWith('replace');
  });

  it('does not call onTabChange when disabled tab is clicked', () => {
    const onChange = vi.fn();
    render(<TabBar tabs={tabs} activeTab="design" onTabChange={onChange} />);
    fireEvent.click(screen.getByText('Place'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows tooltip on hover of disabled tab', () => {
    render(<TabBar tabs={tabs} activeTab="design" onTabChange={() => {}} />);
    const placeButton = screen.getByText('Place');
    fireEvent.mouseEnter(placeButton.closest('div')!);
    expect(screen.getByText('Switch to Insert mode')).toBeInTheDocument();
    fireEvent.mouseLeave(placeButton.closest('div')!);
    expect(screen.queryByText('Switch to Insert mode')).not.toBeInTheDocument();
  });
});
