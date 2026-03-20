import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShadowEditor } from './ShadowEditor';
import type { ShadowEditorProps, ShadowLayerState } from './types';

// jsdom doesn't implement setPointerCapture — stub it so pointerdown doesn't throw
function stubPointerCapture(el: Element) {
  (el as HTMLElement).setPointerCapture = vi.fn();
}

/** Open a ScaleScrubber dropdown by pointer-clicking its chip (the element showing the current value). */
function openScrubber(chip: Element) {
  stubPointerCapture(chip);
  fireEvent.pointerDown(chip, { clientX: 0 });
  fireEvent.pointerUp(chip, { clientX: 0 });
}

const shadowMd: ShadowLayerState = {
  type: 'shadow',
  sizeClass: 'shadow-md',
  colorClass: 'shadow-blue-500',
  colorHex: '#3b82f6',
  opacity: null,
  isNone: false,
};

const ring2: ShadowLayerState = {
  type: 'ring',
  sizeClass: 'ring-2',
  colorClass: 'ring-indigo-500',
  colorHex: '#6366f1',
  opacity: 80,
  isNone: false,
};

function makeProps(overrides: Partial<ShadowEditorProps> = {}): ShadowEditorProps {
  return {
    layers: [shadowMd, ring2],
    onPreview: vi.fn(),
    onRevert: vi.fn(),
    onStage: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onRemoveHover: vi.fn(),
    ...overrides,
  };
}

describe('ShadowEditor — rendering', () => {
  it('renders active layer rows with labels', () => {
    render(<ShadowEditor {...makeProps()} />);
    expect(screen.getByText('Shadow')).toBeInTheDocument();
    expect(screen.getByText('Ring')).toBeInTheDocument();
  });

  it('renders ghost rows for absent layer types', () => {
    render(<ShadowEditor {...makeProps({ layers: [shadowMd] })} />);
    const addButtons = screen.getAllByTitle(/^Add /);
    // 4 ghost rows: inset-shadow, ring, inset-ring, text-shadow
    expect(addButtons).toHaveLength(4);
  });

  it('renders all ghost rows when layers is empty', () => {
    render(<ShadowEditor {...makeProps({ layers: [] })} />);
    const addButtons = screen.getAllByTitle(/^Add /);
    expect(addButtons).toHaveLength(5);
  });

  it('renders remove buttons for active layers', () => {
    render(<ShadowEditor {...makeProps()} />);
    const removeButtons = screen.getAllByTitle('Remove layer');
    expect(removeButtons).toHaveLength(2);
  });
});

describe('ShadowEditor — adding layers', () => {
  it('calls onAdd with shadow-md when shadow + clicked', () => {
    const onAdd = vi.fn();
    render(<ShadowEditor {...makeProps({ layers: [], onAdd })} />);
    fireEvent.click(screen.getByTitle('Add shadow-md'));
    expect(onAdd).toHaveBeenCalledWith('shadow-md');
  });

  it('calls onAdd with correct defaults for each layer type', () => {
    const onAdd = vi.fn();
    render(<ShadowEditor {...makeProps({ layers: [], onAdd })} />);
    fireEvent.click(screen.getByTitle('Add inset-shadow-sm'));
    expect(onAdd).toHaveBeenCalledWith('inset-shadow-sm');
    fireEvent.click(screen.getByTitle('Add ring-2'));
    expect(onAdd).toHaveBeenCalledWith('ring-2');
    fireEvent.click(screen.getByTitle('Add inset-ring-2'));
    expect(onAdd).toHaveBeenCalledWith('inset-ring-2');
  });
});

describe('ShadowEditor — removing layers', () => {
  it('calls onRemove with all layer classes when × clicked', () => {
    const onRemove = vi.fn();
    render(<ShadowEditor {...makeProps({ layers: [shadowMd], onRemove })} />);
    fireEvent.click(screen.getByTitle('Remove layer'));
    expect(onRemove).toHaveBeenCalledWith(['shadow-md', 'shadow-blue-500']);
  });

  it('calls onRemove with only sizeClass when no colorClass present', () => {
    const onRemove = vi.fn();
    const insetShadow: ShadowLayerState = {
      type: 'inset-shadow',
      sizeClass: 'inset-shadow-sm',
      colorClass: null,
      colorHex: null,
      opacity: null,
      isNone: false,
    };
    render(<ShadowEditor {...makeProps({ layers: [insetShadow], onRemove })} />);
    fireEvent.click(screen.getByTitle('Remove layer'));
    expect(onRemove).toHaveBeenCalledWith(['inset-shadow-sm']);
  });

  it('calls onRemoveHover on mouseenter of remove button', () => {
    const onRemoveHover = vi.fn();
    render(<ShadowEditor {...makeProps({ layers: [shadowMd], onRemoveHover })} />);
    fireEvent.mouseEnter(screen.getByTitle('Remove layer'));
    expect(onRemoveHover).toHaveBeenCalledWith(['shadow-md', 'shadow-blue-500']);
  });
});

describe('ShadowEditor — size scrubber', () => {
  it('calls onPreview when hovering a size value', () => {
    const onPreview = vi.fn();
    render(<ShadowEditor {...makeProps({ layers: [shadowMd], onPreview })} />);
    // The chip showing 'md' is the size scrubber
    const chip = screen.getByText('md').closest('[class*="cursor-ew-resize"]') ?? screen.getByText('md');
    openScrubber(chip);
    fireEvent.mouseEnter(screen.getAllByText('lg')[0]);
    expect(onPreview).toHaveBeenCalledWith('shadow-md', 'shadow-lg');
  });

  it('calls onStage when selecting a size value from dropdown', () => {
    const onStage = vi.fn();
    render(<ShadowEditor {...makeProps({ layers: [shadowMd], onStage })} />);
    const chip = screen.getByText('md').closest('[class*="cursor-ew-resize"]') ?? screen.getByText('md');
    openScrubber(chip);
    fireEvent.click(screen.getAllByText('lg')[0]);
    expect(onStage).toHaveBeenCalledWith('shadow-md', 'shadow-lg');
  });

  it('calls onRevert when size scrubber dropdown closes', () => {
    const onRevert = vi.fn();
    render(<ShadowEditor {...makeProps({ layers: [shadowMd], onRevert })} />);
    const chip = screen.getByText('md').closest('[class*="cursor-ew-resize"]') ?? screen.getByText('md');
    openScrubber(chip);
    // Close by clicking the chip again
    openScrubber(chip);
    expect(onRevert).toHaveBeenCalled();
  });
});

describe('ShadowEditor — opacity scrubber', () => {
  it('calls onPreview with updated opacity class when hovering', () => {
    const onPreview = vi.fn();
    // ring2 has colorClass 'ring-indigo-500' and opacity 80
    render(<ShadowEditor {...makeProps({ layers: [ring2], onPreview })} />);
    // The 80% chip is the opacity scrubber
    const chip = screen.getByText('80%').closest('[class*="cursor-ew-resize"]') ?? screen.getByText('80%');
    openScrubber(chip);
    fireEvent.mouseEnter(screen.getAllByText('50%')[0]);
    expect(onPreview).toHaveBeenCalledWith('ring-indigo-500/80', 'ring-indigo-500/50');
  });

  it('calls onStage with updated opacity class when selecting', () => {
    const onStage = vi.fn();
    render(<ShadowEditor {...makeProps({ layers: [ring2], onStage })} />);
    const chip = screen.getByText('80%').closest('[class*="cursor-ew-resize"]') ?? screen.getByText('80%');
    openScrubber(chip);
    fireEvent.click(screen.getAllByText('100%')[0]);
    // At 100%, no /modifier — just base class
    expect(onStage).toHaveBeenCalledWith('ring-indigo-500/80', 'ring-indigo-500');
  });

  it('calls onStage with /N modifier when opacity is not 100', () => {
    const onStage = vi.fn();
    const shadowWithoutOpacity: ShadowLayerState = { ...shadowMd, opacity: null };
    render(<ShadowEditor {...makeProps({ layers: [shadowWithoutOpacity], onStage })} />);
    const chip = screen.getByText('100%').closest('[class*="cursor-ew-resize"]') ?? screen.getByText('100%');
    openScrubber(chip);
    fireEvent.click(screen.getAllByText('50%')[0]);
    expect(onStage).toHaveBeenCalledWith('shadow-blue-500', 'shadow-blue-500/50');
  });
});

describe('ShadowEditor — color swatch', () => {
  it('calls onColorClick with the layer and anchor element when swatch clicked', () => {
    const onColorClick = vi.fn();
    render(<ShadowEditor {...makeProps({ layers: [shadowMd], onColorClick })} />);
    const swatch = screen.getByTitle('shadow-blue-500');
    fireEvent.click(swatch);
    expect(onColorClick).toHaveBeenCalledTimes(1);
    expect(onColorClick).toHaveBeenCalledWith(shadowMd, swatch);
  });

  it('does not throw when onColorClick is not provided', () => {
    render(<ShadowEditor {...makeProps({ layers: [shadowMd], onColorClick: undefined })} />);
    expect(() => fireEvent.click(screen.getByTitle('shadow-blue-500'))).not.toThrow();
  });
});

