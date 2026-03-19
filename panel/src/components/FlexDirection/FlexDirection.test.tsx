import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlexDirection } from './FlexDirection';

function make(overrides = {}) {
  return {
    value: 'flex-row' as const,
    lockedValue: null,
    locked: false,
    onHover: vi.fn(),
    onLeave: vi.fn(),
    onClick: vi.fn(),
    ...overrides,
  };
}

describe('FlexDirection', () => {
  it('renders all four direction buttons', () => {
    render(<FlexDirection {...make()} />);
    expect(screen.getByTitle('flex-row')).toBeInTheDocument();
    expect(screen.getByTitle('flex-col')).toBeInTheDocument();
    expect(screen.getByTitle('flex-row-reverse')).toBeInTheDocument();
    expect(screen.getByTitle('flex-col-reverse')).toBeInTheDocument();
  });

  it('calls onClick with the correct value', () => {
    const onClick = vi.fn();
    render(<FlexDirection {...make({ onClick })} />);
    fireEvent.click(screen.getByTitle('flex-col'));
    expect(onClick).toHaveBeenCalledWith('flex-col');
  });

  it('calls onHover on mouseenter', () => {
    const onHover = vi.fn();
    render(<FlexDirection {...make({ onHover })} />);
    fireEvent.mouseEnter(screen.getByTitle('flex-row-reverse'));
    expect(onHover).toHaveBeenCalledWith('flex-row-reverse');
  });

  it('does not call onClick when foreignLocked', () => {
    const onClick = vi.fn();
    render(<FlexDirection {...make({ locked: true, lockedValue: null, onClick })} />);
    fireEvent.click(screen.getByTitle('flex-col'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
