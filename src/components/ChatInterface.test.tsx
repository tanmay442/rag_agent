import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock @ai-sdk/react useChat so we can drive messages from the test.
const useChatMock = vi.fn();
vi.mock('@ai-sdk/react', () => ({
  useChat: (...args: unknown[]) => useChatMock(...args),
}));

// DefaultChatTransport is just a class — we don't need a real impl.
vi.mock('ai', () => ({
  DefaultChatTransport: class {
    constructor() {}
  },
}));

import { ChatInterface } from './ChatInterface';

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<
    | { type: 'text'; text: string }
    | { type: 'data-citation'; data: { similarity: number; snippet: string } }
  >;
};

function setupChat(messages: Msg[] = [], opts: { status?: string; send?: (m: { text: string }) => void } = {}) {
  const sendMessage = opts.send ?? vi.fn();
  useChatMock.mockReturnValue({
    messages,
    sendMessage,
    status: opts.status ?? 'ready',
    error: undefined,
    stop: vi.fn(),
  });
  return { sendMessage };
}

beforeEach(() => {
  useChatMock.mockReset();
});

describe('ChatInterface', () => {
  it('renders a welcome intro when there are no messages', () => {
    setupChat();
    render(<ChatInterface />);
    // The intro card explains what the agent can do and how to open a
    // ticket. We assert on the data-testid + a stable phrase instead
    // of the full sentence, so rewordings don't break the test.
    expect(screen.getByTestId('chat-intro')).toBeInTheDocument();
    expect(
      screen.getByText(/support assistant for the school/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/open a ticket/i)).toBeInTheDocument();
  });

  it('renders citation cards for data-citation parts', () => {
    setupChat([
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'According to the policy…' },
          {
            type: 'data-citation',
            data: { similarity: 0.92, snippet: 'The dental plan covers two cleanings per year.' },
          },
        ],
      },
    ]);
    render(<ChatInterface />);
    expect(screen.getByTestId('chat-citation')).toBeInTheDocument();
    expect(screen.getByText(/similarity 0.92/i)).toBeInTheDocument();
    expect(screen.getByText(/dental plan covers two cleanings/i)).toBeInTheDocument();
  });

  it('renders text parts in the conversation', () => {
    setupChat([
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello!' }] },
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Hi there.' }] },
    ]);
    render(<ChatInterface />);
    expect(screen.getByText('Hello!')).toBeInTheDocument();
    expect(screen.getByText('Hi there.')).toBeInTheDocument();
  });

  it('sends a message when the form is submitted', async () => {
    const sendMessage = vi.fn();
    setupChat([], { send: sendMessage });
    render(<ChatInterface />);
    const input = screen.getByTestId('chat-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'What is the dental plan?' } });
    fireEvent.click(screen.getByTestId('chat-send'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ text: 'What is the dental plan?' }));
    expect((input).value).toBe('');
  });

  it('disables the send button while streaming', () => {
    setupChat([], { status: 'streaming' });
    render(<ChatInterface />);
    const input = screen.getByTestId('chat-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'q' } });
    expect(input).toBeDisabled();
    expect(screen.getByTestId('chat-send')).toBeDisabled();
  });

  it('renders the messages container as the vertically scrollable region of the chat frame', () => {
    setupChat();
    render(<ChatInterface />);
    // The container is the only element with `chat-messages`. It
    // must use `flex-1` + `min-h-0` so the surrounding flex column
    // gives it the remaining viewport height (and overflow-y-auto
    // kicks in when the thread is long). We assert on the className
    // rather than computing layout because jsdom does not lay out.
    const container = screen.getByTestId('chat-messages');
    const cls = container.className;
    expect(cls).toContain('flex-1');
    expect(cls).toContain('min-h-0');
    expect(cls).toContain('overflow-y-auto');
  });
});
