import type { SnapshotMeta, BugReportElement, BugTimelineEntry, RecordingSnapshot } from '../../../../shared/types';

export interface BugReportModeProps {
  onSubmit: (patch: BugReportPatchData) => void;
}

export interface BugReportPatchData {
  bugDescription: string;
  bugScreenshots: string[];
  bugTimeline: BugTimelineEntry[];
  bugTimeRange: { start: string; end: string };
  bugElement: BugReportElement | null;
}

/** A primary event in the timeline with its grouped secondary items */
export interface EventGroup {
  /** The primary snapshot meta */
  primary: SnapshotMeta;
  /** Secondary summary rows derived from the snapshot's data */
  secondaries: SecondaryItem[];
  /** Whether this primary is checked for inclusion in the report */
  checked: boolean;
}

export type SecondaryType = 'mutations' | 'screenshot' | 'network' | 'logs';

export interface SecondaryItem {
  type: SecondaryType;
  label: string;
  checked: boolean;
  /** Extra info for network: status code, method, url */
  networkStatus?: number;
  networkMethod?: string;
  /** Count for logs/mutations */
  count?: number;
  errorCount?: number;
}
