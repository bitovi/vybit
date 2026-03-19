import type { CSSProperties } from 'react';
import { DiagramCell, ITEM, ITEM_LIT, ITEM_T, ITEM_T_LIT } from './diagram-shared';
import type { FlexDirectionCss } from './JustifyDiagrams';

export interface AlignDiagramsProps {
  flexDirection?: FlexDirectionCss;
  activeValue?: string;
  onSelect?: (value: string) => void;
  onHover?: (value: string) => void;
}

/**
 * Grid of all align-items diagram cells.
 * Adapts item orientation when flexDirection is column/column-reverse:
 * dw (displayed width) and dh (displayed height) are swapped so the visual
 * always shows items packed along the current main axis.
 */
export function AlignDiagrams({
  flexDirection = 'row',
  activeValue,
  onSelect,
  onHover,
}: AlignDiagramsProps) {
  const isCol = flexDirection.startsWith('column');
  const fd = flexDirection as CSSProperties['flexDirection'];

  // Item with explicit width × height; swap when column.
  function sized(dw: number, dh: number, lit: boolean): CSSProperties {
    const base = lit ? ITEM_LIT : ITEM;
    return isCol
      ? { ...base, width: dh, height: dw }
      : { ...base, width: dw, height: dh };
  }

  // Stretch item: dw is the main-axis size; cross axis fills.
  function stretchItem(dw: number, lit: boolean): CSSProperties {
    const base = lit ? ITEM_LIT : ITEM;
    return isCol
      ? { ...base, width: '100%', height: dw }
      : { ...base, width: dw, height: '100%' };
  }

  // Baseline "t" item; paddingTop becomes paddingLeft when column.
  function baselineT(dw: number, dh: number, pt: number, lit: boolean): CSSProperties {
    const base = lit ? ITEM_T_LIT : ITEM_T;
    return isCol
      ? { ...base, width: dh, height: dw, paddingLeft: pt, paddingTop: 0 }
      : { ...base, width: dw, height: dh, paddingTop: pt, paddingLeft: 0 };
  }

  const a = (v: string) => activeValue === v;
  const s = (v: string) => () => onSelect?.(v);
  const h = (v: string) => () => onHover?.(v);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 60px)', gap: 4 }}>

      <DiagramCell label="start" isActive={a('items-start')} onClick={s('items-start')} onHover={h('items-start')}
        containerStyle={{ flexDirection: fd, alignItems: 'flex-start', gap: 3 }}>
        {(lit) => <>
          <div style={sized(13, 22, lit)} />
          <div style={sized(15, 42, lit)} />
          <div style={sized(11, 14, lit)} />
        </>}
      </DiagramCell>

      <DiagramCell label="center" isActive={a('items-center')} onClick={s('items-center')} onHover={h('items-center')}
        containerStyle={{ flexDirection: fd, alignItems: 'center', gap: 3 }}>
        {(lit) => <>
          <div style={sized(13, 22, lit)} />
          <div style={sized(15, 42, lit)} />
          <div style={sized(11, 14, lit)} />
        </>}
      </DiagramCell>

      <DiagramCell label="baseline" isActive={a('items-baseline')} onClick={s('items-baseline')} onHover={h('items-baseline')}
        containerStyle={{ flexDirection: fd, alignItems: 'baseline', gap: 3 }}>
        {(lit) => <>
          <div style={baselineT(13, 38, 17, lit)}>t</div>
          <div style={baselineT(15, 26, 3,  lit)}>t</div>
          <div style={baselineT(11, 32, 10, lit)}>t</div>
        </>}
      </DiagramCell>

      <DiagramCell label="stretch" isActive={a('items-stretch')} onClick={s('items-stretch')} onHover={h('items-stretch')}
        containerStyle={{ flexDirection: fd, alignItems: 'stretch', gap: 3 }}>
        {(lit) => <>
          <div style={stretchItem(13, lit)} />
          <div style={stretchItem(15, lit)} />
          <div style={stretchItem(11, lit)} />
        </>}
      </DiagramCell>

      <DiagramCell label="end" isActive={a('items-end')} onClick={s('items-end')} onHover={h('items-end')}
        containerStyle={{ flexDirection: fd, alignItems: 'flex-end', gap: 3 }}>
        {(lit) => <>
          <div style={sized(13, 22, lit)} />
          <div style={sized(15, 42, lit)} />
          <div style={sized(11, 14, lit)} />
        </>}
      </DiagramCell>

    </div>
  );
}
