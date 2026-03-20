import { computePosition, flip, shift, offset } from '@floating-ui/dom';
import type { ParsedClass } from './tailwind/class-parser';

interface PickerOptions {
  shadowRoot: ShadowRoot;
  anchorElement: HTMLElement;
  componentName: string;
  instanceCount: number;
  parsedClasses: ParsedClass[];
  tailwindConfig: any;
  onPreview: (oldClass: string, newClass: string) => void | Promise<void>;
  onRevert: () => void;
  onSelect: () => void;
  onQueue: (oldClass: string, newClass: string, property: string) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  spacing: 'Spacing',
  sizing: 'Sizing',
  typography: 'Typography',
  color: 'Color',
  borders: 'Borders',
  effects: 'Effects',
  layout: 'Layout',
  flexbox: 'Flexbox & Grid',
};

import { HUE_ORDER, SHADE_ORDER } from './tailwind/scales';

function createColorCell(
  prefix: string,
  colorName: string,
  colorValue: string,
  currentValue: string,
  onHover: (fullClass: string) => void,
  onLeave: () => void,
  onClick: (fullClass: string) => void
): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'color-cell';
  if (colorName === currentValue) cell.classList.add('current');

  if (colorName === 'transparent') {
    cell.style.background = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 8px 8px';
  } else {
    cell.style.backgroundColor = colorValue;
  }

  cell.title = `${prefix}${colorName}`;

  cell.addEventListener('mouseenter', () => onHover(`${prefix}${colorName}`));
  cell.addEventListener('mouseleave', onLeave);
  cell.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(`${prefix}${colorName}`);
  });

  return cell;
}

function renderColorGrid(
  container: HTMLElement,
  prefix: string,
  currentValue: string,
  colors: Record<string, any>,
  onHover: (fullClass: string) => void,
  onLeave: () => void,
  onClick: (fullClass: string) => void
): void {
  const grid = document.createElement('div');
  grid.className = 'color-grid';

  // Special colors row: black, white, transparent
  const specialRow = document.createElement('div');
  specialRow.className = 'color-row';
  const specialLabel = document.createElement('span');
  specialLabel.className = 'color-hue-label';
  specialLabel.textContent = '';
  specialRow.appendChild(specialLabel);
  for (const special of ['black', 'white', 'transparent']) {
    if (colors[special] !== undefined) {
      const cell = createColorCell(prefix, special, colors[special], currentValue, onHover, onLeave, onClick);
      specialRow.appendChild(cell);
    }
  }
  grid.appendChild(specialRow);

  // Hue rows
  for (const hue of HUE_ORDER) {
    const hueColors = colors[hue];
    if (!hueColors || typeof hueColors !== 'object') continue;

    const row = document.createElement('div');
    row.className = 'color-row';

    const label = document.createElement('span');
    label.className = 'color-hue-label';
    label.textContent = hue;
    row.appendChild(label);

    for (const shade of SHADE_ORDER) {
      if (hueColors[shade] !== undefined) {
        const cell = createColorCell(prefix, `${hue}-${shade}`, hueColors[shade], currentValue, onHover, onLeave, onClick);
        row.appendChild(cell);
      }
    }

    grid.appendChild(row);
  }

  container.appendChild(grid);
}

const SPECIAL_SPACING_ORDER: Record<string, number> = { px: 0.0625 };
function spacingKeyOrder(k: string): number {
  if (!isNaN(Number(k))) return Number(k);
  return SPECIAL_SPACING_ORDER[k] ?? Infinity;
}

function getScaleValues(prefix: string, themeKey: string | null, config: any): string[] {
  if (themeKey === 'spacing' && config?.spacing) {
    const keys = Object.keys(config.spacing);
    return keys.sort((a, b) => spacingKeyOrder(a) - spacingKeyOrder(b)).map(k => `${prefix}${k}`);
  }
  if (themeKey === 'fontSize') {
    return ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl', 'text-8xl', 'text-9xl'];
  }
  if (themeKey === 'fontWeight') {
    return ['font-thin', 'font-extralight', 'font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black'];
  }
  if (themeKey === 'borderRadius') {
    return ['rounded-none', 'rounded-sm', 'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full'];
  }
  return [];
}

function groupByCategory(classes: ParsedClass[]): Map<string, ParsedClass[]> {
  const groups = new Map<string, ParsedClass[]>();
  for (const cls of classes) {
    const list = groups.get(cls.category) || [];
    list.push(cls);
    groups.set(cls.category, list);
  }
  return groups;
}

export function showPicker(options: PickerOptions): void {
  closePicker(options.shadowRoot);

  const picker = document.createElement('div');
  picker.className = 'picker-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'picker-header';
  header.textContent = `${options.componentName} — ${options.instanceCount} instance${options.instanceCount !== 1 ? 's' : ''} on this page`;
  picker.appendChild(header);

  // Group by category
  const groups = groupByCategory(options.parsedClasses);

  // State for expanded scale
  let expandedScaleContainer: HTMLElement | null = null;
  let actionsContainer: HTMLElement | null = null;
  let selectedChip: HTMLElement | null = null;
  let lockedOld: string | null = null;
  let lockedNew: string | null = null;
  let lockedProperty: string | null = null;

  for (const [category, classes] of groups) {
    // Category header
    const catHeader = document.createElement('div');
    catHeader.className = 'picker-category';
    catHeader.textContent = CATEGORY_LABELS[category] || category;
    picker.appendChild(catHeader);

    // Class chip list
    const chipList = document.createElement('div');
    chipList.className = 'picker-class-list';

    for (const cls of classes) {
      const chip = document.createElement('div');
      chip.className = 'picker-class-chip';
      chip.textContent = cls.fullClass;

      chip.addEventListener('click', () => {
        // Deselect previous
        if (selectedChip) selectedChip.classList.remove('selected');
        selectedChip = chip;
        chip.classList.add('selected');

        // Remove old scale and actions
        if (expandedScaleContainer) expandedScaleContainer.remove();
        if (actionsContainer) actionsContainer.remove();
        lockedOld = null;
        lockedNew = null;
        lockedProperty = null;

        options.onSelect();

        // Color classes: show hue-grouped grid
        if (cls.themeKey === 'colors') {
          const colors = options.tailwindConfig?.colors;
          if (!colors) return;

          const gridContainer = document.createElement('div');
          expandedScaleContainer = gridContainer;

          renderColorGrid(
            gridContainer,
            cls.prefix,
            cls.value,
            colors,
            (fullClass) => {
              if (lockedOld !== null) return;
              options.onPreview(cls.fullClass, fullClass);
              gridContainer.querySelectorAll('.color-cell').forEach(c => c.classList.remove('preview'));
              const hovered = gridContainer.querySelector(`[title="${fullClass}"]`);
              if (hovered) hovered.classList.add('preview');
            },
            () => {
              if (lockedOld !== null) return;
              options.onRevert();
              gridContainer.querySelectorAll('.color-cell').forEach(c => c.classList.remove('preview'));
            },
            (fullClass) => {
              lockedOld = cls.fullClass;
              lockedNew = fullClass;
              lockedProperty = cls.prefix;

              options.onPreview(cls.fullClass, fullClass);

              gridContainer.querySelectorAll('.color-cell').forEach(c => c.classList.remove('preview'));
              const clicked = gridContainer.querySelector(`[title="${fullClass}"]`);
              if (clicked) clicked.classList.add('preview');

              // Show actions below grid
              if (actionsContainer) actionsContainer.remove();
              const actions = document.createElement('div');
              actions.className = 'picker-actions';
              actionsContainer = actions;

              const queueBtn = document.createElement('button');
              queueBtn.className = 'picker-btn picker-btn-queue';
              queueBtn.textContent = 'Queue Change';
              queueBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (lockedOld !== null && lockedNew !== null && lockedProperty !== null) {
                  options.onQueue(lockedOld, lockedNew, lockedProperty);
                }
              });

              const discardBtn = document.createElement('button');
              discardBtn.className = 'picker-btn picker-btn-discard';
              discardBtn.textContent = 'Discard';
              discardBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                options.onRevert();
                options.onClose();
              });

              actions.appendChild(queueBtn);
              actions.appendChild(discardBtn);
              gridContainer.after(actions);
            }
          );

          chipList.after(gridContainer);
          return;
        }

        // Non-color classes: show linear scale
        const scaleValues = getScaleValues(cls.prefix, cls.themeKey, options.tailwindConfig);
        if (scaleValues.length === 0) return;

        // Create scale row
        const scaleRow = document.createElement('div');
        scaleRow.className = 'picker-scale';
        expandedScaleContainer = scaleRow;

        for (const scaleVal of scaleValues) {
          const scaleChip = document.createElement('div');
          scaleChip.className = 'picker-scale-chip';
          if (scaleVal === cls.fullClass) {
            scaleChip.classList.add('current');
          }
          scaleChip.textContent = scaleVal;

          scaleChip.addEventListener('mouseenter', () => {
            if (lockedOld !== null) return; // locked selection, don't preview
            options.onPreview(cls.fullClass, scaleVal);
            // Visual: add preview class, remove from others
            scaleRow.querySelectorAll('.picker-scale-chip').forEach(c => c.classList.remove('preview'));
            scaleChip.classList.add('preview');
          });

          scaleChip.addEventListener('mouseleave', () => {
            if (lockedOld !== null) return;
            options.onRevert();
            scaleChip.classList.remove('preview');
          });

          scaleChip.addEventListener('click', (e) => {
            e.stopPropagation();
            // Lock selection
            lockedOld = cls.fullClass;
            lockedNew = scaleVal;
            lockedProperty = cls.prefix;

            // Apply preview and keep it
            options.onPreview(cls.fullClass, scaleVal);

            // Visual: mark as selected
            scaleRow.querySelectorAll('.picker-scale-chip').forEach(c => {
              c.classList.remove('preview');
            });
            scaleChip.classList.add('preview');

            // Show actions below scale
            if (actionsContainer) actionsContainer.remove();
            const actions = document.createElement('div');
            actions.className = 'picker-actions';
            actionsContainer = actions;

            const queueBtn = document.createElement('button');
            queueBtn.className = 'picker-btn picker-btn-queue';
            queueBtn.textContent = 'Queue Change';
            queueBtn.addEventListener('click', (ev) => {
              ev.stopPropagation();
              if (lockedOld !== null && lockedNew !== null && lockedProperty !== null) {
                options.onQueue(lockedOld, lockedNew, lockedProperty);
              }
            });

            const discardBtn = document.createElement('button');
            discardBtn.className = 'picker-btn picker-btn-discard';
            discardBtn.textContent = 'Discard';
            discardBtn.addEventListener('click', (ev) => {
              ev.stopPropagation();
              options.onRevert();
              options.onClose();
            });

            actions.appendChild(queueBtn);
            actions.appendChild(discardBtn);

            // Insert after scale row
            scaleRow.after(actions);
          });

          scaleRow.appendChild(scaleChip);
        }

        // Insert scale row after the chip list that contains this chip
        chipList.after(scaleRow);
      });

      chipList.appendChild(chip);
    }

    picker.appendChild(chipList);
  }

  options.shadowRoot.appendChild(picker);

  // Position with Floating UI
  computePosition(options.anchorElement, picker, {
    placement: 'right-start',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  }).then(({ x, y }) => {
    picker.style.left = `${x}px`;
    picker.style.top = `${y}px`;
  });
}

export function closePicker(shadowRoot: ShadowRoot): void {
  const existing = shadowRoot.querySelector('.picker-panel');
  if (existing) existing.remove();
}
