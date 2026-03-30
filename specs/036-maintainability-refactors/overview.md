# 036 — Maintainability Refactors

## Problem

Five files account for 4,329 lines of the most complex, least maintainable code in the codebase. They share common anti-patterns: monolithic components, implicit state machines using boolean flags, giant message handlers with 15–25+ branches, copy-paste duplication, and no separation of concerns. These files are the ones every new feature must touch, making them a tax on all future development.

## Scope

| # | File | Lines | Severity | Subfolder |
|---|------|-------|----------|-----------|
| 1 | `panel/src/Picker.tsx` | 1,293 | Critical | [001-picker-extraction](./001-picker-extraction/) |
| 2 | `overlay/src/index.ts` | 906 | High | [002-overlay-decomposition](./002-overlay-decomposition/) |
| 3 | `overlay/src/drop-zone.ts` | 822 | High | [003-drop-zone-state-machine](./003-drop-zone-state-machine/) |
| 4 | `panel/src/App.tsx` | 713 | Medium-High | [004-app-simplification](./004-app-simplification/) |
| 5 | `server/mcp-tools.ts` | 595 | Medium-High | [005-mcp-tools-templates](./005-mcp-tools-templates/) |

## Cross-Cutting Issues

These refactors share common themes:

1. **No state machines** — boolean flags create invalid state combinations; replace with enums or discriminated unions
2. **Giant message handlers** — every new message type requires changes in 3+ files; extract to handler maps
3. **Copy-paste handlers** — color picker flows, mouse handlers, indicator rendering duplicated; consolidate
4. **No input validation** — WebSocket messages arrive unvalidated; add Zod schemas at boundaries
5. **Global mutable state** — overlay `state` object and drop-zone module-level variables make testing impossible

## Ordering

These refactors are independent and can be done in any order. However, the recommended priority is:

1. **Picker extraction** (001) — highest impact; unlocks testability for the core editing UI
2. **Drop-zone state machine** (003) — removes a class of invalid-state bugs
3. **App simplification** (004) — reduces the "every feature touches App.tsx" problem
4. **Overlay decomposition** (002) — largest file but partly addressed by prior extractions
5. **MCP tools templates** (005) — lowest urgency; mainly improves prompt maintainability

## Principles

- **Behavior-preserving** — all refactors should be pure restructuring with no user-visible behavior changes
- **Incremental** — each spec can be done in isolation; no spec depends on another
- **Test-first** — write tests for existing behavior before extracting, so the refactor can be validated
- **No new dependencies** — avoid adding state management libraries (XState, Zustand, etc.); use TypeScript discriminated unions and plain reducer patterns
