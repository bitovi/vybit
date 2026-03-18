import { useState } from 'react';
import './BoxModel.css';
import type { BoxModelProps, LayerName, SlotKey } from './types';
import { BoxModelRing } from './components/BoxModelRing';

const LAYER_ORDER: LayerName[] = ['margin', 'outline', 'border', 'padding'];

export function BoxModel({ layers, frozen = false, onSlotClick, onSlotChange, onSlotHover, onSlotRemove, onSlotRemoveHover, onEditStart }: BoxModelProps) {
  const [hoveredLayer, setHoveredLayer] = useState<LayerName | null>(null);
  // activeLayer: a slot in this layer is currently scrubbing or has an open dropdown
  const [activeLayer, setActiveLayer] = useState<LayerName | null>(null);

  const effectiveFrozen = frozen || activeLayer !== null;

  // Build a lookup by layer name
  const layerMap = new Map(layers.map(l => [l.layer, l]));

  const handleHoverChange = (layer: LayerName, hovered: boolean) => {
    if (effectiveFrozen) return;
    setHoveredLayer(hovered ? layer : null);
  };

  const handleSlotClick = (layer: LayerName, slotKey: SlotKey | 'shorthand', anchorEl?: Element) => {
    if (effectiveFrozen) return;
    onSlotClick?.(layer, slotKey, anchorEl);
  };

  // Build nested rings from inside out
  const contentBox = <div className="bm-content" />;

  let inner: React.ReactNode = contentBox;
  for (let i = LAYER_ORDER.length - 1; i >= 0; i--) {
    const layerName = LAYER_ORDER[i];
    const state = layerMap.get(layerName);
    if (!state) continue;

    inner = (
      <BoxModelRing
        layer={state.layer}
        classState={state.classState}
        shorthandValue={state.shorthandValue}
        shorthandScaleValues={state.shorthandScaleValues}
        slots={state.slots}
        isHovered={hoveredLayer === layerName || activeLayer === layerName}
        frozen={effectiveFrozen}
        onHoverChange={(hovered) => handleHoverChange(layerName, hovered)}
        onSlotClick={(slotKey, anchorEl) => handleSlotClick(layerName, slotKey, anchorEl)}
        onSlotChange={onSlotChange ? (slotKey, value) => onSlotChange(layerName, slotKey, value) : undefined}
        onSlotHover={onSlotHover ? (slotKey, value) => onSlotHover(layerName, slotKey, value) : undefined}
        onSlotRemove={onSlotRemove ? (slotKey) => onSlotRemove(layerName, slotKey) : undefined}
        onSlotRemoveHover={onSlotRemoveHover ? (slotKey) => onSlotRemoveHover(layerName, slotKey) : undefined}
        onScrubStart={() => { setActiveLayer(layerName); onEditStart?.(); }}
        onScrubEnd={() => setActiveLayer(null)}
        onSlotOpen={() => { setActiveLayer(layerName); onEditStart?.(); }}
        onSlotClose={() => setActiveLayer(null)}
      >
        {inner}
      </BoxModelRing>
    );
  }

  const rootClass = `bm-root${effectiveFrozen ? ' bm-frozen' : ''}`;

  return (
    <div className={rootClass}>
      {inner}
    </div>
  );
}
