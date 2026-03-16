import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesignCanvas } from './DesignCanvas';

// Fabric.js needs a real canvas implementation; jsdom provides a minimal one.
// We mock the heavy Fabric module to keep tests fast and avoid canvas API issues.
vi.mock('fabric', () => {
  class MockCanvas {
    isDrawingMode = false;
    selection = true;
    defaultCursor = 'default';
    freeDrawingBrush = null;
    backgroundColor = '#ffffff';
    on = vi.fn();
    off = vi.fn();
    setDimensions = vi.fn();
    toJSON = vi.fn(() => ({}));
    toDataURL = vi.fn(() => 'data:image/png;base64,mockdata');
    getWidth = vi.fn(() => 400);
    getHeight = vi.fn(() => 300);
    clear = vi.fn();
    requestRenderAll = vi.fn();
    dispose = vi.fn();
    getActiveObjects = vi.fn(() => []);
    getActiveObject = vi.fn(() => null);
    loadFromJSON = vi.fn(() => Promise.resolve());
    discardActiveObject = vi.fn();
    add = vi.fn();
    remove = vi.fn();
    setActiveObject = vi.fn();
    findTarget = vi.fn();
    getScenePoint = vi.fn(() => ({ x: 0, y: 0 }));
  }

  class MockPencilBrush {
    color = '';
    width = 1;
  }

  return {
    Canvas: MockCanvas,
    PencilBrush: MockPencilBrush,
    Rect: class {},
    Circle: class {},
    Line: class {},
    Textbox: class {
      enterEditing = vi.fn();
      isEditing = false;
      type = 'textbox';
    },
  };
});

describe('DesignCanvas', () => {
  it('renders the canvas and toolbar', () => {
    render(<DesignCanvas onSubmit={vi.fn()} />);
    expect(screen.getByTestId('design-canvas')).toBeInTheDocument();
    expect(screen.getByTitle('Freehand')).toBeInTheDocument();
    expect(screen.getByTitle('Rectangle')).toBeInTheDocument();
    expect(screen.getByTitle('Text')).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    render(<DesignCanvas onSubmit={vi.fn()} />);
    expect(screen.getByText('✓ Queue as Change')).toBeInTheDocument();
  });

  it('calls onSubmit when the submit button is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DesignCanvas onSubmit={onSubmit} />);
    await user.click(screen.getByText('✓ Queue as Change'));
    expect(onSubmit).toHaveBeenCalledWith('data:image/png;base64,mockdata', 400, 300);
  });

  it('renders close button when onClose is provided', () => {
    render(<DesignCanvas onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('✕ Close')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DesignCanvas onSubmit={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByText('✕ Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render close button when onClose is not provided', () => {
    render(<DesignCanvas onSubmit={vi.fn()} />);
    expect(screen.queryByText('✕ Close')).not.toBeInTheDocument();
  });
});
