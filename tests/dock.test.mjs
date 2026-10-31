import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  closePanel,
  dockPanel,
  getGroups,
  movePanel,
  nextNodeId,
  parseLayout,
  selectTab,
  serializeLayout,
  setSplitRatio,
  validateLayout,
} from '../dist/index.js';

const initial = () => ({
  version: 1,
  root: {
    type: 'split',
    id: 'split',
    direction: 'horizontal',
    ratio: 0.5,
    first: {
      type: 'tabs',
      id: 'left',
      tabs: [
        { id: 'a', title: 'Alpha' },
        { id: 'b', title: 'Beta' },
      ],
      activeId: 'a',
    },
    second: { type: 'tabs', id: 'right', tabs: [{ id: 'c', title: 'Gamma' }], activeId: 'c' },
  },
});

test('immutable selection, same-group reorder, cross-group move, docking and close', () => {
  const original = initial();
  const selected = selectTab(original, 'left', 'b');
  assert.equal(selected.root.first.activeId, 'b');
  assert.equal(original.root.first.activeId, 'a');
  const reordered = movePanel(original, 'a', 'left', 1);
  assert.deepEqual(
    reordered.root.first.tabs.map((tab) => tab.id),
    ['b', 'a'],
  );
  const moved = movePanel(original, 'a', 'right');
  assert.equal(moved.root.first.activeId, 'b');
  assert.equal(moved.root.second.activeId, 'a');
  const docked = dockPanel(moved, 'a', 'right', 'bottom', 'new', 'new-split');
  validateLayout(docked);
  assert.equal(docked.root.second.direction, 'vertical');
  assert.equal(getGroups(docked).length, 3);
  const closed = closePanel(closePanel(original, 'a'), 'b');
  assert.equal(closed.root.first.activeId, null);
  assert.equal(closed.root.first.tabs.length, 0);
  assert.equal(setSplitRatio(original, 'split', 10).root.ratio, 0.9);
  assert.equal(nextNodeId(original, 'split'), 'split-1');
  assert.deepEqual(parseLayout(serializeLayout(original)), original);
  assert.equal(
    createRequire(import.meta.url)('../dist/cjs/index.js').getGroups(original).length,
    2,
  );
});

test('invalid models, duplicate IDs, cycles, bad selection and JSON are rejected', () => {
  assert.throws(() => parseLayout('{'), /JSON/);
  assert.throws(() => parseLayout('{"version":2}'), /version/);
  const duplicate = initial();
  duplicate.root.second.id = 'a';
  assert.throws(() => validateLayout(duplicate), /unique/);
  const bad = initial();
  bad.root.first.activeId = 'missing';
  assert.throws(() => validateLayout(bad), /activeId/);
  const cycle = initial();
  cycle.root.first = cycle.root;
  assert.throws(() => validateLayout(cycle), /cycle/);
  assert.throws(() => dockPanel(initial(), 'a', 'right', 'left', 'left', 'new'), /unique/);
  assert.throws(() => movePanel(initial(), 'a', 'missing'), /Unknown/);
  assert.throws(() => setSplitRatio(initial(), 'split', NaN), /finite/);
});

test('React tab selection, reorder, move, docking, pointer and keyboard split resize', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  for (const name of ['window', 'document', 'HTMLElement', 'MouseEvent', 'KeyboardEvent', 'Event'])
    globalThis[name] = dom.window[name];
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createElement, useState, useEffect, act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Dock } = await import('../dist/index.js');
  let latest;
  let mounts = 0;
  let unmounts = 0;
  const actions = [];
  function Content({ panel }) {
    useEffect(() => {
      mounts++;
      return () => {
        unmounts++;
      };
    }, []);
    return createElement('p', null, `Content ${panel.title}`);
  }
  function App() {
    const [value, setValue] = useState(initial);
    latest = value;
    return createElement(Dock, {
      value,
      onChange: (next, action) => {
        setValue(next);
        actions.push(action);
      },
      renderPanel: (panel) => createElement(Content, { panel }),
    });
  }
  const root = createRoot(document.getElementById('root'));
  await act(() => root.render(createElement(App)));
  const click = async (element) => {
    assert.ok(element);
    await act(() => element.click());
  };
  const group = (id) => document.querySelector(`[aria-label="Tab group ${id}"]`);
  const button = (parent, text) =>
    [...parent.querySelectorAll('button')].find((item) => item.textContent === text);
  await click(button(group('left'), 'Beta'));
  assert.equal(latest.root.first.activeId, 'b');
  assert.equal(unmounts, 1);
  await act(() =>
    button(group('left'), 'Beta').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    ),
  );
  assert.equal(latest.root.first.activeId, 'a');
  assert.equal(document.activeElement.textContent, 'Alpha');
  await act(() =>
    document.activeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
    ),
  );
  assert.equal(latest.root.first.activeId, 'b');
  await click(button(group('left'), 'Earlier'));
  assert.deepEqual(
    latest.root.first.tabs.map((tab) => tab.id),
    ['b', 'a'],
  );
  const select = group('left').querySelector('select');
  await act(() => {
    select.value = 'right';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click(button(group('left'), 'Move'));
  assert.equal(latest.root.second.activeId, 'b');
  const separator = document.querySelector('[role=separator]');
  await act(() =>
    separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
  );
  assert.equal(latest.root.ratio, 0.52);
  separator.parentElement.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 1000,
    height: 400,
  });
  const pointer = (type, x) =>
    new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10, button: 0 });
  await act(() => separator.dispatchEvent(pointer('pointerdown', 500)));
  await act(() => separator.dispatchEvent(pointer('pointermove', 700)));
  await act(() => separator.dispatchEvent(pointer('pointerup', 700)));
  assert.equal(latest.root.ratio, 0.7);
  await click(button(group('right'), 'Dock bottom'));
  assert.equal(getGroups(latest).length, 3);
  assert.ok(actions.includes('dock') && actions.includes('move') && actions.includes('resize'));
  const before = mounts;
  await act(() => root.unmount());
  assert.equal(unmounts, before);
  dom.window.close();
});

test('native drag/drop is instance-scoped; keepAlive retains inactive contents', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  for (const name of ['window', 'document', 'HTMLElement', 'Event'])
    globalThis[name] = dom.window[name];
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createElement, useState, useEffect, act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Dock } = await import('../dist/index.js');
  let layout;
  let readOnly = false;
  let unmounts = 0;
  function Content({ panel }) {
    useEffect(
      () => () => {
        unmounts++;
      },
      [],
    );
    return createElement('span', null, panel.title);
  }
  function App() {
    const [value, setValue] = useState(initial);
    layout = value;
    return createElement(Dock, {
      value,
      onChange: setValue,
      keepAlive: true,
      readOnly,
      renderPanel: (panel) => createElement(Content, { panel }),
    });
  }
  const root = createRoot(document.getElementById('root'));
  await act(() => root.render(createElement(App)));
  const tab = (title) =>
    [...document.querySelectorAll('[role=tab]')].find((item) => item.textContent === title);
  await act(() => tab('Beta').click());
  assert.equal(unmounts, 0);
  const destination = document.querySelector('[aria-label="Panels in right"]');
  await act(() =>
    destination.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })),
  );
  assert.equal(layout.root.second.tabs.length, 1);
  const drag = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(drag, 'dataTransfer', { value: { setData() {}, effectAllowed: '' } });
  await act(() => tab('Beta').dispatchEvent(drag));
  const over = new Event('dragover', { bubbles: true, cancelable: true });
  await act(() => destination.dispatchEvent(over));
  assert.equal(over.defaultPrevented, true);
  await act(() =>
    destination.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })),
  );
  assert.deepEqual(
    layout.root.second.tabs.map((panel) => panel.id),
    ['c', 'b'],
  );
  readOnly = true;
  await act(() => root.render(createElement(App)));
  assert.equal(document.querySelectorAll('.lp-dock__controls').length, 0);
  assert.equal(document.querySelector('[role=separator]').tabIndex, -1);
  await act(() => tab('Gamma').click());
  assert.equal(layout.root.second.activeId, 'c');
  await act(() => root.unmount());
  assert.ok(unmounts >= 3);
  dom.window.close();
});
