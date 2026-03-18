import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GradientBar } from './GradientBar';
import type { GradientStop } from './types';

const twoStops: GradientStop[] = [
  { id: '1', role: 'from', colorName: 'blue-500', hex: '#3B82F6', position: 0 },
  { id: '2', role: 'to', colorName: 'pink-500', hex: '#EC4899', position: 100 },
];

const threeStops: GradientStop[] = [
  { id: '1', role: 'from', colorName: 'indigo-500', hex: '#6366F1', position: 5 },
  { id: '2', role: 'via', colorName: 'purple-500', hex: '#A855F7', position: 50 },
  { id: '3', role: 'to', colorName: 'pink-500', hex: '#EC4899', position: 95 },
];

const defaultProps = {
  direction: 'to right',
  onStopDrag: vi.fn(),
  onStopDragEnd: vi.fn(),
  onStopClick: vi.fn(),
  onBarClick: vi.fn(),
  onStopRemove: vi.fn(),
  selectedStopId: null,
};

describe('GradientBar', () => {
  it('renders pentagon handles for each stop', () => {
    const { container } = render(
      <GradientBar {...defaultProps} stops={twoStops} />
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(2);
  });

  it('renders three handles for three stops', () => {
    const { container } = render(
      <GradientBar {...defaultProps} stops={threeStops} />
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(3);
  });

  it('renders a gradient track', () => {
    const { container } = render(
      <GradientBar {...defaultProps} stops={twoStops} />
    );
    const track = container.querySelector('.h-9');
    expect(track).toBeTruthy();
    expect(track?.getAttribute('style')).toContain('linear-gradient');
  });

  it('applies teal stroke to the selected handle', () => {
    const { container } = render(
      <GradientBar {...defaultProps} stops={twoStops} selectedStopId="1" />
    );
    const paths = container.querySelectorAll('path');
    const firstPath = paths[0];
    expect(firstPath?.getAttribute('stroke')).toBe('#00848B');
  });

  it('applies white stroke to unselected handles', () => {
    const { container } = render(
      <GradientBar {...defaultProps} stops={twoStops} selectedStopId="1" />
    );
    const paths = container.querySelectorAll('path');
    const secondPath = paths[1];
    expect(secondPath?.getAttribute('stroke')).toBe('white');
  });

  it('calls onBarClick when the track is clicked', () => {
    const onBarClick = vi.fn();
    const { container } = render(
      <GradientBar {...defaultProps} stops={twoStops} onBarClick={onBarClick} />
    );
    const track = container.querySelector('.h-9');
    if (track) {
      fireEvent.click(track, { clientX: 50 });
      expect(onBarClick).toHaveBeenCalledTimes(1);
    }
  });
});
