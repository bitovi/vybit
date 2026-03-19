import type { ReactNode } from 'react';

export interface AvailableProperty {
  /** Human-readable name, e.g. "Text color" */
  name: string;
  /** Prefix hint shown in mono, e.g. "text-{color}" */
  prefixHint: string;
  /** Prefix identifier used in callback, e.g. "text" */
  prefix: string;
}

export interface PropertySectionProps {
  /** Section label displayed in uppercase, e.g. "Typography" */
  label: string;
  /** Properties available to add via the [+] dropdown */
  availableProperties?: AvailableProperty[];
  /** Called when a property is selected from the dropdown */
  onAddProperty?: (prefix: string) => void;
  /** When true, shows an empty-state message */
  isEmpty?: boolean;
  /** Number of matched classes in this section — shown as a badge when collapsed */
  classCount?: number;
  /** Chip content rendered inside the section */
  children?: ReactNode;
}
