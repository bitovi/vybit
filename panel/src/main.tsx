import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';

function logLayoutDiagnostics() {
  const props = ['height', 'minHeight', 'maxHeight', 'overflow', 'overflowY', 'display', 'flexDirection', 'flex', 'position'] as const;
  const elements: Array<{ selector: string; el: Element }> = [
    { selector: 'html', el: document.documentElement },
    { selector: 'body', el: document.body },
  ];
  const root = document.getElementById('root');
  if (root) elements.push({ selector: '#root', el: root });

  console.group('[vybit-panel] Layout diagnostics');
  console.log('window innerHeight:', window.innerHeight, '| document.body.scrollHeight:', document.body.scrollHeight);
  console.log('window.frameElement:', window.frameElement, '| parent === self:', window.parent === window);

  for (const { selector, el } of elements) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const info: Record<string, string | number> = { offsetHeight: (el as HTMLElement).offsetHeight, clientHeight: el.clientHeight, rectHeight: Math.round(rect.height) };
    for (const p of props) info[p] = cs[p];
    console.log(`[${selector}]`, info);
  }
  console.groupEnd();
}

// Run after first paint so layout is established
requestAnimationFrame(() => setTimeout(logLayoutDiagnostics, 100));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
