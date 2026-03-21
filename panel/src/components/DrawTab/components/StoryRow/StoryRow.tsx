import { useState, useEffect, useRef } from 'react';
import type { StoryEntry } from '../../types';

interface StoryRowProps {
  story: StoryEntry;
  iframeSrc: string;
  storybookUrl: string;
}

export function StoryRow({ story, iframeSrc, storybookUrl }: StoryRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [argsDetected, setArgsDetected] = useState<boolean | null>(null);
  const [iframeHeight, setIframeHeight] = useState(160);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setArgsDetected(null);
      observerRef.current?.disconnect();
      observerRef.current = null;
      setIframeHeight(160);
      return;
    }

    function handleMessage(e: MessageEvent) {
      let msg = e.data;
      if (typeof msg === 'string') {
        try { msg = JSON.parse(msg); } catch { return; }
      }
      if (
        msg?.key === 'storybook-channel' &&
        msg?.event?.type === 'storyPrepared' &&
        msg?.event?.args?.[0]?.id === story.id
      ) {
        const argTypes = msg.event.args[0].argTypes ?? {};
        setArgsDetected(Object.keys(argTypes).length > 0);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen, story.id]);

  function handleIframeLoad(e: React.SyntheticEvent<HTMLIFrameElement>) {
    const doc = e.currentTarget.contentDocument;
    if (!doc?.head) return;

    const style = doc.createElement('style');
    style.textContent = 'body,html{margin:0!important;padding:0!important}#storybook-root{line-height:0}';
    doc.head.appendChild(style);

    observerRef.current?.disconnect();
    const observer = new ResizeObserver(() => {
      const h = doc.body.scrollHeight;
      if (h > 0) setIframeHeight(h);
    });
    observer.observe(doc.body);
    observerRef.current = observer;
  }

  return (
    <li>
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] text-bv-text-mid hover:bg-bv-surface-hi transition-colors">
        <span className="text-bv-muted">•</span>
        <a
          href={`${storybookUrl}/?path=/story/${story.id}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1 hover:text-bv-text hover:underline transition-colors"
        >
          {story.name}
        </a>
        {argsDetected === true && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"
            title="Supports args"
            data-testid="args-indicator"
          />
        )}
        <button
          className="px-1.5 py-0.5 text-[9px] rounded border border-bv-border text-bv-muted hover:text-bv-text hover:border-bv-text-mid transition-colors"
          onClick={() => setIsOpen(prev => !prev)}
        >
          {isOpen ? 'Close' : 'Open'}
        </button>
      </div>
      {isOpen && (
        <div className="mt-1 mx-1 rounded border border-bv-border overflow-hidden">
          <iframe
            src={iframeSrc}
            className="w-full block"
            style={{ height: iframeHeight }}
            title={story.name}
            onLoad={handleIframeLoad}
          />
        </div>
      )}
    </li>
  );
}
