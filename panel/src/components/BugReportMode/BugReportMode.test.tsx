import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BugReportMode } from './BugReportMode';

// Mock the ws module
vi.mock('../../ws', () => {
  const handlers: Array<(msg: any) => void> = [];
  return {
    sendTo: vi.fn(),
    send: vi.fn(),
    onMessage: vi.fn((handler: (msg: any) => void) => {
      handlers.push(handler);
      return () => {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      };
    }),
    // Helper to simulate incoming messages in tests
    __simulateMessage: (msg: any) => {
      handlers.forEach(h => h(msg));
    },
    __handlers: handlers,
  };
});

// Import the mocked module to access helpers
const ws = await import('../../ws') as any;

function simulateHistory(snapshots: any[]) {
  ws.__simulateMessage({ type: 'RECORDING_HISTORY', snapshots });
}

const baseSnapshot = {
  id: 1,
  timestamp: '2025-01-15T12:04:34.000Z',
  trigger: 'page-load' as const,
  isKeyframe: true,
  consoleErrorCount: 0,
  networkErrorCount: 0,
  url: 'http://localhost:5173',
};

describe('BugReportMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ws.__handlers.length = 0;
  });

  it('renders empty state when no recording events', () => {
    render(<BugReportMode onSubmit={() => {}} />);
    act(() => { simulateHistory([]); });
    expect(screen.getByText('No recording events yet')).toBeInTheDocument();
  });

  it('renders timeline events from recording history', () => {
    render(<BugReportMode onSubmit={() => {}} />);
    act(() => {
      simulateHistory([
        { ...baseSnapshot, id: 1, trigger: 'page-load' },
        { ...baseSnapshot, id: 2, trigger: 'click', timestamp: '2025-01-15T12:04:38.000Z', elementInfo: { tag: 'button', classes: 'submit-btn' } },
      ]);
    });

    expect(screen.getByText('page-load')).toBeInTheDocument();
    expect(screen.getByText('click')).toBeInTheDocument();
  });

  it('requests recording history on mount', () => {
    render(<BugReportMode onSubmit={() => {}} />);
    expect(ws.sendTo).toHaveBeenCalledWith('overlay', { type: 'RECORDING_GET_HISTORY' });
  });

  it('disables submit button when no events selected and no description', () => {
    render(<BugReportMode onSubmit={() => {}} />);
    act(() => { simulateHistory([baseSnapshot]); });

    const submitBtn = screen.getByRole('button', { name: /Commit Bug Report/i });
    expect(submitBtn).toBeDisabled();
  });

  it('enables submit when events are selected and description is provided', () => {
    render(<BugReportMode onSubmit={() => {}} />);
    act(() => { simulateHistory([baseSnapshot]); });

    // Last 3 events auto-selected, so event is already checked — just type description
    const textarea = screen.getByPlaceholderText('Describe the bug…');
    fireEvent.change(textarea, { target: { value: 'Something is broken' } });

    const submitBtn = screen.getByRole('button', { name: /Commit Bug Report/i });
    expect(submitBtn).not.toBeDisabled();
  });

  it('shows pick element button', () => {
    render(<BugReportMode onSubmit={() => {}} />);
    expect(screen.getByText('Pick Element')).toBeInTheDocument();
  });

  it('sends pick element message when button clicked', () => {
    render(<BugReportMode onSubmit={() => {}} />);
    fireEvent.click(screen.getByText('Pick Element'));
    expect(ws.sendTo).toHaveBeenCalledWith('overlay', { type: 'BUG_REPORT_PICK_ELEMENT' });
  });

  it('shows picked element chip when element is picked', () => {
    render(<BugReportMode onSubmit={() => {}} />);
    act(() => {
      ws.__simulateMessage({
        type: 'BUG_REPORT_ELEMENT_PICKED',
        element: {
          tag: 'button',
          id: 'submit',
          classes: 'submit-btn',
          selectorPath: 'form > button#submit',
          componentName: 'SubmitButton',
          outerHTML: '<button id="submit" class="submit-btn">Submit</button>',
          boundingBox: { x: 100, y: 200, width: 100, height: 40 },
        },
      });
    });

    // The element chip should be visible
    expect(screen.getByText('SubmitButton')).toBeInTheDocument();
    // Should show clear button
    expect(screen.getByText('✕')).toBeInTheDocument();
  });

  it('shows selected count', () => {
    render(<BugReportMode onSubmit={() => {}} />);
    act(() => {
      simulateHistory([
        { ...baseSnapshot, id: 1, trigger: 'page-load' },
        { ...baseSnapshot, id: 2, trigger: 'click', timestamp: '2025-01-15T12:04:38.000Z' },
      ]);
    });

    // Initially 0 selected — check the summary displays correctly
    expect(screen.getByText(/events? selected/)).toBeInTheDocument();
  });
});
