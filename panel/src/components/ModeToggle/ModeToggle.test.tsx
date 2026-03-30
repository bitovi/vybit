import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeToggle } from './ModeToggle';

describe('ModeToggle', () => {
  it('renders three icon buttons with tooltips', () => {
    render(<ModeToggle mode="select" onModeChange={() => {}} />);
    expect(screen.getByTitle('Select an element')).toBeInTheDocument();
    expect(screen.getByTitle('Insert to add content')).toBeInTheDocument();
    expect(screen.getByTitle('Report a bug')).toBeInTheDocument();
  });

  it('marks neither as active when mode is null', () => {
    render(<ModeToggle mode={null} onModeChange={() => {}} />);
    expect(screen.getByTitle('Select an element')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTitle('Insert to add content')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTitle('Report a bug')).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks Select as active when mode is select', () => {
    render(<ModeToggle mode="select" onModeChange={() => {}} />);
    expect(screen.getByTitle('Select an element')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTitle('Insert to add content')).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks Insert as active when mode is insert', () => {
    render(<ModeToggle mode="insert" onModeChange={() => {}} />);
    expect(screen.getByTitle('Select an element')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTitle('Insert to add content')).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks Bug Report as active when mode is bug-report', () => {
    render(<ModeToggle mode="bug-report" onModeChange={() => {}} />);
    expect(screen.getByTitle('Report a bug')).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onModeChange with select when Select is clicked', () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="insert" onModeChange={onChange} />);
    fireEvent.click(screen.getByTitle('Select an element'));
    expect(onChange).toHaveBeenCalledWith('select');
  });

  it('calls onModeChange with insert when Insert is clicked', () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="select" onModeChange={onChange} />);
    fireEvent.click(screen.getByTitle('Insert to add content'));
    expect(onChange).toHaveBeenCalledWith('insert');
  });

  it('calls onModeChange with bug-report when Bug Report is clicked', () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="select" onModeChange={onChange} />);
    fireEvent.click(screen.getByTitle('Report a bug'));
    expect(onChange).toHaveBeenCalledWith('bug-report');
  });
});
