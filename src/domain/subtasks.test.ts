import {
  canHaveChildren,
  childrenOf,
  completionCascade,
  displayParentId,
  hasChildren,
  indexByUid,
  expandRows,
  parentReopenedForNewChild,
  suppressedChildUids,
  withoutNestedChildren,
  rootParentId,
  subtaskProgress,
} from './subtasks';
import { CalendarTask } from './types';

const task = (uid: string, over: Partial<CalendarTask> = {}): CalendarTask => ({
  uid,
  title: uid,
  completed: false,
  createdAt: new Date('2026-11-01T09:00:00'),
  ...over,
});

const parent = task('p');
const childA = task('a', { parentId: 'p' });
const childB = task('b', { parentId: 'p', completed: true, status: 'done' });
const loner = task('x');

describe('which relationships are real', () => {
  test('a child is shown under its parent', () => {
    const byUid = indexByUid([parent, childA]);
    expect(displayParentId(childA, byUid)).toBe('p');
    expect(displayParentId(parent, byUid)).toBeUndefined();
  });

  test('a child whose parent is not in the list stands on its own', () => {
    // A filtered list may exclude the parent. Dropping the child would hide
    // real work inside a parent that is not on screen.
    const byUid = indexByUid([childA]);
    expect(displayParentId(childA, byUid)).toBeUndefined();
  });

  test('a cycle resolves to no parent rather than looping', () => {
    const one = task('one', { parentId: 'two' });
    const two = task('two', { parentId: 'one' });
    const byUid = indexByUid([one, two]);

    expect(rootParentId(one, byUid)).toBeUndefined();
    expect(displayParentId(one, byUid)).toBeUndefined();
    expect(displayParentId(two, byUid)).toBeUndefined();
  });

  test('a task naming itself as parent is not nested inside itself', () => {
    const self = task('self', { parentId: 'self' });
    const byUid = indexByUid([self]);
    expect(displayParentId(self, byUid)).toBeUndefined();
  });

  test('a deeper chain from a server flattens to its top-most ancestor', () => {
    // Only one level is rendered, so a grandchild sits beside its parent
    // under the same root rather than being half-nested or dropped.
    const grandchild = task('g', { parentId: 'a' });
    const byUid = indexByUid([parent, childA, grandchild]);

    expect(rootParentId(grandchild, byUid)).toBe('p');
    expect(displayParentId(grandchild, byUid)).toBe('p');
  });

  test('only a top-level task may be given subtasks', () => {
    const byUid = indexByUid([parent, childA]);
    expect(canHaveChildren(parent, byUid)).toBe(true);
    expect(canHaveChildren(childA, byUid)).toBe(false);
  });
});

describe('children and progress', () => {
  test('childrenOf returns the subtasks in list order', () => {
    expect(childrenOf([parent, childA, childB, loner], 'p').map(t => t.uid)).toEqual(['a', 'b']);
    expect(hasChildren([parent, childA], 'p')).toBe(true);
    expect(hasChildren([parent, loner], 'p')).toBe(false);
  });

  test('a parent reports how many of its subtasks are done', () => {
    expect(subtaskProgress([parent, childA, childB], 'p')).toEqual({ done: 1, total: 2, label: '1/2' });
  });

  test('a task with no subtasks reports nothing rather than 0/0', () => {
    expect(subtaskProgress([parent, loner], 'x')).toBeUndefined();
  });
});

describe('completing a parent', () => {
  test('it finishes the open subtasks under it', () => {
    const written = completionCascade([parent, childA, childB], parent, true);

    expect(written.map(t => t.uid)).toEqual(['p', 'a']);
    expect(written.every(t => t.completed)).toBe(true);
  });

  test('a subtask already done is left alone, keeping its completion time', () => {
    const finishedAt = new Date('2026-11-02T08:00:00');
    const already = task('b', { parentId: 'p', completed: true, status: 'done', completedAt: finishedAt });
    const written = completionCascade([parent, already], parent, true);

    expect(written.map(t => t.uid)).toEqual(['p']);
    expect(already.completedAt).toEqual(finishedAt);
  });

  test('reopening a parent reopens its subtasks, as iCloud does', () => {
    // Apple's documentation: unchecking a parent unchecks its subtasks.
    // Diverging would leave SNFolio and Reminders disagreeing after a sync.
    const done = task('p', { completed: true, status: 'done' });
    const written = completionCascade([done, childB], done, false);

    expect(written.map(t => t.uid)).toEqual(['p', 'b']);
    expect(written.every(t => t.completed)).toBe(false);
  });

  test('a subtask already in the target state is left alone either way', () => {
    const open = task('a', { parentId: 'p' });
    expect(completionCascade([parent, open], parent, false).map(t => t.uid)).toEqual(['p']);
  });

  test('adding a subtask to a finished parent reopens it', () => {
    const done = task('p', { completed: true, status: 'done' });
    expect(parentReopenedForNewChild(done)?.completed).toBe(false);
    expect(parentReopenedForNewChild(parent)).toBeUndefined();
  });
});

describe('rows for grouping', () => {
  const all = [parent, childA, childB, loner];

  test('a nested child does not form its own row before grouping', () => {
    // Its own date would otherwise put it in a different group from its
    // parent, which is what made subtasks look like unrelated tasks.
    expect(withoutNestedChildren(all, all).map(t => t.uid)).toEqual(['p', 'x']);
  });

  test('a child keeps its row when its parent is filtered out', () => {
    // Open subtask, completed parent, "Open" selected: the child must not
    // vanish behind a row that is not on screen.
    const visible = [childA, loner];
    expect(withoutNestedChildren(all, visible).map(t => t.uid)).toEqual(['a', 'x']);
  });

  test('an unrelated list passes through untouched', () => {
    expect(withoutNestedChildren([loner], [loner]).map(t => t.uid)).toEqual(['x']);
  });
});

describe('expandRows', () => {
  const all = [parent, childA, childB, loner];

  test('a collapsed parent shows no subtasks', () => {
    const rows = expandRows(all, [parent, loner], new Set());
    expect(rows.map(r => [r.task.uid, r.depth])).toEqual([['p', 0], ['x', 0]]);
  });

  test('an expanded parent is followed by its subtasks', () => {
    const rows = expandRows(all, [parent, loner], new Set(['p']));
    expect(rows.map(r => [r.task.uid, r.depth])).toEqual([
      ['p', 0], ['a', 1], ['b', 1], ['x', 0],
    ]);
  });

  test('expanding shows finished subtasks too, so the counter is not contradicted', () => {
    // childB is done; the parent reads 1/2, so both must appear.
    const rows = expandRows(all, [parent], new Set(['p']));
    expect(rows.filter(r => r.depth === 1).map(r => r.task.uid)).toEqual(['a', 'b']);
  });

  test('expanding a task with no subtasks adds nothing', () => {
    const rows = expandRows(all, [loner], new Set(['x']));
    expect(rows.map(r => r.task.uid)).toEqual(['x']);
  });
});

describe('several sections at once', () => {
  const all = [parent, childA, childB, loner];

  test('a child is suppressed when its parent is on screen in another section', () => {
    // Day View lists five sections. A parent due today with an undated
    // subtask spans two of them; deciding per section would give the subtask
    // its own row under "No Date" as well as one under its parent.
    const dueToday = [parent];
    const noDate = [childA];
    const suppressed = suppressedChildUids(all, [...dueToday, ...noDate]);

    expect(suppressed.has('a')).toBe(true);
    expect(suppressed.has('p')).toBe(false);
  });

  test('a child is not suppressed when its parent is nowhere on screen', () => {
    const suppressed = suppressedChildUids(all, [childA, loner]);
    expect(suppressed.size).toBe(0);
  });
});
