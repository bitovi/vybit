---
name: extract-ui-component
description: Extract reusable UI components from inline patterns. Covers component design, TypeScript props, refactoring strategy, and best practices for creating shared UI primitives.
---

# Extract UI Component Skill

## Purpose
Guide the extraction of reusable UI components from inline code patterns. This skill ensures components are:
- Well-designed with flexible, composable APIs
- Type-safe with proper TypeScript interfaces
- Accessible and keyboard-navigable
- Safely integrated through strategic refactoring

---

## When to Use
- Component Registry shows a pattern marked ⚠️ NEEDS EXTRACTION
- You notice the same UI element used 2+ times in your feature
- Creating generic UI primitives (Button, Card, Badge, Input, etc.)
- Refactoring inline patterns into shared components

---

## Workflow

### 1. Analyze Existing Patterns

**Goal**: Understand all variations before designing the component API.

1. Review Component Registry for pattern locations
2. Read through 3-5 examples of the pattern in actual code
3. Identify variations: visual variants, size variants, state variants, content variants

### 2. Design Component API

**Guidelines**:
- **Props**: Use TypeScript discriminated unions for variants
- **Composition**: Accept `children` for content
- **Flexibility**: Allow `className` override for edge cases
- **HTML attributes**: Spread remaining props to underlying element
- **Defaults**: Choose sensible defaults (variant="primary", size="md")

```typescript
interface ComponentProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}
```

### 3. Implement Component

**Location**: `/test-app/src/components/ComponentName.tsx`

- Use TypeScript for type safety
- Export both the component and its props interface
- Use string template for className composition
- Preserve all HTML attributes with `...props`
- Allow `className` override but apply it last
- Use semantic HTML elements

### 4. Refactor Existing Code

**Strategy**: Refactor incrementally, one file at a time.

1. **Pick one file** from Component Registry locations
2. **Add import** for the new component
3. **Replace ONE instance** of inline pattern with component
4. **Test the page** - verify it still works
5. **Replace remaining instances** in that file
6. **Commit** with descriptive message
7. **Repeat** for next file

### 5. Update Component Registry

Add to "✅ Extracted Components" in REGISTRY.md and remove from "⚠️ Patterns Needing Extraction"

---

## Accessibility Guidelines

- Use semantic HTML elements (`<button>`, not `<div>` with click handler)
- Ensure focus is visible (focus ring)
- Support keyboard navigation (Enter, Space)
- Ensure adequate color contrast (4.5:1 for text)

---

## Common Pitfalls

- ❌ Don't add variants you don't use yet — start with what exists
- ❌ Don't hardcode everything — accept `className` for overrides
- ❌ Don't use `any` or unclear types — extend proper HTML element types
- ❌ Don't refactor everything at once — one file at a time, test after each

---

## References
- `component-registry`: For tracking components and patterns
