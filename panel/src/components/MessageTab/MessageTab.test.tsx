import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageTab } from './MessageTab';
import type { PatchSummary } from '../../../../shared/types';

function makeMessagePatch(overrides: Partial<PatchSummary> = {}): PatchSummary {
  return {
    id: crypto.randomUUID(),
    kind: 'message',
    elementKey: 'Card',
    status: 'staged',
    originalClass: '',
    newClass: '',
    property: '',
    timestamp: new Date().toISOString(),
    message: 'Test message',
    ...overrides,
  };
}

describe('MessageTab', () => {
  it('renders textarea and Add Message button', () => {
    render(
      <MessageTab
        draft={[]}
        currentElementKey="Card"
        onAddMessage={() => {}}
        onDiscard={() => {}}
      />
    );
    expect(screen.getByPlaceholderText('Add context for the AI agent…')).toBeInTheDocument();
    expect(screen.getByText('Add Message')).toBeInTheDocument();
  });

  it('Add Message button is disabled when textarea is empty', () => {
    render(
      <MessageTab
        draft={[]}
        currentElementKey=""
        onAddMessage={() => {}}
        onDiscard={() => {}}
      />
    );
    expect(screen.getByText('Add Message')).toBeDisabled();
  });

  it('calls onAddMessage with text and elementKey on click', () => {
    const onAdd = vi.fn();
    render(
      <MessageTab
        draft={[]}
        currentElementKey="Card"
        onAddMessage={onAdd}
        onDiscard={() => {}}
      />
    );
    const textarea = screen.getByPlaceholderText('Add context for the AI agent…');
    fireEvent.change(textarea, { target: { value: 'Make it bold' } });
    fireEvent.click(screen.getByText('Add Message'));
    expect(onAdd).toHaveBeenCalledWith('Make it bold', 'Card');
  });

  it('clears textarea after adding message', () => {
    render(
      <MessageTab
        draft={[]}
        currentElementKey="Card"
        onAddMessage={() => {}}
        onDiscard={() => {}}
      />
    );
    const textarea = screen.getByPlaceholderText('Add context for the AI agent…') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Test' } });
    fireEvent.click(screen.getByText('Add Message'));
    expect(textarea.value).toBe('');
  });

  it('supports Cmd+Enter shortcut to stage', () => {
    const onAdd = vi.fn();
    render(
      <MessageTab
        draft={[]}
        currentElementKey="Card"
        onAddMessage={onAdd}
        onDiscard={() => {}}
      />
    );
    const textarea = screen.getByPlaceholderText('Add context for the AI agent…');
    fireEvent.change(textarea, { target: { value: 'Shortcut test' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    expect(onAdd).toHaveBeenCalledWith('Shortcut test', 'Card');
  });

  it('shows staged message patches', () => {
    const draft = [makeMessagePatch({ message: 'First message' })];
    render(
      <MessageTab
        draft={draft}
        currentElementKey=""
        onAddMessage={() => {}}
        onDiscard={() => {}}
      />
    );
    expect(screen.getByText('"First message"')).toBeInTheDocument();
  });

  it('calls onDiscard when discard button is clicked', () => {
    const onDiscard = vi.fn();
    const patch = makeMessagePatch({ id: 'msg-1', message: 'Discard me' });
    render(
      <MessageTab
        draft={[patch]}
        currentElementKey=""
        onAddMessage={() => {}}
        onDiscard={onDiscard}
      />
    );
    fireEvent.click(screen.getByTitle('Discard'));
    expect(onDiscard).toHaveBeenCalledWith('msg-1');
  });

  it('does not show scoped-to label when element is selected', () => {
    render(
      <MessageTab
        draft={[]}
        currentElementKey="Card"
        onAddMessage={() => {}}
        onDiscard={() => {}}
      />
    );
    expect(screen.queryByText(/Scoped to:/i)).not.toBeInTheDocument();
  });

  it('does not show empty-selection label when no element is selected', () => {
    render(
      <MessageTab
        draft={[]}
        currentElementKey=""
        onAddMessage={() => {}}
        onDiscard={() => {}}
      />
    );
    expect(screen.queryByText('No selected element')).not.toBeInTheDocument();
  });

  it('does not show scoped or character counters', () => {
    const draft = [makeMessagePatch({ id: 'm1', elementKey: 'Card' })];
    render(
      <MessageTab
        draft={draft}
        currentElementKey="Card"
        onAddMessage={() => {}}
        onDiscard={() => {}}
      />
    );
    expect(screen.queryByText(/scoped/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/chars/i)).not.toBeInTheDocument();
  });
});
