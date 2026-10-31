import { createElement } from 'react';
import dock = require('@lp-labs/react-dock');

const value: dock.DockLayout = {
  version: 1,
  root: { type: 'tabs', id: 'main', tabs: [], activeId: null },
};
createElement(dock.Dock, { value, onChange: () => {}, renderPanel: (panel) => panel.title });
dock.parseLayout(dock.serializeLayout(value));
