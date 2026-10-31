import { createElement } from 'react';
import {
  Dock,
  serializeLayout,
  parseLayout,
  type DockLayout,
  type DockProps,
} from '@lp-labs/react-dock';

const value: DockLayout = {
  version: 1,
  root: { type: 'tabs', id: 'main', tabs: [], activeId: null },
};
const props: DockProps = { value, onChange: () => {}, renderPanel: (panel) => panel.title };
createElement(Dock, props);
parseLayout(serializeLayout(value));
