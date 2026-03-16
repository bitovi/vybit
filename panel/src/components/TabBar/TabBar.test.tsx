import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from './TabBar';
import type { Tab } from './types';

const tabs: Tab[] = [
  { id: 'design', label: 'Design' },
  { id: 'message', label: 'Message' },
  { id: 'draw', label: 'Draw', disabled: true, tooltip: 'Coming soon' },
];

describe('TabBar', () => {
  it('renders all tabs', () => {
    render(<TabBar tabs={tabs} activeTab="design" onTabChange={() => {}} />);
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.getByText('Draw')).toBeInTheDocument();
  });

  it('marks the active tab with aria-selected', () => {
    render(<TabBar tabs={tabs} activeTab="design" onTabChange={() => {}} />);
    expect(screen.getByText('Design')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Message')).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onTabChange when enabled tab is clicked', () => {
    const onChange = vi.fn();
    render(<TabBar tabs={tabs} activeTab="design" onTabChange={onChange} />);
    fireEvent.click(screen.getByText('Message'));
    expect(onChange).toHaveBeenCalledWith('message');
  });

  it('does not call onTabChange when disabled tab is clicked', () => {
    const onChange = vi.fn();
    render(<TabBar tabs={tabs} activeTab="design" onTabChange={onChange} />);
    fireEvent.click(screen.getByText('Draw'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows tooltip on hover of disabled tab', () => {
    render(<TabBar tabs={tabs} activeTab="design" onTabChange={() => {}} />);
    const drawButton = screen.getByText('Draw');
    // Hover the wrapper div (parent) since disabled buttons don't fire mouse events
    fireEvent.mouseEnter(drawButton.closest('div')!);
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    fireEvent.mouseLeave(drawButton.closest('div')!);
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });
});
