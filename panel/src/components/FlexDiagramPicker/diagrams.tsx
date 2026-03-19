import type { CSSProperties, ReactNode } from 'react';
import type { FlexDiagramOption } from './types';

// ─── Shared class strings ─────────────────────────────────────────────────────
const ITEM = 'bg-bv-teal/50 rounded-[2px] shrink-0 group-hover:bg-bv-teal/70 transition-colors duration-150';
const GAP  = 'bg-bv-orange/10 rounded-[2px]';

// ─── Item helpers ─────────────────────────────────────────────────────────────

// A flex item whose cross-axis fills by default (align-self:stretch).
// Only the main-axis size is set; cross-axis stretches to fill the container.
function Item({ isCol, main }: { isCol: boolean; main: number }) {
  return (
    <div
      className={ITEM}
      style={isCol ? { height: main } : { width: main }}
    />
  );
}

// A gap-zone that fills the main axis between items.
function GapZone({ flex = 1 }: { flex?: number }) {
  return <div className={GAP} style={{ flex }} />;
}

// An item with BOTH explicit width and height (for align diagrams where
// items intentionally have different cross-axis sizes).
function SizedItem({ isCol, w, h }: { isCol: boolean; w: number; h: number }) {
  return (
    <div
      className={ITEM}
      style={isCol ? { width: h, height: w } : { width: w, height: h }}
    />
  );
}

// A baseline item with a 't' character to visualise the typographic baseline.
function BaselineItem({
  isCol, w, h, pt,
}: { isCol: boolean; w: number; h: number; pt: number }) {
  return (
    <div
      className={`${ITEM} text-[5px] text-white/80 leading-none overflow-hidden text-center`}
      style={isCol
        ? { width: h, height: w, paddingLeft: pt }
        : { width: w, height: h, paddingTop: pt }}
    >
      t
    </div>
  );
}

// Three items with varying main-axis widths — reused by start/center/end.
function threeNarrow(isCol: boolean): ReactNode {
  return (
    <>
      <Item isCol={isCol} main={10} />
      <Item isCol={isCol} main={14} />
      <Item isCol={isCol} main={8}  />
    </>
  );
}

// ─── Justify-content options ──────────────────────────────────────────────────
export const JUSTIFY_OPTIONS: FlexDiagramOption[] = [
  {
    value: 'justify-start',
    label: 'start',
    getContainerStyle: (fd) => ({
      flexDirection: fd as CSSProperties['flexDirection'],
      justifyContent: 'flex-start',
      gap: 2,
    }),
    renderItems: (fd) => threeNarrow(fd.startsWith('column')),
  },
  {
    value: 'justify-center',
    label: 'center',
    getContainerStyle: (fd) => ({
      flexDirection: fd as CSSProperties['flexDirection'],
      justifyContent: 'center',
      gap: 2,
    }),
    renderItems: (fd) => threeNarrow(fd.startsWith('column')),
  },
  {
    value: 'justify-stretch',
    label: 'stretch',
    getContainerStyle: (fd) => ({
      flexDirection: fd as CSSProperties['flexDirection'],
      gap: 2,
    }),
    renderItems: () => (
      <>
        <div className={`${ITEM} flex-1`} />
        <div className={`${ITEM} flex-1`} />
        <div className={`${ITEM} flex-1`} />
      </>
    ),
  },
  {
    value: 'justify-between',
    label: 'between',
    getContainerStyle: (fd) => ({
      flexDirection: fd as CSSProperties['flexDirection'],
    }),
    renderItems: (fd) => {
      const isCol = fd.startsWith('column');
      return (
        <>
          <Item isCol={isCol} main={12} />
          <GapZone />
          <Item isCol={isCol} main={12} />
        </>
      );
    },
  },
  {
    value: 'justify-around',
    label: 'around',
    getContainerStyle: (fd) => ({
      flexDirection: fd as CSSProperties['flexDirection'],
    }),
    renderItems: (fd) => {
      const isCol = fd.startsWith('column');
      return (
        <>
          <GapZone flex={1} />
          <Item isCol={isCol} main={12} />
          <GapZone flex={2} />
          <Item isCol={isCol} main={12} />
          <GapZone flex={1} />
        </>
      );
    },
  },
  {
    value: 'justify-evenly',
    label: 'evenly',
    getContainerStyle: (fd) => ({
      flexDirection: fd as CSSProperties['flexDirection'],
    }),
    renderItems: (fd) => {
      const isCol = fd.startsWith('column');
      return (
        <>
          <GapZone />
          <Item isCol={isCol} main={12} />
          <GapZone />
          <Item isCol={isCol} main={12} />
          <GapZone />
        </>
      );
    },
  },
  {
    value: 'justify-end',
    label: 'end',
    getContainerStyle: (fd) => ({
      flexDirection: fd as CSSProperties['flexDirection'],
      justifyContent: 'flex-end',
      gap: 2,
    }),
    renderItems: (fd) => threeNarrow(fd.startsWith('column')),
  },
];

// ─── Align-items options ──────────────────────────────────────────────────────
export const ALIGN_OPTIONS: FlexDiagramOption[] = [
  {
    value: 'items-start',
    label: 'start',
    getContainerStyle: (fd) => ({
      flexDirection: fd as CSSProperties['flexDirection'],
      alignItems: 'flex-start',
      gap: 3,
    }),
    renderItems: (fd) => {
      const isCol = fd.startsWith('column');
      return (
        <>
          <SizedItem isCol={isCol} w={13} h={22} />
          <SizedItem isCol={isCol} w={15} h={42} />
          <SizedItem isCol={isCol} w={11} h={14} />
        </>
      );
    },
  },
  {
    value: 'items-center',
    label: 'center',
    getContainerStyle: (fd) => ({
      flexDirection: fd as CSSProperties['flexDirection'],
      alignItems: 'center',
      gap: 3,
    }),
    renderItems: (fd) => {
      const isCol = fd.startsWith('column');
      return (
        <>
          <SizedItem isCol={isCol} w={13} h={22} />
          <SizedItem isCol={isCol} w={15} h={42} />
          <SizedItem isCol={isCol} w={11} h={14} />
        </>
      );
    },
  },
  {
    value: 'items-baseline',
    label: 'baseline',
    getContainerStyle: (fd) => ({
      flexDirection: fd as CSSProperties['flexDirection'],
      alignItems: 'baseline',
      gap: 3,
    }),
    renderItems: (fd) => {
      const isCol = fd.startsWith('column');
      return (
        <>
          <BaselineItem isCol={isCol} w={13} h={38} pt={17} />
          <BaselineItem isCol={isCol} w={15} h={26} pt={3}  />
          <BaselineItem isCol={isCol} w={11} h={32} pt={10} />
        </>
      );
    },
  },
  {
    value: 'items-stretch',
    label: 'stretch',
    getContainerStyle: (fd) => ({
      flexDirection: fd as CSSProperties['flexDirection'],
      alignItems: 'stretch',
      gap: 3,
    }),
    renderItems: (fd) => {
      const isCol = fd.startsWith('column');
      return (
        <>
          <div className={ITEM} style={isCol ? { height: 13 } : { width: 13 }} />
          <div className={ITEM} style={isCol ? { height: 15 } : { width: 15 }} />
          <div className={ITEM} style={isCol ? { height: 11 } : { width: 11 }} />
        </>
      );
    },
  },
  {
    value: 'items-end',
    label: 'end',
    getContainerStyle: (fd) => ({
      flexDirection: fd as CSSProperties['flexDirection'],
      alignItems: 'flex-end',
      gap: 3,
    }),
    renderItems: (fd) => {
      const isCol = fd.startsWith('column');
      return (
        <>
          <SizedItem isCol={isCol} w={13} h={22} />
          <SizedItem isCol={isCol} w={15} h={42} />
          <SizedItem isCol={isCol} w={11} h={14} />
        </>
      );
    },
  },
];
