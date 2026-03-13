let socket: WebSocket | null = null;
let connected = false;

type MessageHandler = (data: any) => void;
const handlers: MessageHandler[] = [];

export function connect(url: string = 'ws://localhost:3333'): void {
  socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    connected = true;
    window.dispatchEvent(new CustomEvent('overlay-ws-connected'));
  });

  socket.addEventListener('close', () => {
    connected = false;
    socket = null;
    window.dispatchEvent(new CustomEvent('overlay-ws-disconnected'));
    setTimeout(() => connect(url), 3000);
  });

  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      for (const handler of handlers) {
        handler(data);
      }
    } catch (err) {
      console.error('[tw-overlay] Failed to parse message:', err);
    }
  });

  socket.addEventListener('error', (err) => {
    console.error('[tw-overlay] WebSocket error:', err);
  });
}

export function send(data: object): void {
  if (connected && socket) {
    socket.send(JSON.stringify(data));
  } else {
    console.warn('[tw-overlay] Cannot send — not connected');
  }
}

export function onMessage(handler: MessageHandler): void {
  handlers.push(handler);
}

export function isConnected(): boolean {
  return connected;
}
