# Bitovi.com Design Tokens

Quick reference for design system tokens. Use these values consistently across the application.

---

## Colors

```typescript
// Primary Brand Colors
const colors = {
  primary: {
    bitOrange: '#F5532D',  // BitOrange 500 - Brand accent color
    teal600: '#00848B',    // Primary interactive elements
    teal700: '#04646A',    // Radial gradient (light)
    teal800: '#00464A',    // Dark sections, footer
    teal900: '#023538',    // Darkest teal
    teal950: '#002A2D',    // Radial gradient (dark)
  },

  // Neutral Colors (Gray Palette)
  neutral: {
    gray800: '#334041',   // Headings, primary text
    gray600: '#687879',   // Secondary text
    gray400: '#A3ADAD',   // Tertiary text, borders
    gray200: '#DFE2E2',   // Subtle borders
    gray100: '#F4F5F5',   // Backgrounds
    white: '#FFFFFF',     // Primary background
  },

  // Tertiary Colors (Status & Data Viz)
  tertiary: {
    yellow: '#CF7C01',    // Warning
    green: '#5FA657',     // Success
    blue: '#5B91E9',      // Info
    violet: '#B068F4',    // Special
    pink: '#DA5AB6',      // Alert
  },
}
```

### Usage Guidelines
- **BitOrange (#F5532D)**: Use sparingly as accent color — highlights, decorative curved lines, active states
- **Teal 600 (#00848B)**: Primary buttons (Contact, Submit), interactive elements
- **Teal 800 (#00464A)**: Footer background, dark sections, headers
- **Gray 800 (#334041)**: All headings, body text
- **Gray 600 (#687879)**: Secondary text, descriptions, captions
- **Gray 100 (#F4F5F5)**: Section backgrounds, card surfaces

**Brand Guideline**: Primary brand color is teal. Dark tones should always be balanced with white. BitOrange should be used sparingly to accent or highlight.

---

## Typography

### Importing Google Fonts

```html
<!-- Google Fonts Import -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@700&family=Inter:wght@400;700&family=Roboto+Mono&display=swap" rel="stylesheet">
```

Or in CSS:

```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&family=Inter:wght@400;700&family=Roboto+Mono&display=swap');
```

**Google Fonts Links**:
- [Poppins](https://fonts.google.com/specimen/Poppins)
- [Inter](https://fonts.google.com/specimen/Inter)
- [Roboto Mono](https://fonts.google.com/specimen/Roboto+Mono)

### Font Families

```typescript
const fontFamily = {
  display: '"Poppins", sans-serif',      // Headlines, buttons (Bold only)
  body: '"Inter", sans-serif',           // All body text (Regular)
  code: '"Roboto Mono", monospace',      // Code/monospace only
}
```

**Official Bitovi Typeface Usage:**
- **Poppins (Bold)**: Display font for headlines and buttons only. Line height: 1.2x font size
- **Inter (Regular)**: Body font for all text. Line height: 1.5x font size
- **Roboto Mono**: Code or monospace only

### Font Sizes (px)

```typescript
const fontSize = {
  hero: '56px',        // H1, hero headings (Poppins Bold)
  h2: '40px',          // Section headings (Poppins Bold)
  h3: '28px',          // Subsection headings (Poppins Bold)
  h4: '24px',          // Component headings (Poppins Bold)
  body: '18px',        // Default body text (Inter Regular)
  bodySmall: '16px',   // Smaller body text (Inter Regular)
  caption: '14px',     // Captions, helper text (Inter Regular)
}
```

**Text Scale Rule**: Titles should be 4x the size of body text. Headings should be 2x body text (halfway between title and body).

### Font Weights

```typescript
const fontWeight = {
  regular: 400,        // Inter body text
  bold: 700,           // Poppins headings, Inter emphasis
}
```

### Line Heights

```typescript
const lineHeight = {
  display: 1.2,        // Poppins headings/buttons
  body: 1.5,           // Inter body text
}
```

### Typography Scale

```css
/* Hero Heading (H1) */
font-family: 'Poppins', sans-serif;
font-size: 56px;
font-weight: 700;
line-height: 1.2;
color: #334041;  /* Gray 800 or Teal 800 */

/* Section Heading (H2) */
font-family: 'Poppins', sans-serif;
font-size: 40px;
font-weight: 700;
line-height: 1.2;
color: #334041;  /* Gray 800 or Teal 800 */

/* Subsection Heading (H3) */
font-family: 'Poppins', sans-serif;
font-size: 28px;
font-weight: 700;
line-height: 1.2;
color: #334041;  /* Gray 800 or Teal 800 */

/* Body Text */
font-family: 'Inter', sans-serif;
font-size: 18px;
font-weight: 400;
line-height: 1.5;
color: #334041;  /* Gray 800 */

/* Body Emphasis */
font-family: 'Inter', sans-serif;
font-weight: 700;  /* Bold */
color: #00848B;    /* Teal 600 for emphasis */

/* Hyperlinks */
font-family: 'Inter', sans-serif;
font-weight: 400;
color: #00848B;    /* Teal 600 */
text-decoration: underline;

/* Caption */
font-family: 'Inter', sans-serif;
font-size: 14px;
font-weight: 400;
line-height: 1.5;
color: #687879;  /* Gray 600 */

/* Code */
font-family: 'Roboto Mono', monospace;
```

**Color Rules:**
- On teal backgrounds: White text
- On white backgrounds: Dark teal (#00464A) or dark gray (#334041)

---

## Spacing

**Bitovi uses an 8-pixel spacing grid with 4-pixel half-steps available.**

```typescript
// Spacing Scale (px) - Based on 8px grid
const spacing = {
  xxs: '4px',   // Half-step
  xs: '8px',    // 1x grid
  sm: '16px',   // 2x grid
  md: '24px',   // 3x grid
  lg: '32px',   // 4x grid
  xl: '48px',   // 6x grid
  xxl: '64px',  // 8x grid
  xxxl: '96px', // 12x grid
}
```

### Common Spacing Patterns
- **Section padding (vertical)**: 64-96px
- **Section padding (horizontal)**: 48px desktop, 32px tablet, 16px mobile
- **Card padding**: 24-32px
- **Form field spacing**: 16-24px
- **Component margin**: 24-32px
- **Content max-width**: 1200-1400px

---

## Border Radius

```typescript
const borderRadius = {
  small: '4px',        // Inputs, small elements
  medium: '8px',       // Buttons, cards
  large: '12px',       // Large cards, modals
  round: '50%',        // Circular elements (avatars, icon backgrounds)
}
```

---

## Shadows

```typescript
const shadows = {
  card: '0 2px 8px rgba(0, 0, 0, 0.1)',
  cardHover: '0 4px 16px rgba(0, 0, 0, 0.15)',
  header: '0 1px 3px rgba(0, 0, 0, 0.05)',
}
```

---

## Breakpoints

```typescript
const breakpoints = {
  mobile: '320px',
  tablet: '768px',
  desktop: '1024px',
  desktopLarge: '1440px',
}
```

### Media Queries
```css
/* Mobile first approach */
@media (min-width: 768px) { /* Tablet */ }
@media (min-width: 1024px) { /* Desktop */ }
@media (min-width: 1440px) { /* Large Desktop */ }
```

---

## Component Tokens

### Buttons

```typescript
const button = {
  primary: {
    background: '#00848B',     // Teal 600
    color: '#FFFFFF',
    padding: '12px 32px',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '16px',
    hoverBackground: '#00464A', // Teal 800
  },

  secondary: {
    background: '#F5532D',     // BitOrange 500
    color: '#FFFFFF',
    padding: '12px 32px',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '16px',
    hoverBackground: '#C73D26', // BitOrange 600
  },

  link: {
    color: '#F5532D',          // BitOrange
    textDecoration: 'none',
    hoverTextDecoration: 'underline',
  },
}
```

### Forms

```typescript
const input = {
  height: '48px',
  padding: '12px 16px',
  border: '1px solid #DFE2E2',  // Gray 200
  borderRadius: '4px',
  fontSize: '16px',
  focusBorderColor: '#00848B',  // Teal 600
  backgroundColor: '#FFFFFF',
}

const label = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#2C2C2C',
  marginBottom: '8px',
}
```

### Cards

```typescript
const card = {
  background: '#FFFFFF',
  padding: '32px',
  borderRadius: '12px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  hoverBoxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
}
```

---

## Tailwind CSS Configuration

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        'display': ['Poppins', 'sans-serif'],  // Headlines, buttons (Bold)
        'body': ['Inter', 'sans-serif'],       // Body text (Regular)
        'mono': ['Roboto Mono', 'monospace'],  // Code only
      },
      colors: {
        'bit-orange': '#F5532D',      // BitOrange 500
        'teal': {
          600: '#00848B',
          700: '#04646A',  // Radial gradient (inner)
          800: '#00464A',
          900: '#023538',
          950: '#002A2D',  // Radial gradient (outer)
        },
        'gray': {
          800: '#334041',
          600: '#687879',
          400: '#A3ADAD',
          200: '#DFE2E2',
          100: '#F4F5F5',
        },
      },
      spacing: {
        '18': '4.5rem',  // 72px
        '88': '22rem',   // 352px
      },
      fontSize: {
        'hero': ['56px', { lineHeight: '1.2', fontWeight: '700' }],  // Poppins Bold
        'h2':   ['40px', { lineHeight: '1.2', fontWeight: '700' }],  // Poppins Bold
        'h3':   ['28px', { lineHeight: '1.2', fontWeight: '700' }],  // Poppins Bold
        'body': ['18px', { lineHeight: '1.5', fontWeight: '400' }],  // Inter Regular
      },
      maxWidth: {
        'content': '1400px',
      },
    },
  },
}
```

---

## Icon Tokens

**Bitovi uses [Phosphor Icons](https://phosphoricons.com/) in Regular weight.** At larger sizes, Light weight may be appropriate.

```typescript
const icon = {
  library: 'phosphor',
  weights: {
    default: 'regular',
    large: 'light',     // For larger icon sizes
  },
  sizes: {
    small: '24px',
    medium: '32px',
    large: '48px',
    xlarge: '64px',
  },
  color: {
    default: '#334041',     // Gray 800
    accent: '#F5532D',      // BitOrange
    secondary: '#687879',   // Gray 600
    onTeal: '#FFFFFF',      // White on teal backgrounds
  },
}
```

### "Bits" Illustration Element

The "bits" are Bitovi's visual branding element used as decoration:
- **Color**: Always BitOrange (#F5532D)
- **Style**: Filled or outlined circles
- **Stroke**: 2-3px weight (lightweight)
- **Connection lines**: Same stroke weight as bits
- **Corners**: Rounded when lines bend
- **Placement**: Intentionally arbitrary along curved lines

```typescript
const bits = {
  color: '#F5532D',        // BitOrange only
  strokeWidth: '2-3px',    // Lightweight
  style: ['filled', 'outlined'],
  corners: 'rounded',
}
```

---

## Pattern Tokens

### Teal Radial Gradient

**Bitovi's official teal gradient** is a radial gradient:

```css
/* Teal Radial Gradient */
background: radial-gradient(circle, #04646A 0%, #002A2D 100%);
/* Teal 700 to Teal 950 */
```

```typescript
const gradient = {
  tealRadial: {
    type: 'radial-gradient',
    shape: 'circle',
    colorStops: [
      { color: '#04646A', position: '0%' },   // Teal 700
      { color: '#002A2D', position: '100%' }, // Teal 950
    ],
  },
}
```

---

## Animation Tokens

```typescript
const animation = {
  duration: {
    fast: '150ms',
    normal: '250ms',
    slow: '400ms',
  },
  easing: {
    default: 'ease-in-out',
    in: 'ease-in',
    out: 'ease-out',
  },
}
```

### Common Transitions
```css
/* Hover transitions */
transition: all 250ms ease-in-out;

/* Color transitions only */
transition: color 150ms ease-in-out, background-color 150ms ease-in-out;

/* Transform transitions */
transition: transform 250ms ease-out;
```

---

## Z-Index Scale

```typescript
const zIndex = {
  dropdown: 100,
  sticky: 200,
  header: 300,
  overlay: 400,
  modal: 500,
  popover: 600,
  tooltip: 700,
}
```

---

## Accessibility Tokens

```typescript
const a11y = {
  minTouchTarget: '44px',          // Minimum tap target size
  minContrastRatio: 4.5,           // WCAG AA for body text
  minContrastRatioLarge: 3,        // WCAG AA for large text (24px+)
  focusOutlineWidth: '2px',
  focusOutlineColor: '#00848B',    // Teal 600
  focusOutlineOffset: '2px',
}
```

---

## Usage

### CSS Custom Properties

```css
:root {
  /* Font Families */
  --font-display: 'Poppins', sans-serif;     /* Headlines, buttons (Bold) */
  --font-body: 'Inter', sans-serif;          /* Body text (Regular) */
  --font-code: 'Roboto Mono', monospace;     /* Code only */

  /* Primary Brand Colors */
  --color-bit-orange: #F5532D;
  --color-teal-600: #00848B;
  --color-teal-700: #04646A;   /* Radial gradient inner */
  --color-teal-800: #00464A;
  --color-teal-900: #023538;
  --color-teal-950: #002A2D;   /* Radial gradient outer */

  /* Neutral Grays */
  --color-gray-800: #334041;
  --color-gray-600: #687879;
  --color-gray-400: #A3ADAD;
  --color-gray-200: #DFE2E2;
  --color-gray-100: #F4F5F5;

  /* Spacing (8px grid with 4px half-steps) */
  --spacing-xxs: 4px;
  --spacing-xs: 8px;
  --spacing-sm: 16px;
  --spacing-md: 24px;
  --spacing-lg: 32px;
  --spacing-xl: 48px;
  --spacing-xxl: 64px;
  --spacing-xxxl: 96px;

  /* Typography */
  --font-size-hero: 56px;
  --font-size-h2: 40px;
  --font-size-h3: 28px;
  --font-size-body: 18px;
  --font-size-caption: 14px;

  /* Line Heights */
  --line-height-display: 1.2;   /* Poppins */
  --line-height-body: 1.5;      /* Inter */

  /* Gradient */
  --gradient-teal-radial: radial-gradient(circle, #04646A 0%, #002A2D 100%);

  /* Shadows */
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.1);
  --shadow-card-hover: 0 4px 16px rgba(0, 0, 0, 0.15);

  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Transitions */
  --transition-fast: 150ms ease-in-out;
  --transition-normal: 250ms ease-in-out;
  --transition-slow: 400ms ease-in-out;
}
```

### React/TypeScript Component Example

```typescript
import styled from 'styled-components';

const PrimaryButton = styled.button`
  font-family: 'Poppins', sans-serif;   /* Display font for buttons */
  font-weight: 700;                     /* Bold */
  background-color: #00848B;            /* Teal 600 */
  color: #FFFFFF;
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 16px;
  border: none;
  cursor: pointer;
  transition: background-color 250ms ease-in-out;

  &:hover {
    background-color: #00464A;          /* Teal 800 */
  }

  &:focus {
    outline: 2px solid #00848B;
    outline-offset: 2px;
  }
`;

const Heading = styled.h2`
  font-family: 'Poppins', sans-serif;   /* Display font for headings */
  font-weight: 700;                     /* Bold */
  font-size: 40px;
  line-height: 1.2;                     /* Poppins line height */
  color: #334041;                       /* Gray 800 */
`;

const BodyText = styled.p`
  font-family: 'Inter', sans-serif;     /* Body font */
  font-weight: 400;                     /* Regular */
  font-size: 18px;
  line-height: 1.5;                     /* Inter line height */
  color: #334041;                       /* Gray 800 */
`;

const Card = styled.div`
  background: #FFFFFF;
  padding: 32px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: box-shadow 250ms ease-in-out;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }
`;
```

---

*Use these tokens consistently to maintain design system coherence across the application.*
