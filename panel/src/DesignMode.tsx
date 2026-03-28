import { useState, useEffect, useCallback } from 'react';
import { connect, onMessage, onConnect, send } from './ws';
import { DesignCanvas } from './components/DesignCanvas';
import type { ArmedComponent } from './components/DesignCanvas';
import type { CanvasComponent } from '../../shared/types';

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
  const [armedComponent, setArmedComponent] = useState<ArmedComponent | null>(null);

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
      } else if (msg.type === 'COMPONENT_ARM') {
        setArmedComponent({
          componentName: msg.componentName,
          storyId: msg.storyId,
          ghostHtml: msg.ghostHtml,
          componentPath: msg.componentPath,
          args: msg.args,
        });
      } else if (msg.type === 'COMPONENT_DISARM' || msg.type === 'COMPONENT_DISARMED') {
        setArmedComponent(null);
      }
    });

    connect();
  }, []);

  const handleSubmit = useCallback((imageDataUrl: string, width: number, height: number, canvasComponents?: CanvasComponent[]) => {
    send({
      type: 'DESIGN_SUBMIT',
      image: imageDataUrl,
      componentName: elementContext?.componentName ?? '',
      target: elementContext?.target ?? { tag: '', classes: '', innerText: '' },
      context: elementContext?.context ?? '',
      insertMode: elementContext?.insertMode ?? 'after',
      canvasWidth: width,
      canvasHeight: height,
      canvasComponents,
    });
  }, [elementContext]);

  const handleClose = () => {
    send({ type: 'DESIGN_CLOSE' });
  };

  const handleComponentPlaced = useCallback(() => {
    setArmedComponent(null);
    // Notify panel + overlay that the armed state should be cleared
    send({ type: 'COMPONENT_DISARMED', to: 'panel' });
    send({ type: 'COMPONENT_DISARM', to: 'overlay' });
  }, []);

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex-1 overflow-hidden">
        <DesignCanvas
          onSubmit={handleSubmit}
          onClose={handleClose}
          backgroundImage={elementContext?.screenshot}
          armedComponent={armedComponent}
          onComponentPlaced={handleComponentPlaced}
        />
      </div>
    </div>
  );
}
