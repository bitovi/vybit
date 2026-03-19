import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlexAlign } from './FlexAlign';

function make(overrides = {}) {
  return {
    currentValue: 'items-stretch',
    lockedValue: null,
    locked: false,
    onHover: vi.fn(),
    onLeave: vi.fn(),
    onClick: vi.fn(),
    ...overrides,
  };
}

describe('FlexAlign', () => {
  it('renders the current value label', () => {
    render(<FlexAlign {...make()} />);
    expect(screen.getByText('stretch')).toBeInTheDocument();
  });

  it('shows ↓ axis arrow for flex-row', () => {
    render(<FlexAlign {...make()} />);
    expect(screen.getByText('↓')).toBeInTheDocument();
  });

  it('shows → axis arrow for flex-col', () => {
    render(<FlexAlign {...make({ flexDirection: 'column' })} />);
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('opens dropdown with all five options', () => {
    render(<FlexAlign {...make()} />);
    fireEvent.click(screen.getByText('stretch'));
    expect(screen.getByText('start')).toBeInTheDocument();
    expect(screen.getByText('center')).toBeInTheDocument();
    expect(screen.getByText('baseline')).toBeInTheDocument();
    expect(screen.getByText('end')).toBeInTheDocument();
  });

  it('calls onClick with the selected value', () => {
    const onClick = vi.fn();
    render(<FlexAlign {...make({ onClick })} />);
    fireEvent.click(screen.getByText('stretch'));
    fireEvent.click(screen.getAllByText('center')[0].closest('[class*="cursor-pointer"]')!);
    expect(onClick).toHaveBeenCalledWith('items-center');
  });
});
