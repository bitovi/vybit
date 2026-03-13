---
name: component-registry
description: Track and manage reusable UI components and patterns in the test-app. Maintains an inventory of extracted components and unextracted patterns to promote incremental refactoring and prevent code duplication.
---

# Component Registry Skill

## Purpose
Maintain a living inventory of UI components and patterns in the test-app to:
- **Track what components exist** and where to find them
- **Identify repeated patterns** that should be extracted
- **Enable incremental refactoring** - each new feature cleans up before adding
- **Prevent duplication** - check registry before creating new components

---

## Registry Location
`.github/skills/component-registry/REGISTRY.md`

---

## Registry Structure

### Extracted Components
Components that exist as reusable, shared implementations:

```markdown
### Button
- **Path**: `/test-app/src/components/Button.tsx`
- **Description**: Reusable button with variants (primary, secondary) and Tailwind classes
```

### Potential Components (Not Yet Extracted)
Patterns that might need extraction:

```markdown
### Card
- **Name**: Card
- **Description**: Container with white background, border, rounded corners, and shadow
- **Found in**: `/test-app/src/components/Card.tsx`
```

---

## How to Use This Skill

### When Starting a New Feature
1. **Check Registry for Existing Components** - Read `.github/skills/component-registry/REGISTRY.md`
2. **Check for Potential Components** - Review "Potential Components" section

### After Implementing a Feature
1. **Add New Components** - Add any new reusable components you created
2. **Note Potential Components** - If you used the same inline pattern 2+ times, add it

---

## Maintenance Commands

### Scan for Repeated Patterns
```bash
grep -r 'className=".*bg-white.*rounded.*shadow' test-app/src/ -n
```

### Count Component Usages
```bash
grep -r "import.*from.*components/" test-app/src/ | wc -l
```

## Benefits
- **Find before creating**: Check what exists before building something new
- **Spot duplication**: Identify patterns that appear multiple times
- **Incremental improvement**: Registry grows organically with each feature
