import type { CSSProperties } from 'react';
import { DiagramCell, ITEM, ITEM_LIT, GAP, GAP_LIT } from './diagram-shared';

export type FlexDirectionCss = 'row' | 'column' | 'row-reverse' | 'column-reverse';

export interface JustifyDiagramsProps {
  flexDirection?: FlexDirectionCss;
  activeValue?: string;
  onSelect?: (value: string) => void;
  onHover?: (value: string) => void;
}

/**
 * Grid of all justify-content diagram cells.
 * Adapts item orientation when flexDirection is column/column-reverse.
 */
export function JustifyDiagrams({
  flexDirection = 'row',
  activeValue,
  onSelect,
  onHover,
}: JustifyDiagramsProps) {
  const isCol = flexDirection.startsWith('column');
  const fd = flexDirection as CSSProperties['flexDirection'];

  // Fixed-size item along the main axis; cross axis always fills.
  function main(n: number, lit: boolean): CSSProperties {
    const base = lit ? ITEM_LIT : ITEM;
    return isCol
      ? { ...base, width: '100%', height: n }
      : { ...base, width: n, height: '100%' };
  }

  // Stretch item — fills main axis with flex:1
  function stretch(lit: boolean): CSSProperties {
    const base = lit ? ITEM_LIT : ITEM;
    return isCol
      ? { ...base, flex: 1, width: '100%' }
      : { ...base, flex: 1, height: '100%' };
  }

  // Orange gap zone
  function gapZone(flex: number, lit: boolean): CSSProperties {
    return { ...(lit ? GAP_LIT : GAP), flex };
  }

  const a = (v: string) => activeValue === v;
  const s = (v: string) => () => onSelect?.(v);
  const h = (v: string) => () => onHover?.(v);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 60px)', gap: 4 }}>

      <DiagramCell label="start" isActive={a('justify-start')} onClick={s('justify-start')} onHover={h('justify-start')}
        containerStyle={{ flexDirection: fd, justifyContent: 'flex-start', gap: 2 }}>
        {(lit) => <>
          <div style={main(10, lit)} />
          <div style={main(14, lit)} />
          <div style={main(8,  lit)} />
        </>}
      </DiagramCell>

      <DiagramCell label="center" isActive={a('justify-center')} onClick={s('justify-center')} onHover={h('justify-center')}
        containerStyle={{ flexDirection: fd, justifyContent: 'center', gap: 2 }}>
        {(lit) => <>
          <div style={main(10, lit)} />
          <div style={main(14, lit)} />
          <div style={main(8,  lit)} />
        </>}
      </DiagramCell>

      <DiagramCell label="stretch" isActive={a('justify-stretch')} onClick={s('justify-stretch')} onHover={h('justify-stretch')}
        containerStyle={{ flexDirection: fd, gap: 2 }}>
        {(lit) => <>
          <div style={stretch(lit)} />
          <div style={stretch(lit)} />
          <div style={stretch(lit)} />
        </>}
      </DiagramCell>

      <DiagramCell label="between" isActive={a('justify-between')} onClick={s('justify-between')} onHover={h('justify-between')}
        containerStyle={{ flexDirection: fd }}>
        {(lit) => <>
          <div style={main(12, lit)} />
          <div style={gapZone(1, lit)} />
          <div style={main(12, lit)} />
        </>}
      </DiagramCell>

      <DiagramCell label="around" isActive={a('justify-around')} onClick={s('justify-around')} onHover={h('justify-around')}
        containerStyle={{ flexDirection: fd }}>
        {(lit) => <>
          <div style={gapZone(1, lit)} />
          <div style={main(12, lit)} />
          <div style={gapZone(2, lit)} />
          <div style={main(12, lit)} />
          <div style={gapZone(1, lit)} />
        </>}
      </DiagramCell>

      <DiagramCell label="evenly" isActive={a('justify-evenly')} onClick={s('justify-evenly')} onHover={h('justify-evenly')}
        containerStyle={{ flexDirection: fd }}>
        {(lit) => <>
          <div style={gapZone(1, lit)} />
          <div style={main(12, lit)} />
          <div style={gapZone(1, lit)} />
          <div style={main(12, lit)} />
          <div style={gapZone(1, lit)} />
        </>}
      </DiagramCell>

      <DiagramCell label="end" isActive={a('justify-end')} onClick={s('justify-end')} onHover={h('justify-end')}
        containerStyle={{ flexDirection: fd, justifyContent: 'flex-end', gap: 2 }}>
        {(lit) => <>
          <div style={main(10, lit)} />
          <div style={main(14, lit)} />
          <div style={main(8,  lit)} />
        </>}
      </DiagramCell>

    </div>
  );
}
