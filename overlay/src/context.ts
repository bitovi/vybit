/**
 * Build a pseudo-HTML context string for the given target element.
 * Walks from the target up to <body>, including siblings at each level.
 *
 * originalClassMap maps each previewed DOM element to its original className
 * string (before preview was applied). This ensures sibling instances that
 * also had the preview applied are shown with their source-accurate classes.
 */
export function buildContext(
  target: HTMLElement,
  oldClass: string,
  newClass: string,
  originalClassMap: Map<HTMLElement, string>,
): string {
  const ancestors: HTMLElement[] = [];
  let current: HTMLElement | null = target;
  while (current && current !== document.documentElement) {
    ancestors.push(current);
    current = current.parentElement;
  }
  ancestors.reverse(); // body → ... → target

  return buildLevel(ancestors, 0, target, oldClass, newClass, originalClassMap, 0);
}

function buildLevel(
  ancestors: HTMLElement[],
  ancestorIndex: number,
  target: HTMLElement,
  oldClass: string,
  newClass: string,
  originalClassMap: Map<HTMLElement, string>,
  indent: number,
): string {
  const el = ancestors[ancestorIndex];
  const pad = '  '.repeat(indent);
  const tag = el.tagName.toLowerCase();

  let attrs = '';
  if (el.id) attrs += ` id="${el.id}"`;
  // Use the original class if this element was part of the preview, so the
  // context reflects what is actually in the source code.
  const originalClass = originalClassMap.get(el);
  const classStr = originalClass != null
    ? originalClass.trim()
    : (typeof el.className === 'string' ? el.className.trim() : '');
  if (classStr) {
    attrs += ` class="${classStr}"`;
  }

  const isTarget = el === target;

  if (isTarget) {
    const text = getInnerText(el);
    const textNode = text ? `\n${pad}  ${text}` : '';
    return `${pad}<${tag}${attrs}> <!-- TARGET: change ${oldClass} → ${newClass} -->${textNode}\n${pad}</${tag}>`;
  }

  if (ancestorIndex >= ancestors.length - 1) {
    return `${pad}<${tag}${attrs} />`;
  }

  const nextAncestor = ancestors[ancestorIndex + 1];
  const children = Array.from(el.children) as HTMLElement[];
  const relevantIndex = children.indexOf(nextAncestor);

  let inner = '';

  if (relevantIndex === -1) {
    inner = buildLevel(ancestors, ancestorIndex + 1, target, oldClass, newClass, originalClassMap, indent + 1);
  } else {
    const start = Math.max(0, relevantIndex - 3);
    const end = Math.min(children.length - 1, relevantIndex + 3);

    if (start > 0) {
      inner += `${pad}  ...\n`;
    }

    for (let i = start; i <= end; i++) {
      if (i === relevantIndex) {
        inner += buildLevel(ancestors, ancestorIndex + 1, target, oldClass, newClass, originalClassMap, indent + 1) + '\n';
      } else {
        inner += renderSiblingNode(children[i], indent + 1, originalClassMap) + '\n';
      }
    }

    if (end < children.length - 1) {
      inner += `${pad}  ...\n`;
    }
  }

  return `${pad}<${tag}${attrs}>\n${inner}${pad}</${tag}>`;
}

function renderSiblingNode(el: HTMLElement, indent: number, originalClassMap: Map<HTMLElement, string>): string {
  const pad = '  '.repeat(indent);
  const tag = el.tagName.toLowerCase();
  let attrs = '';
  if (el.id) attrs += ` id="${el.id}"`;
  const originalClass = originalClassMap.get(el);
  const classStr = originalClass != null
    ? originalClass.trim()
    : (typeof el.className === 'string' ? el.className.trim() : '');
  if (classStr) {
    attrs += ` class="${classStr}"`;
  }

  const text = getInnerText(el);

  if (!el.id && (!el.className || !el.className.trim()) && !text) {
    return `${pad}<${tag}>...</${tag}>`;
  }

  if (text) {
    return `${pad}<${tag}${attrs}>\n${pad}  ${text}\n${pad}</${tag}>`;
  }

  if (el.children.length > 0) {
    return `${pad}<${tag}${attrs}>\n${pad}  ...\n${pad}</${tag}>`;
  }

  return `${pad}<${tag}${attrs} />`;
}

function getInnerText(el: HTMLElement): string {
  let text = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
    }
  }
  text = text.trim();
  if (text.length > 60) text = text.slice(0, 57) + '...';
  return text;
}
