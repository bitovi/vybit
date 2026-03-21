export interface ArgType {
  control: string;
  options?: string[];
  description?: string;
  defaultValue?: unknown;
}

export interface StoryEntry {
  id: string;
  title: string;  // e.g. "Components/Button"
  name: string;   // e.g. "Primary"
  args?: Record<string, unknown>;
  argTypes?: Record<string, ArgType>;
}

export interface ComponentGroup {
  name: string;     // e.g. "Button"
  stories: StoryEntry[];
  argTypes: Record<string, ArgType>;
}
