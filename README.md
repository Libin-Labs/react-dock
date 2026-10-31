# @lp-labs/react-dock

Package version: `1.0.0`.

Controlled binary split panes and tab groups. Move and reorder tabs, dock them
beside a group and persist a validated layout. React `^18.2.0 || ^19.0.0` is
the only runtime peer. Includes independent ESM, CommonJS and declarations.

```sh
npm install @lp-labs/react-dock react
```

```tsx
import { useState } from "react";
import { Dock, serializeLayout, parseLayout, type DockLayout } from "@lp-labs/react-dock";
import "@lp-labs/react-dock/style.css";

const initial: DockLayout = {
  version: 1,
  root: {
    type: "tabs", id: "main",
    tabs: [{ id: "editor", title: "Editor" }, { id: "help", title: "Help" }],
    activeId: "editor"
  }
};

export function Workspace() {
  const [layout, setLayout] = useState(initial);
  const [saved, setSaved] = useState("");
  return <>
    <Dock value={layout} onChange={setLayout} style={{ height: 500 }}
      renderPanel={panel => panel.id === "editor"
        ? <textarea aria-label="Document" defaultValue="Edit here" />
        : <p>Workspace help</p>} />
    <button onClick={() => setSaved(serializeLayout(layout))}>Save layout</button>
    <button disabled={!saved} onClick={() => {
      try { setLayout(parseLayout(saved)); }
      catch (error) { console.error("Invalid saved layout", error); }
    }}>Restore layout</button>
  </>;
}
```

## Types and controlled API

`DockPanel = { readonly id: string; readonly title: string }`.
`TabGroup = { type: "tabs"; id: string; tabs: readonly DockPanel[];
activeId: string | null }`.
`SplitPane = { type: "split"; id: string; direction: "horizontal" | "vertical";
ratio: number; first: DockNode; second: DockNode }`.
`DockNode = TabGroup | SplitPane`.
`DockLayout = { version: 1; root: DockNode }`.
All model properties are readonly. Horizontal splits are side-by-side; vertical
splits are stacked. Ratio is the first pane's relative share of available space.
An empty tab group must have `activeId: null`; otherwise it selects a tab.
Panel IDs and node IDs share one unique nonempty string namespace.

| `DockProps` prop | Type | Default / behavior |
| --- | --- | --- |
| `value` | `DockLayout` | Required controlled, validated layout |
| `onChange` | `(layout: DockLayout, action: DockAction) => void` | Required; replace `value` to accept changes |
| `renderPanel` | `(panel: DockPanel) => ReactNode` | Required content renderer |
| `keepAlive` | `boolean` | `false`; inactive panel contents unmount |
| `readOnly` | `boolean` | `false`; disables move/dock/close/resize, still permits tab selection |
| `label` | `string` | `"Dock layout"` accessible root group name |
| `className`, `style` | `string`, `CSSProperties` | Wrapper customization; default height `400` pixels |

`DockAction = "select" | "move" | "dock" | "close" | "resize"`.
Only IDs/titles and layout geometry are persisted, never React elements,
functions, panel application state or DOM references. Keep important document
state outside mounted panels. With `keepAlive`, inactive contents remain
mounted and hidden within their current group; moving/docking across groups
can still remount them. Closing unmounts content. React owns content cleanup;
split gestures and drag references are cleared when their owners unmount.

## Interactions and accessibility

Click tabs to select. A tablist uses roving focus: Left/Right wrap between tabs,
Home/End select the first/last tab. Panels use tabpanel roles and explicit
label/control IDs. Keyboard-accessible controls under each tablist operate on
the active panel:

- Earlier/Later reorder in the current group.
- Select a target group, then Move to append to it.
- Dock left/right/top/bottom creates a new group and a 50/50 split next to
  the target group. Docking within the same group is supported.
- Close removes the active panel and selects the nearest remaining tab.

Mouse HTML drag-and-drop moves a tab onto another tab (insertion at that index)
or a tablist (append). Drag state is scoped to one Dock instance; external
payloads are ignored. Native touch drag support varies; use the buttons on
touch or keyboard. Split dividers use pointer capture; focus and use the split
axis's arrow keys for 2% increments, Shift for 10%, Home/End for 10%/90%.
The separator's ARIA value tracks the first pane percentage.

Empty groups and their splits remain after move/close; they are valid drop
targets, not automatically collapsed. To add/reopen panels or collapse empty
branches, construct a new valid controlled layout. There is no destructive
close confirmation; intercept the `"close"` action in your application.

## Pure model helpers

Helpers never mutate the supplied layout:

- `validateLayout(value: unknown): asserts value is DockLayout` throws
  `LayoutError` for invalid structures, active IDs, duplicates, cycles, version,
  direction or ratios outside 0.1..0.9. Limits: depth 64, 2000 nodes, 2000 tabs
  per group, IDs at most 200 characters.
- `serializeLayout(layout): string` validates and serializes only model fields.
- `parseLayout(json): DockLayout` validates and copies JSON; rejects malformed
  JSON or strings longer than one million characters. No migration from other
  versions is attempted.
- `getGroups(layout): TabGroup[]` returns groups in tree order; expects a valid
  layout and returns references (do not mutate them).
- `selectTab(layout, groupId, panelId): DockLayout`.
- `closePanel(layout, panelId): DockLayout` preserves empty groups.
- `movePanel(layout, panelId, targetId, index?): DockLayout` moves/reorders and
  activates the panel. `index` is the insertion position **after removal**;
  omitted means append. Explicit index must be 0..the original target length;
  the endpoint is clamped to its post-removal length.
- `dockPanel(layout, panelId, targetId, side, groupId, splitId): DockLayout`
  uses caller-provided fresh IDs. `DockSide` is left/right/top/bottom.
- `setSplitRatio(layout, splitId, ratio): DockLayout` clamps a finite ratio to
  0.1..0.9; unknown splits throw.
- `nextNodeId(layout, prefix = "dock"): string` finds an unused `prefix-N` ID
  for the current model, not a global ID allocator.

Edit helpers reject unknown groups/panels, invalid indices and non-finite
ratios with `LayoutError`. Persisted layouts are data, not trusted HTML; panel
titles render as text. Validate restored data before application use.

`LayoutError(message: string)` is an exported Error subclass with name
`"LayoutError"`. All component/model exports are named, with no default export.
Importing starts no DOM work; use your application's React renderer and DOM
types for interactions. There is no AbortSignal or async operation to cancel;
unmount ends gestures, while parent-owned layout persistence needs its own cleanup.

## Customization, performance and limits

Import CSS for tabs, controls, divider and focus styling. Theme `.lp-dock`,
`.lp-dock__tabs`, `.lp-dock__controls`, `.lp-dock__separator` and
`.lp-dock__content`. Keep a finite layout height and avoid fixed minimum sizes
on panel children. Ratios constrain proportions, not minimum pixel dimensions;
very small containers can make the controls cramped.

Model edits and validation traverse the tree; pointer resize emits a new
layout per pointer event. Batch/persist changes appropriately; do not write
storage on every move unless desired. Large nested layouts and expensive
content renderers cost CPU. This is an in-document docking layout, not native
window management: no pop-outs, portals, desktop windows, cross-instance
dragging, floating panes, drop previews, undo history, collaboration, virtual
panels, automatic persistence or responsive layout migration is implemented.

## License

[MIT](./LICENSE).

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
