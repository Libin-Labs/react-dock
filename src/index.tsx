import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MutableRefObject,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  closePanel,
  dockPanel,
  getGroups,
  movePanel,
  nextNodeId,
  selectTab,
  setSplitRatio,
  validateLayout,
  type DockLayout,
  type DockNode,
  type DockPanel,
  type DockSide,
  type TabGroup,
} from './model.js';

export * from './model.js';

export type DockAction = 'select' | 'move' | 'dock' | 'close' | 'resize';

export interface DockProps {
  value: DockLayout;
  onChange: (layout: DockLayout, action: DockAction) => void;
  renderPanel: (panel: DockPanel) => ReactNode;
  keepAlive?: boolean;
  readOnly?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
}

interface BranchProps extends DockProps {
  node: DockNode;
  groups: TabGroup[];
  prefix: string;
  dragged: MutableRefObject<string | null>;
}

function DockBranch(props: BranchProps) {
  const {
    node,
    value,
    onChange,
    renderPanel,
    groups,
    prefix,
    dragged,
    keepAlive = false,
    readOnly = false,
  } = props;
  const [target, setTarget] = useState('');
  const resizing = useRef<{
    pointerId: number;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  useEffect(
    () => () => {
      resizing.current = null;
    },
    [],
  );
  useEffect(() => {
    if (readOnly) resizing.current = null;
  }, [readOnly]);
  const finishResize = (event: PointerEvent) => {
    if (resizing.current?.pointerId === event.pointerId) resizing.current = null;
  };
  const tabId = (id: string) => `${prefix}-tab-${encodeURIComponent(id)}`;
  const panelId = (id: string) => `${prefix}-panel-${encodeURIComponent(id)}`;

  if (node.type === 'split') {
    const horizontal = node.direction === 'horizontal';
    return (
      <div
        className={`lp-dock__split lp-dock__split--${node.direction}`}
        style={{
          display: 'flex',
          flexDirection: horizontal ? 'row' : 'column',
          height: '100%',
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <div
          className="lp-dock__pane"
          style={{ flex: `${node.ratio} 1 0%`, minWidth: 0, minHeight: 0 }}
        >
          <DockBranch {...props} node={node.first} key={node.first.id} />
        </div>
        <div
          role="separator"
          aria-label={`Resize split ${node.id}`}
          aria-orientation={horizontal ? 'vertical' : 'horizontal'}
          aria-valuemin={10}
          aria-valuemax={90}
          aria-valuenow={Math.round(node.ratio * 100)}
          aria-disabled={readOnly}
          tabIndex={readOnly ? -1 : 0}
          className="lp-dock__separator"
          style={{
            touchAction: 'none',
            flex: '0 0 6px',
            cursor: horizontal ? 'col-resize' : 'row-resize',
          }}
          onPointerDown={(event) => {
            if (readOnly || event.button !== 0) return;
            const rect = event.currentTarget.parentElement?.getBoundingClientRect();
            if (!rect || rect.width <= 0 || rect.height <= 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            resizing.current = {
              pointerId: event.pointerId,
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            };
          }}
          onPointerMove={(event) => {
            const active = resizing.current;
            if (!active || active.pointerId !== event.pointerId || readOnly) return;
            const ratio = horizontal
              ? (event.clientX - active.left) / active.width
              : (event.clientY - active.top) / active.height;
            onChange(setSplitRatio(value, node.id, ratio), 'resize');
          }}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onLostPointerCapture={finishResize}
          onKeyDown={(event) => {
            if (readOnly) return;
            const keys = horizontal ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
            if (![...keys, 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const step = event.shiftKey ? 0.1 : 0.02;
            const ratio =
              event.key === 'Home'
                ? 0.1
                : event.key === 'End'
                  ? 0.9
                  : node.ratio + (event.key === keys[0] ? -step : step);
            onChange(setSplitRatio(value, node.id, ratio), 'resize');
          }}
        />
        <div
          className="lp-dock__pane"
          style={{ flex: `${1 - node.ratio} 1 0%`, minWidth: 0, minHeight: 0 }}
        >
          <DockBranch {...props} node={node.second} key={node.second.id} />
        </div>
      </div>
    );
  }

  const active = node.tabs.find((panel) => panel.id === node.activeId);
  const targetId = groups.some((group) => group.id === target) ? target : node.id;
  const activeIndex = node.tabs.findIndex((panel) => panel.id === node.activeId);
  const drop = (event: DragEvent, index?: number) => {
    if (readOnly || !dragged.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (groups.some((group) => group.tabs.some((panel) => panel.id === dragged.current))) {
      onChange(movePanel(value, dragged.current, node.id, index), 'move');
    }
    dragged.current = null;
  };
  const dock = (side: DockSide) => {
    if (!active) return;
    const groupId = nextNodeId(value, 'group');
    const splitId = nextNodeId(value, 'split');
    onChange(dockPanel(value, active.id, targetId, side, groupId, splitId), 'dock');
  };
  return (
    <section
      className="lp-dock__group"
      aria-label={`Tab group ${node.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        height: '100%',
      }}
    >
      <div
        role="tablist"
        aria-label={`Panels in ${node.id}`}
        className="lp-dock__tabs"
        onDragOver={(event) => {
          if (!readOnly && dragged.current) event.preventDefault();
        }}
        onDrop={(event) => drop(event)}
      >
        {node.tabs.map((panel, index) => (
          <button
            key={panel.id}
            type="button"
            role="tab"
            id={tabId(panel.id)}
            aria-selected={node.activeId === panel.id}
            aria-controls={panelId(panel.id)}
            tabIndex={node.activeId === panel.id ? 0 : -1}
            draggable={!readOnly}
            onClick={() => onChange(selectTab(value, node.id, panel.id), 'select')}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const nextIndex =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? node.tabs.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + node.tabs.length) %
                      node.tabs.length;
              const next = node.tabs[nextIndex];
              onChange(selectTab(value, node.id, next.id), 'select');
              event.currentTarget.ownerDocument.getElementById(tabId(next.id))?.focus();
            }}
            onDragStart={(event) => {
              if (readOnly) {
                event.preventDefault();
                return;
              }
              dragged.current = panel.id;
              event.dataTransfer.setData('text/plain', panel.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              dragged.current = null;
            }}
            onDrop={(event) => drop(event, index)}
          >
            {panel.title}
          </button>
        ))}
        {node.tabs.length === 0 && <span className="lp-dock__empty">Drop a tab here</span>}
      </div>
      {!readOnly && (
        <div className="lp-dock__controls" role="group" aria-label={`Panel actions in ${node.id}`}>
          <button
            type="button"
            disabled={!active || activeIndex === 0}
            onClick={() =>
              active && onChange(movePanel(value, active.id, node.id, activeIndex - 1), 'move')
            }
          >
            Earlier
          </button>
          <button
            type="button"
            disabled={!active || activeIndex === node.tabs.length - 1}
            onClick={() =>
              active && onChange(movePanel(value, active.id, node.id, activeIndex + 1), 'move')
            }
          >
            Later
          </button>
          <select
            aria-label={`Target group for ${node.id}`}
            value={targetId}
            onChange={(event) => setTarget(event.target.value)}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!active || targetId === node.id}
            onClick={() => active && onChange(movePanel(value, active.id, targetId), 'move')}
          >
            Move
          </button>
          {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
            <button key={side} type="button" disabled={!active} onClick={() => dock(side)}>
              Dock {side}
            </button>
          ))}
          <button
            type="button"
            disabled={!active}
            onClick={() => active && onChange(closePanel(value, active.id), 'close')}
          >
            Close
          </button>
        </div>
      )}
      <div className="lp-dock__content" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {node.tabs.map((panel) => (
          <div
            key={panel.id}
            id={panelId(panel.id)}
            role="tabpanel"
            aria-labelledby={tabId(panel.id)}
            hidden={panel.id !== node.activeId}
            tabIndex={0}
          >
            {keepAlive || panel.id === node.activeId ? renderPanel(panel) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Dock({ label = 'Dock layout', className = '', style, ...props }: DockProps) {
  validateLayout(props.value);
  const prefix = useId();
  const dragged = useRef<string | null>(null);
  useEffect(
    () => () => {
      dragged.current = null;
    },
    [],
  );
  return (
    <div
      role="group"
      aria-label={label}
      className={`lp-dock ${className}`}
      style={{ height: 400, minWidth: 0, ...style }}
    >
      <DockBranch
        {...props}
        node={props.value.root}
        groups={getGroups(props.value)}
        prefix={prefix}
        dragged={dragged}
      />
    </div>
  );
}
