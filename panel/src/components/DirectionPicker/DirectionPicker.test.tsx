import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DirectionPicker } from './DirectionPicker';

describe('DirectionPicker', () => {
  const defaultProps = {
    direction: 'r' as const,
    mode: 'gradient' as const,
    onHover: vi.fn(),
    onLeave: vi.fn(),
    onDirectionClick: vi.fn(),
    onSolidClick: vi.fn(),
  };

  it('renders 8 direction buttons and a center button', () => {
    render(<DirectionPicker {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(9);
  });

  it('shows active state on the current direction', () => {
    render(<DirectionPicker {...defaultProps} direction="b" />);
    const downArrow = screen.getByText('↓');
    expect(downArrow.className).toContain('bg-bv-teal');
  });

  it('calls onDirectionClick when an arrow is clicked', () => {
    const onClick = vi.fn();
    render(<DirectionPicker {...defaultProps} onDirectionClick={onClick} />);
    fireEvent.click(screen.getByText('↑'));
    expect(onClick).toHaveBeenCalledWith('t');
  });

  it('calls onHover when an arrow is hovered', () => {
    const onHover = vi.fn();
    render(<DirectionPicker {...defaultProps} onHover={onHover} />);
    fireEvent.mouseEnter(screen.getByText('←'));
    expect(onHover).toHaveBeenCalledWith('l');
  });

  it('calls onSolidClick when center ● is clicked', () => {
    const onSolid = vi.fn();
    render(<DirectionPicker {...defaultProps} onSolidClick={onSolid} />);
    fireEvent.click(screen.getByText('●'));
    expect(onSolid).toHaveBeenCalledTimes(1);
  });

  it('shows solid active state when mode is solid', () => {
    render(<DirectionPicker {...defaultProps} mode="solid" />);
    const centerBtn = screen.getByText('●');
    expect(centerBtn.className).toContain('bg-bv-orange');
  });

  it('dims direction arrows in solid mode', () => {
    render(<DirectionPicker {...defaultProps} mode="solid" />);
    const rightArrow = screen.getByText('→');
    expect(rightArrow.className).toContain('opacity-35');
  });

  it('shows direction label in gradient mode', () => {
    render(<DirectionPicker {...defaultProps} direction="br" />);
    expect(screen.getByText('br')).toBeTruthy();
    expect(screen.getByText('to-')).toBeTruthy();
  });
});
