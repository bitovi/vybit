import { useState, useEffect } from 'react';
import { connect, onMessage, onConnect, send } from './ws';
import { DesignCanvas } from './components/DesignCanvas';

interface ElementContext {
  componentName: string;
  instanceCount: number;
  target: {
    tag: string;
    classes: string;
    innerText: string;
  };
  context: string;
  insertMode: 'before' | 'after' | 'first-child' | 'last-child' | 'replace';
  screenshot?: string;
}

export function DesignMode() {
  const [elementContext, setElementContext] = useState<ElementContext | null>(null);

  useEffect(() => {
    onConnect(() => {
      send({ type: 'REGISTER', role: 'design' });
    });

    onMessage((msg) => {
      if (msg.type === 'ELEMENT_CONTEXT') {
        setElementContext({
          componentName: msg.componentName,
          instanceCount: msg.instanceCount,
          target: msg.target,
          context: msg.context,
          insertMode: msg.insertMode ?? 'after',
          screenshot: msg.screenshot,
        });
      }
    });

    connect();
  }, []);

  const handleSubmit = (imageDataUrl: string, width: number, height: number) => {
    send({
      type: 'DESIGN_SUBMIT',
      image: imageDataUrl,
      componentName: elementContext?.componentName ?? '',
      target: elementContext?.target ?? { tag: '', classes: '', innerText: '' },
      context: elementContext?.context ?? '',
      insertMode: elementContext?.insertMode ?? 'after',
      canvasWidth: width,
      canvasHeight: height,
    });
    // Canvas stays visible — overlay will replace iframe with static preview
  };

  const handleClose = () => {
    send({ type: 'DESIGN_CLOSE' });
  };

  return (
    <div className="h-screen w-screen flex flex-col">
      <div className="flex-1 overflow-hidden">
        <DesignCanvas onSubmit={handleSubmit} onClose={handleClose} backgroundImage={elementContext?.screenshot} />
      </div>
    </div>
  );
}
