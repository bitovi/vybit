import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlexDiagramPicker } from './FlexDiagramPicker';
import type { FlexDiagramOption } from './types';

const OPTIONS: FlexDiagramOption[] = [
  { value: 'justify-start',  label: 'start',  getContainerStyle: () => ({}), renderItems: () => <div data-testid="d-start" /> },
  { value: 'justify-center', label: 'center', getContainerStyle: () => ({}), renderItems: () => <div data-testid="d-center" /> },
  { value: 'justify-end',    label: 'end',    getContainerStyle: () => ({}), renderItems: () => <div data-testid="d-end" /> },
];

function make(overrides = {}) {
  return {
    options: OPTIONS,
    currentValue: 'justify-start',
    lockedValue: null,
    locked: false,
    axisArrow: '→',
    onHover: vi.fn(),
    onLeave: vi.fn(),
    onClick: vi.fn(),
    ...overrides,
  };
}

describe('FlexDiagramPicker', () => {
  it('renders the current value label', () => {
    render(<FlexDiagramPicker {...make()} />);
    expect(screen.getByText('start')).toBeInTheDocument();
  });

  it('opens the dropdown on click', () => {
    render(<FlexDiagramPicker {...make()} />);
    fireEvent.click(screen.getByText('start'));
    expect(screen.getByText('center')).toBeInTheDocument();
    expect(screen.getByText('end')).toBeInTheDocument();
  });

  it('calls onHover when hovering a diagram cell', () => {
    const onHover = vi.fn();
    render(<FlexDiagramPicker {...make({ onHover })} />);
    fireEvent.click(screen.getByText('start'));
    fireEvent.mouseEnter(screen.getByTestId('d-center').closest('.cursor-pointer')!);
    expect(onHover).toHaveBeenCalledWith('justify-center');
  });

  it('calls onClick and closes when selecting an option', () => {
    const onClick = vi.fn();
    render(<FlexDiagramPicker {...make({ onClick })} />);
    fireEvent.click(screen.getByText('start'));
    fireEvent.click(screen.getByTestId('d-center').closest('.cursor-pointer')!);
    expect(onClick).toHaveBeenCalledWith('justify-center');
    expect(screen.queryByText('end')).not.toBeInTheDocument();
  });

  it('shows the locked value when lockedValue is set', () => {
    render(<FlexDiagramPicker {...make({ lockedValue: 'justify-end' })} />);
    expect(screen.getByText('end')).toBeInTheDocument();
  });

  it('does not open when foreignLocked', () => {
    render(<FlexDiagramPicker {...make({ locked: true, lockedValue: null })} />);
    fireEvent.click(screen.getByText('start'));
    expect(screen.queryByTestId('d-center')).not.toBeInTheDocument();
  });

  it('shows remove row when onRemove is provided', () => {
    render(<FlexDiagramPicker {...make({ onRemove: vi.fn() })} />);
    fireEvent.click(screen.getByText('start'));
    expect(screen.getByText('remove')).toBeInTheDocument();
  });
});
