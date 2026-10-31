export interface DockPanel {
  readonly id: string;
  readonly title: string;
}

export interface TabGroup {
  readonly type: 'tabs';
  readonly id: string;
  readonly tabs: readonly DockPanel[];
  readonly activeId: string | null;
}

export interface SplitPane {
  readonly type: 'split';
  readonly id: string;
  readonly direction: 'horizontal' | 'vertical';
  readonly ratio: number;
  readonly first: DockNode;
  readonly second: DockNode;
}

export type DockNode = TabGroup | SplitPane;

export interface DockLayout {
  readonly version: 1;
  readonly root: DockNode;
}

export type DockSide = 'left' | 'right' | 'top' | 'bottom';

export class LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LayoutError';
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Validates cycles, resource bounds, globally unique IDs and active selections. */
export function validateLayout(value: unknown): asserts value is DockLayout {
  if (!record(value) || value.version !== 1) throw new LayoutError('Expected layout version 1');
  const ids = new Set<string>();
  const objects = new Set<object>();
  let count = 0;
  const id = (value: unknown) => {
    if (
      typeof value !== 'string' ||
      value.trim().length === 0 ||
      value.length > 200 ||
      ids.has(value)
    ) {
      throw new LayoutError('IDs must be unique nonempty strings of at most 200 characters');
    }
    ids.add(value);
  };
  const visit = (node: unknown, depth: number) => {
    if (!record(node) || depth > 64 || ++count > 2000 || objects.has(node)) {
      throw new LayoutError('Invalid tree, cycle, or layout size/depth limit exceeded');
    }
    objects.add(node);
    id(node.id);
    if (node.type === 'tabs') {
      if (!Array.isArray(node.tabs) || node.tabs.length > 2000)
        throw new LayoutError('Invalid tab array');
      for (const panel of node.tabs) {
        if (!record(panel) || typeof panel.title !== 'string')
          throw new LayoutError('Invalid panel');
        id(panel.id);
      }
      if (
        node.tabs.length === 0
          ? node.activeId !== null
          : !node.tabs.some((panel) => panel.id === node.activeId)
      ) {
        throw new LayoutError('activeId must select a panel, or be null for an empty group');
      }
    } else if (node.type === 'split') {
      if (
        (node.direction !== 'horizontal' && node.direction !== 'vertical') ||
        typeof node.ratio !== 'number' ||
        !Number.isFinite(node.ratio) ||
        node.ratio < 0.1 ||
        node.ratio > 0.9
      ) {
        throw new LayoutError('Split direction or ratio is invalid (expected ratio 0.1..0.9)');
      }
      visit(node.first, depth + 1);
      visit(node.second, depth + 1);
    } else {
      throw new LayoutError('Unknown node type');
    }
  };
  visit(value.root, 0);
}

function copyNode(node: DockNode): DockNode {
  if (node.type === 'tabs') {
    return {
      type: 'tabs',
      id: node.id,
      tabs: node.tabs.map(({ id, title }) => ({ id, title })),
      activeId: node.activeId,
    };
  }
  return {
    type: 'split',
    id: node.id,
    direction: node.direction,
    ratio: node.ratio,
    first: copyNode(node.first),
    second: copyNode(node.second),
  };
}

export function serializeLayout(layout: DockLayout): string {
  validateLayout(layout);
  return JSON.stringify({ version: 1, root: copyNode(layout.root) });
}

export function parseLayout(json: string): DockLayout {
  if (json.length > 1_000_000)
    throw new LayoutError('Serialized layout exceeds one million characters');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new LayoutError('Invalid layout JSON');
  }
  validateLayout(value);
  return { version: 1, root: copyNode(value.root) };
}

export function getGroups(layout: DockLayout): TabGroup[] {
  const groups: TabGroup[] = [];
  const visit = (node: DockNode) => {
    if (node.type === 'tabs') {
      groups.push(node);
    } else {
      visit(node.first);
      visit(node.second);
    }
  };
  visit(layout.root);
  return groups;
}

function mapNode(node: DockNode, transform: (node: DockNode) => DockNode): DockNode {
  return transform(
    node.type === 'tabs'
      ? node
      : {
          ...node,
          first: mapNode(node.first, transform),
          second: mapNode(node.second, transform),
        },
  );
}

function groupById(layout: DockLayout, groupId: string): TabGroup {
  const group = getGroups(layout).find((group) => group.id === groupId);
  if (!group) throw new LayoutError(`Unknown tab group: ${groupId}`);
  return group;
}

function panelById(layout: DockLayout, panelId: string): DockPanel {
  const panel = getGroups(layout)
    .flatMap((group) => group.tabs)
    .find((panel) => panel.id === panelId);
  if (!panel) throw new LayoutError(`Unknown panel: ${panelId}`);
  return panel;
}

export function selectTab(layout: DockLayout, groupId: string, panelId: string): DockLayout {
  validateLayout(layout);
  if (!groupById(layout, groupId).tabs.some((panel) => panel.id === panelId)) {
    throw new LayoutError('Panel is not in the target group');
  }
  return {
    ...layout,
    root: mapNode(layout.root, (node) =>
      node.id === groupId && node.type === 'tabs' ? { ...node, activeId: panelId } : node,
    ),
  };
}

export function closePanel(layout: DockLayout, panelId: string): DockLayout {
  validateLayout(layout);
  panelById(layout, panelId);
  return {
    ...layout,
    root: mapNode(layout.root, (node) => {
      if (node.type !== 'tabs') return node;
      const index = node.tabs.findIndex((panel) => panel.id === panelId);
      if (index < 0) return node;
      const tabs = node.tabs.filter((panel) => panel.id !== panelId);
      return {
        ...node,
        tabs,
        activeId:
          node.activeId === panelId
            ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null)
            : node.activeId,
      };
    }),
  };
}

export function movePanel(
  layout: DockLayout,
  panelId: string,
  targetId: string,
  index?: number,
): DockLayout {
  validateLayout(layout);
  const target = groupById(layout, targetId);
  const panel = panelById(layout, panelId);
  if (
    index !== undefined &&
    (!Number.isInteger(index) || index < 0 || index > target.tabs.length)
  ) {
    throw new LayoutError('Insertion index must be an integer within the target tab array');
  }
  const removed = closePanel(layout, panelId);
  return {
    ...removed,
    root: mapNode(removed.root, (node) => {
      if (node.id !== targetId || node.type !== 'tabs') return node;
      const tabs = [...node.tabs];
      tabs.splice(Math.min(index ?? tabs.length, tabs.length), 0, panel);
      return { ...node, tabs, activeId: panelId };
    }),
  };
}

export function dockPanel(
  layout: DockLayout,
  panelId: string,
  targetId: string,
  side: DockSide,
  groupId: string,
  splitId: string,
): DockLayout {
  validateLayout(layout);
  groupById(layout, targetId);
  const panel = panelById(layout, panelId);
  if (!['left', 'right', 'top', 'bottom'].includes(side))
    throw new LayoutError('Unknown docking side');
  const removed = closePanel(layout, panelId);
  const newGroup: TabGroup = { type: 'tabs', id: groupId, tabs: [panel], activeId: panelId };
  const before = side === 'left' || side === 'top';
  const result: DockLayout = {
    ...removed,
    root: mapNode(removed.root, (node): DockNode =>
      node.id === targetId
        ? {
            type: 'split',
            id: splitId,
            direction: side === 'left' || side === 'right' ? 'horizontal' : 'vertical',
            ratio: 0.5,
            first: before ? newGroup : node,
            second: before ? node : newGroup,
          }
        : node,
    ),
  };
  validateLayout(result);
  return result;
}

export function setSplitRatio(layout: DockLayout, splitId: string, ratio: number): DockLayout {
  validateLayout(layout);
  if (!Number.isFinite(ratio)) throw new LayoutError('Ratio must be finite');
  let found = false;
  const root = mapNode(layout.root, (node) => {
    if (node.id !== splitId || node.type !== 'split') return node;
    found = true;
    return { ...node, ratio: Math.max(0.1, Math.min(0.9, ratio)) };
  });
  if (!found) throw new LayoutError(`Unknown split: ${splitId}`);
  return { ...layout, root };
}

export function nextNodeId(layout: DockLayout, prefix = 'dock'): string {
  validateLayout(layout);
  const ids = new Set<string>();
  const visit = (node: DockNode) => {
    ids.add(node.id);
    if (node.type === 'tabs') {
      node.tabs.forEach((panel) => ids.add(panel.id));
    } else {
      visit(node.first);
      visit(node.second);
    }
  };
  visit(layout.root);
  for (let index = 1; ; index++) {
    const candidate = `${prefix}-${index}`;
    if (candidate.length > 200 || !prefix.trim())
      throw new LayoutError('ID prefix must be nonempty and shorter than 199 characters');
    if (!ids.has(candidate)) return candidate;
  }
}
