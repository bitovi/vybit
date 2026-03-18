import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GradientEditor } from './GradientEditor';
import type { GradientEditorProps } from './types';
import type { GradientStop } from '../GradientBar';

const MOCK_COLORS: Record<string, any> = {
  black: '#000000',
  white: '#FFFFFF',
  indigo: { 500: '#6366F1', 700: '#4338CA' },
  purple: { 500: '#A855F7' },
  pink: { 500: '#EC4899' },
  blue: { 500: '#3B82F6' },
  red: { 500: '#EF4444' },
};

const threeStops: GradientStop[] = [
  { id: '1', role: 'from', colorName: 'indigo-500', hex: '#6366F1', position: 5 },
  { id: '2', role: 'via', colorName: 'purple-500', hex: '#A855F7', position: 50 },
  { id: '3', role: 'to', colorName: 'pink-500', hex: '#EC4899', position: 95 },
];

function makeProps(overrides: Partial<GradientEditorProps> = {}): GradientEditorProps {
  return {
    direction: 'r',
    stops: threeStops,
    mode: 'gradient',
    solidColorName: null,
    solidColorHex: null,
    colors: MOCK_COLORS,
    onPreview: vi.fn(),
    onPreviewBatch: vi.fn(),
    onRevert: vi.fn(),
    onStage: vi.fn(),
    ...overrides,
  };
}

describe('GradientEditor', () => {
  it('renders direction picker and gradient bar in gradient mode', () => {
    const { container } = render(<GradientEditor {...makeProps()} />);
    // Direction picker: 9 buttons (8 arrows + 1 center)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(9);
    // Gradient bar: 3 SVG pentagon handles
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(3);
  });

  it('renders solid swatch in solid mode', () => {
    const { container } = render(
      <GradientEditor {...makeProps({ mode: 'solid', solidColorName: 'blue-500', solidColorHex: '#3B82F6' })} />
    );
    // Should not have SVG gradient handles
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(0);
    // Center ● should be active (orange)
    const centerBtn = screen.getByText('●');
    expect(centerBtn.className).toContain('bg-bv-orange');
  });

  it('shows hint text for gradient mode', () => {
    render(<GradientEditor {...makeProps()} />);
    expect(screen.getByText(/Click handles to change color/)).toBeTruthy();
  });

  it('shows hint text for solid mode', () => {
    render(<GradientEditor {...makeProps({ mode: 'solid', solidColorName: 'blue-500', solidColorHex: '#3B82F6' })} />);
    expect(screen.getByText(/Click the swatch to change color/)).toBeTruthy();
  });

  it('switches to solid mode when center ● is clicked', () => {
    render(<GradientEditor {...makeProps()} />);
    fireEvent.click(screen.getByText('●'));
    // Hint should change to solid hint
    expect(screen.getByText(/Click the swatch to change color/)).toBeTruthy();
  });

  it('switches back to gradient mode when direction arrow is clicked', () => {
    render(<GradientEditor {...makeProps({ mode: 'solid', solidColorName: 'blue-500', solidColorHex: '#3B82F6' })} />);
    fireEvent.click(screen.getByText('→'));
    expect(screen.getByText(/Click handles to change color/)).toBeTruthy();
  });

  it('does not show color picker initially', () => {
    render(<GradientEditor {...makeProps()} />);
    expect(screen.queryByText('Editing')).toBeNull();
  });
});
