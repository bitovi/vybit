import React from 'react';
import { addons, types } from '@storybook/manager-api';
import { AddonPanel } from '@storybook/components';

const ADDON_ID = 'vybit';
const PANEL_ID = `${ADDON_ID}/panel`;

addons.register(ADDON_ID, (api) => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: 'Vybit',
    paramKey: 'vybit',
    render: ({ active }) => {
      const serverUrl =
        api.getCurrentParameter<{ serverUrl?: string }>('vybit')?.serverUrl
        ?? 'http://localhost:3333';

      if (active) {
        api.togglePanelPosition('right');
      }

      return (
        <AddonPanel active={active ?? false}>
          <div style={{ height: '100%', width: '100%' }}>
            <iframe
              src={`${serverUrl}/panel/`}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Vybit Panel"
            />
          </div>
        </AddonPanel>
      );
    },
  });
});
