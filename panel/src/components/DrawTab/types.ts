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
  type?: 'story' | 'docs';  // Storybook index entry type; absent in older SB versions
  args?: Record<string, unknown>;
  argTypes?: Record<string, ArgType>;
  componentPath?: string; // e.g. "./src/components/Button.tsx" from Storybook index
}

export interface ComponentGroup {
  name: string;     // e.g. "Button"
  stories: StoryEntry[];
  argTypes: Record<string, ArgType>;
  componentPath?: string; // resolved from first story's componentPath
}
