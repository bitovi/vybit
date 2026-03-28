import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeToggle } from './ModeToggle';

describe('ModeToggle', () => {
  it('renders Select and Insert buttons', () => {
    render(<ModeToggle mode="select" onModeChange={() => {}} />);
    expect(screen.getByText('Select')).toBeInTheDocument();
    expect(screen.getByText('Insert')).toBeInTheDocument();
  });

  it('marks neither as active when mode is null', () => {
    render(<ModeToggle mode={null} onModeChange={() => {}} />);
    expect(screen.getByText('Select')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Insert')).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks Select as active when mode is select', () => {
    render(<ModeToggle mode="select" onModeChange={() => {}} />);
    expect(screen.getByText('Select')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Insert')).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks Insert as active when mode is insert', () => {
    render(<ModeToggle mode="insert" onModeChange={() => {}} />);
    expect(screen.getByText('Select')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Insert')).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onModeChange with select when Select is clicked', () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="insert" onModeChange={onChange} />);
    fireEvent.click(screen.getByText('Select'));
    expect(onChange).toHaveBeenCalledWith('select');
  });

  it('calls onModeChange with insert when Insert is clicked', () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="select" onModeChange={onChange} />);
    fireEvent.click(screen.getByText('Insert'));
    expect(onChange).toHaveBeenCalledWith('insert');
  });
});
