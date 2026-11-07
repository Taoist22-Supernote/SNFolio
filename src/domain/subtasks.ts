import { CalendarTask } from './types';
import { compareTasks, isDone, withStatus } from './taskModel';

/**
 * Tasks hanging off other tasks.
 *
 * `parentId` has been on CalendarTask since before there was any UI for it,
 * and it maps to the VTODO's RELATED-TO, so this layer is about which
 * relationships are real rather than about storing them.
 *
 * One level deep. A subtask cannot itself have subtasks: the device has no
 * room to indent twice legibly, and a tree invites exactly the ambiguity
 * about roll-up and placement that a flat parent/child pair avoids. Deeper
 * chains can still arrive from a server, so they are flattened to their
 * top-most ancestor rather than rejected or rendered half-nested.
 */

/** Guard against a server that describes a cycle; also bounds the flatten. */
const MAX_ANCESTRY = 25;

/**
 * The top-most ancestor of a task, or the task itself.
 *
 * A chain deeper than one level — or a cycle — resolves to the outermost task
 * that is not itself a child, so every row has exactly one place to sit.
 */
export function rootParentId(task: CalendarTask, byUid: Map<string, CalendarTask>): string | undefined {
  let current = task.parentId;
  const seen = new Set<string>([task.uid]);
  let depth = 0;

  while (current && depth < MAX_ANCESTRY) {
    if (seen.has(current)) return undefined; // a cycle has no root
    const parent = byUid.get(current);
    if (!parent) return current; // parent not synced here; still its child
    if (!parent.parentId) return parent.uid;
    seen.add(current);
    current = parent.parentId;
    depth += 1;
  }
  return current;
}

export function indexByUid(tasks: CalendarTask[]): Map<string, CalendarTask> {
  return new Map(tasks.map(task => [task.uid, task]));
}

/**
 * The parent a task is displayed under, if any.
 *
 * Undefined when the task stands alone, when its parent is missing from this
 * list, or when the ancestry is circular — in each case it is shown as a
 * top-level row rather than vanishing into a parent that is not there.
 */
export function displayParentId(
  task: CalendarTask,
  byUid: Map<string, CalendarTask>
): string | undefined {
  if (!task.parentId) return undefined;
  const root = rootParentId(task, byUid);
  if (!root || root === task.uid) return undefined;
  return byUid.has(root) ? root : undefined;
}

/** The subtasks of one task, in their manual order. */
export function childrenOf(tasks: CalendarTask[], parentUid: string): CalendarTask[] {
  const byUid = indexByUid(tasks);
  return sortSubtasks(tasks.filter(task => displayParentId(task, byUid) === parentUid));
}

/**
 * Subtasks in sequence.
 *
 * `order` wins here, unlike everywhere else: compareTasks puts priority and
 * due date first, which is right for a list of independent tasks and wrong
 * for the steps of one. A sequence that silently reshuffles itself by
 * priority cannot be arranged at all.
 *
 * A subtask with no order of its own sorts after the arranged ones rather
 * than at the front, and the first move gives every one an explicit position.
 */
export function sortSubtasks(children: CalendarTask[]): CalendarTask[] {
  return [...children].sort((a, b) => {
    const left = a.order ?? Number.POSITIVE_INFINITY;
    const right = b.order ?? Number.POSITIVE_INFINITY;
    if (left !== right) return left - right;
    return compareTasks(a, b);
  });
}

export type MoveDirection = 'up' | 'down';

/** Whether a subtask can move that way, for disabling the control at the ends. */
export function canMoveSubtask(
  tasks: CalendarTask[],
  parentUid: string,
  uid: string,
  direction: MoveDirection
): boolean {
  const children = childrenOf(tasks, parentUid);
  const index = children.findIndex(child => child.uid === uid);
  if (index === -1) return false;
  return direction === 'up' ? index > 0 : index < children.length - 1;
}

/**
 * The subtasks to write to move one up or down, or nothing if it cannot move.
 *
 * Every position is renumbered from zero, so a list that was partly unordered
 * becomes a definite sequence after one move rather than carrying gaps and
 * undefined values that the next move would have to guess about. Only the
 * rows whose position actually changed are returned.
 *
 * Order is not sent to the server: a VTODO has no standard property for it,
 * so inventing one would mean writing a field no other client reads.
 */
export function reorderSubtasks(
  tasks: CalendarTask[],
  parentUid: string,
  uid: string,
  direction: MoveDirection
): CalendarTask[] {
  const children = childrenOf(tasks, parentUid);
  const index = children.findIndex(child => child.uid === uid);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= children.length) return [];

  const moved = [...children];
  moved[index] = children[target];
  moved[target] = children[index];

  return moved
    .map((task, position) => ({ ...task, order: position }))
    .filter(task => children.find(child => child.uid === task.uid)?.order !== task.order);
}

/** True when this task has subtasks within the given list. */
export function hasChildren(tasks: CalendarTask[], parentUid: string): boolean {
  return childrenOf(tasks, parentUid).length > 0;
}

/** Whether a task may be given subtasks: only one level is supported. */
export function canHaveChildren(task: CalendarTask, byUid: Map<string, CalendarTask>): boolean {
  return displayParentId(task, byUid) === undefined;
}

export interface SubtaskProgress {
  done: number;
  total: number;
  label: string;
}

/** How far through its subtasks a parent is, for the row to show. */
export function subtaskProgress(tasks: CalendarTask[], parentUid: string): SubtaskProgress | undefined {
  const children = childrenOf(tasks, parentUid);
  if (children.length === 0) return undefined;
  const done = children.filter(isDone).length;
  return { done, total: children.length, label: `${done}/${children.length}` };
}

/**
 * Everything to write when a parent is ticked off, or un-ticked.
 *
 * Both directions, because iCloud does both: Apple's Reminders documentation
 * states that completing a parent completes its subtasks and that unchecking
 * one unchecks them again. These tasks round-trip through that service, so a
 * one-way cascade here would leave the two disagreeing about the same task
 * after every sync — a worse outcome than either rule on its own.
 *
 * Only children whose state actually differs are written, so a subtask
 * already in the target state keeps its original completion time.
 */
export function completionCascade(
  tasks: CalendarTask[],
  parent: CalendarTask,
  done: boolean
): CalendarTask[] {
  const next = withStatus(parent, done ? 'done' : 'todo');
  const children = childrenOf(tasks, parent.uid).filter(child => isDone(child) !== done);
  return [next, ...children.map(child => withStatus(child, done ? 'done' : 'todo'))];
}

/**
 * The parent to reopen when a subtask is added to a finished one, if any.
 *
 * Hanging new work off a completed task means it is not finished after all.
 * Leaving it done would recreate exactly the state the cascade exists to
 * prevent: an open subtask under a closed parent.
 */
export function parentReopenedForNewChild(parent: CalendarTask): CalendarTask | undefined {
  return isDone(parent) ? withStatus(parent, 'todo') : undefined;
}

export interface NestedRow {
  task: CalendarTask;
  depth: 0 | 1;
}

/**
 * The rows to group: the visible list with nested children taken out.
 *
 * A subtask follows its parent rather than its own date, so it must not form
 * a row of its own before grouping — otherwise a new, undated subtask lands
 * under "No date" while its parent sits under Today, which is exactly the
 * split that made subtasks look like unrelated tasks.
 *
 * Computed against the whole visible list rather than one group, because the
 * parent and child are usually in different groups; that is the point.
 *
 * A child whose parent is NOT visible — filtered out, done while the child is
 * open, in another project — keeps its own row, so no open work disappears
 * behind a parent that is not on screen.
 */
export function withoutNestedChildren(
  all: CalendarTask[],
  visible: CalendarTask[]
): CalendarTask[] {
  const suppressed = suppressedChildUids(all, visible);
  return visible.filter(task => !suppressed.has(task.uid));
}

/**
 * Which visible tasks are already accounted for by a visible parent.
 *
 * Separated from the filter above because a screen may list its tasks in
 * several sections at once — Day View has five — and whether a child gets its
 * own row depends on its parent being on screen *anywhere*, not in the same
 * section. A parent due today with an undated subtask spans two sections, and
 * deciding per section would give that subtask a second row under "No Date".
 */
export function suppressedChildUids(
  all: CalendarTask[],
  visible: CalendarTask[]
): Set<string> {
  const byUid = indexByUid(all);
  const visibleUids = new Set(visible.map(task => task.uid));
  const suppressed = new Set<string>();
  for (const task of visible) {
    const parent = displayParentId(task, byUid);
    if (parent && visibleUids.has(parent)) suppressed.add(task.uid);
  }
  return suppressed;
}

/**
 * Rows for one group: each task, followed by its subtasks when expanded.
 *
 * Expanding shows every subtask, including finished ones and ones the current
 * filter would hide. The parent's counter reads 1/2, so revealing one of the
 * two would contradict it.
 */
export function expandRows(
  all: CalendarTask[],
  rows: CalendarTask[],
  expanded: ReadonlySet<string>
): NestedRow[] {
  const out: NestedRow[] = [];
  for (const task of rows) {
    out.push({ task, depth: 0 });
    if (!expanded.has(task.uid)) continue;
    for (const child of childrenOf(all, task.uid)) out.push({ task: child, depth: 1 });
  }
  return out;
}
