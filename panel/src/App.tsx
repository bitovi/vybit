import { useState, useEffect } from 'react';
import { parseClasses } from '../../overlay/src/class-parser';
import { connect, onMessage, onConnect, onDisconnect, isConnected } from './ws';
import { Picker } from './Picker';

interface ElementData {
  componentName: string;
  instanceCount: number;
  classes: string;
  tailwindConfig: any;
}

export function App() {
  const [wsConnected, setWsConnected] = useState(false);
  const [elementData, setElementData] = useState<ElementData | null>(null);

  useEffect(() => {
    onConnect(() => setWsConnected(true));
    onDisconnect(() => setWsConnected(false));

    onMessage((msg) => {
      if (msg.type === 'ELEMENT_SELECTED') {
        setElementData({
          componentName: msg.componentName,
          instanceCount: msg.instanceCount,
          classes: msg.classes,
          tailwindConfig: msg.tailwindConfig,
        });
      }
    });

    connect();
    setWsConnected(isConnected());
  }, []);

  if (!wsConnected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 h-full">
        <div className="w-2 h-2 rounded-full bg-bv-orange animate-pulse" />
        <span className="text-bv-text-mid text-[12px]">Waiting for connection…</span>
      </div>
    );
  }

  if (!elementData) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-6">
        <span className="text-3xl mb-2 opacity-30">⊕</span>
        <span className="text-bv-text-mid text-[12px]">Click an element to inspect</span>
      </div>
    );
  }

  const parsedClasses = parseClasses(elementData.classes);

  return (
    <div className="h-full flex flex-col overflow-auto">
      <Picker
        componentName={elementData.componentName}
        instanceCount={elementData.instanceCount}
        parsedClasses={parsedClasses}
        tailwindConfig={elementData.tailwindConfig}
      />
    </div>
  );
}

