import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlexJustify } from './FlexJustify';

function make(overrides = {}) {
  return {
    currentValue: 'justify-start',
    lockedValue: null,
    locked: false,
    onHover: vi.fn(),
    onLeave: vi.fn(),
    onClick: vi.fn(),
    ...overrides,
  };
}

describe('FlexJustify', () => {
  it('renders the current value label', () => {
    render(<FlexJustify {...make()} />);
    expect(screen.getByText('start')).toBeInTheDocument();
  });

  it('shows the axis arrow for flex-row', () => {
    render(<FlexJustify {...make()} />);
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('shows ↓ axis arrow for flex-col', () => {
    render(<FlexJustify {...make({ flexDirection: 'column' })} />);
    expect(screen.getByText('↓')).toBeInTheDocument();
  });

  it('opens dropdown with all options', () => {
    render(<FlexJustify {...make()} />);
    fireEvent.click(screen.getByText('start'));
    expect(screen.getByText('center')).toBeInTheDocument();
    expect(screen.getByText('between')).toBeInTheDocument();
    expect(screen.getByText('evenly')).toBeInTheDocument();
    expect(screen.getByText('end')).toBeInTheDocument();
  });

  it('calls onClick with the selected value', () => {
    const onClick = vi.fn();
    render(<FlexJustify {...make({ onClick })} />);
    fireEvent.click(screen.getByText('start'));
    fireEvent.click(screen.getAllByText('end')[0].closest('[class*="cursor-pointer"]')!);
    expect(onClick).toHaveBeenCalledWith('justify-end');
  });
});
