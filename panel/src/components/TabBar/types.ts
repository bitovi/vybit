export interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
  tooltip?: string;
}

export interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}
