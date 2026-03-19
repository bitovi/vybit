import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlexWrap } from './FlexWrap';

function make(overrides = {}) {
  return {
    value: 'flex-nowrap' as const,
    lockedValue: null,
    locked: false,
    onHover: vi.fn(),
    onLeave: vi.fn(),
    onClick: vi.fn(),
    ...overrides,
  };
}

describe('FlexWrap', () => {
  it('renders all three wrap options', () => {
    render(<FlexWrap {...make()} />);
    expect(screen.getByTitle('flex-nowrap')).toBeInTheDocument();
    expect(screen.getByTitle('flex-wrap')).toBeInTheDocument();
    expect(screen.getByTitle('flex-wrap-reverse')).toBeInTheDocument();
  });

  it('calls onClick with the correct value', () => {
    const onClick = vi.fn();
    render(<FlexWrap {...make({ onClick })} />);
    fireEvent.click(screen.getByTitle('flex-wrap'));
    expect(onClick).toHaveBeenCalledWith('flex-wrap');
  });

  it('calls onHover on mouseenter', () => {
    const onHover = vi.fn();
    render(<FlexWrap {...make({ onHover })} />);
    fireEvent.mouseEnter(screen.getByTitle('flex-wrap-reverse'));
    expect(onHover).toHaveBeenCalledWith('flex-wrap-reverse');
  });

  it('does not call onClick when foreignLocked', () => {
    const onClick = vi.fn();
    render(<FlexWrap {...make({ locked: true, lockedValue: null, onClick })} />);
    fireEvent.click(screen.getByTitle('flex-wrap'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
