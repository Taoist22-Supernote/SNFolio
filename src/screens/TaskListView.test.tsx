import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity, View } from 'react-native';
import { TaskListView } from './TaskListView';
import { HandwritingTextInput } from './HandwritingTextInput';
import { CalendarTask } from '../domain/types';

const textOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join('')).join('|');

/**
 * Presses the innermost control carrying this label.
 *
 * The chooser's dismiss overlay wraps the sheet, so it matches every label
 * inside it; taking the first match would press the overlay and close the
 * sheet instead of choosing anything.
 */
const press = (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const matches = tree.root.findAllByType(TouchableOpacity)
    .filter(node => node.findAllByType(Text).some(text => [text.props.children].flat(Infinity).join('').includes(label)));
  const target = matches
    .slice()
    .sort((a, b) => a.findAllByType(TouchableOpacity).length - b.findAllByType(TouchableOpacity).length)[0];
  if (!target) throw new Error(`No button labelled ${label}`);
  act(() => target.props.onPress());
};

const hasButton = (tree: TestRenderer.ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TouchableOpacity)
    .some(node => node.findAllByType(Text).some(text => [text.props.children].flat(Infinity).join('').includes(label)));

function render(tasks: CalendarTask[], overrides: Partial<React.ComponentProps<typeof TaskListView>> = {}) {
  const props: React.ComponentProps<typeof TaskListView> = {
    tasks,
    areas: [],
    areaOf: () => undefined,
    projects: [],
    projectOf: () => undefined,
    onToggle: jest.fn(),
    onEdit: jest.fn(),
    notePathFor: () => undefined,
    onNoteAction: jest.fn(),
    onPostpone: jest.fn(),
    onPickPostponeDate: jest.fn(),
    onAddSubtask: jest.fn(),
    onReorderSubtask: jest.fn(),
    ...overrides,
  };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<TaskListView {...props} />); });
  return { tree, props };
}

const dated = (over: Partial<CalendarTask> = {}): CalendarTask => ({
  uid: 'task-1',
  title: 'Submit the draft',
  completed: false,
  createdAt: new Date(),
  // Due today, whenever the suite runs: the wording for a task due today is
  // "Tomorrow" and "Next week", which is what these tests read.
  dueDate: new Date(),
  ...over,
});

describe('postponing from a task row', () => {
  test('a dated, open task offers the control on its own row', () => {
    const { tree } = render([dated()]);
    expect(hasButton(tree, 'Later')).toBe(true);
    act(() => tree.unmount());
  });

  test('an undated task does not, since there is no deadline to move', () => {
    const { tree } = render([dated({ dueDate: undefined })]);
    expect(hasButton(tree, 'Later')).toBe(false);
    act(() => tree.unmount());
  });

  test('the chooser names the task and where each option lands', () => {
    const { tree } = render([dated()]);
    press(tree, 'Later');

    const shown = textOf(tree);
    expect(shown).toContain('Submit the draft');
    expect(shown).toContain('Tomorrow');
    expect(shown).toContain('Next week');
    expect(shown).toContain('Pick a date...');
    act(() => tree.unmount());
  });

  test('choosing an option reports the task and the date it lands on', () => {
    const { tree, props } = render([dated()]);
    press(tree, 'Later');
    press(tree, 'Next week');

    expect(props.onPostpone).toHaveBeenCalledTimes(1);
    const [task, to] = (props.onPostpone as jest.Mock).mock.calls[0];
    expect(task.uid).toBe('task-1');
    const expected = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(to.getDate()).toBe(expected.getDate());
    expect(to.getMonth()).toBe(expected.getMonth());
    act(() => tree.unmount());
  });

  test('picking a date hands the task to the app picker instead', () => {
    const { tree, props } = render([dated()]);
    press(tree, 'Later');
    press(tree, 'Pick a date...');

    expect(props.onPickPostponeDate).toHaveBeenCalledTimes(1);
    expect(props.onPostpone).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  test('without a postpone handler the control is absent rather than inert', () => {
    const { tree } = render([dated()], { onPostpone: undefined });
    expect(hasButton(tree, 'Later')).toBe(false);
    act(() => tree.unmount());
  });
});

test('a task due later moves by an interval, which the chooser says plainly', () => {
  const { tree } = render([dated({ dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })]);
  press(tree, 'Later');

  const shown = textOf(tree);
  // Not "Tomorrow": that would imply the deadline comes closer.
  expect(shown).toContain('+1 day');
  expect(shown).toContain('+1 week');
  expect(shown).not.toContain('Tomorrow');
  act(() => tree.unmount());
});

describe('subtasks on screen', () => {
  const parent = dated({ uid: 'p', title: 'Write the paper' });
  const child = dated({ uid: 'c', title: 'Draft the appendix', parentId: 'p' });

  /** Flattened style of a node, however many arrays deep it is nested. */
  const styleOf = (node: TestRenderer.ReactTestInstance): Record<string, unknown> =>
    Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));

  const indentedRows = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root.findAllByType(View).filter(node => styleOf(node).paddingLeft === 26);

  test('subtasks start hidden behind their parent\'s count', () => {
    const { tree } = render([parent, child]);

    expect(textOf(tree)).toContain('0/1');
    expect(textOf(tree)).not.toContain('Draft the appendix');
    expect(indentedRows(tree)).toHaveLength(0);
    act(() => tree.unmount());
  });

  test('tapping the count reveals them, indented and under the parent', () => {
    const { tree } = render([parent, child]);
    press(tree, '0/1');

    expect(indentedRows(tree)).toHaveLength(1);
    const shown = textOf(tree);
    expect(shown.indexOf('Write the paper')).toBeLessThan(shown.indexOf('Draft the appendix'));
    act(() => tree.unmount());
  });

  test('tapping it again puts them away', () => {
    const { tree } = render([parent, child]);
    press(tree, '0/1');
    press(tree, '0/1');

    expect(indentedRows(tree)).toHaveLength(0);
    act(() => tree.unmount());
  });

  test('an undated subtask appears under its dated parent, not in No date', () => {
    // The defect this replaced: grouping put a new subtask in its own
    // section, nowhere near the task it belongs to.
    const undated = dated({ uid: 'u', title: 'Find the citation', parentId: 'p', dueDate: undefined });
    const { tree } = render([parent, undated]);

    expect(textOf(tree)).not.toContain('No date');
    press(tree, '0/1');
    expect(indentedRows(tree)).toHaveLength(1);
    expect(textOf(tree)).toContain('Find the citation');
    act(() => tree.unmount());
  });

  test('an open subtask whose parent is filtered out keeps its own row', () => {
    // Parent done, child open, "Open" selected: the child must still be
    // reachable rather than hidden behind a row that is not on screen.
    const donePar = dated({ uid: 'p', title: 'Write the paper', completed: true, status: 'done' });
    const { tree } = render([donePar, child]);

    expect(textOf(tree)).toContain('Draft the appendix');
    act(() => tree.unmount());
  });

  test('a parent shows how many of its subtasks are done', () => {
    const done = dated({ uid: 'd', title: 'Collect sources', parentId: 'p', completed: true, status: 'done' });
    const { tree } = render([parent, child, done]);

    expect(textOf(tree)).toContain('1/2');
    act(() => tree.unmount());
  });

  test('only a top-level task offers to take a subtask', () => {
    const { tree } = render([parent, child]);
    const buttons = tree.root.findAllByType(TouchableOpacity)
      .filter(node => node.findAllByType(Text).some(t => [t.props.children].flat(Infinity).join('') === '＋ Sub'));

    // One button for the parent, none for the child: a subtask cannot have
    // subtasks of its own.
    expect(buttons).toHaveLength(1);
    act(() => tree.unmount());
  });

  test('a subtask is named before it is created', () => {
    const { tree, props } = render([parent]);
    press(tree, '＋ Sub');
    expect(textOf(tree)).toContain('Subtask of "Write the paper"');

    const input = tree.root.findAllByType(HandwritingTextInput)[0];
    act(() => input.props.onChangeText('Draft the appendix'));
    press(tree, 'Add it');

    expect(props.onAddSubtask).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'p' }),
      { title: 'Draft the appendix', dueDate: undefined, priority: undefined }
    );
    act(() => tree.unmount());
  });

  test('a subtask can be given its own date and priority before it exists', () => {
    const { tree, props } = render([parent]);
    press(tree, '＋ Sub');

    const input = tree.root.findAllByType(HandwritingTextInput)[0];
    act(() => input.props.onChangeText('Draft the appendix'));
    press(tree, 'High');
    press(tree, 'Add it');

    const [, draft] = (props.onAddSubtask as jest.Mock).mock.calls[0];
    expect(draft).toEqual({ title: 'Draft the appendix', dueDate: undefined, priority: 4 });
    act(() => tree.unmount());
  });

  test('a step with no date of its own says so rather than defaulting to one', () => {
    const { tree } = render([parent]);
    press(tree, '＋ Sub');

    expect(textOf(tree)).toContain('No date');
    act(() => tree.unmount());
  });

  test('an empty name adds nothing', () => {
    const { tree, props } = render([parent]);
    press(tree, '＋ Sub');
    press(tree, 'Add it');

    expect(props.onAddSubtask).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
})

describe('arranging subtasks on the Tasks tab', () => {
  const par = dated({ uid: 'p', title: 'Write the paper' });
  const first = dated({ uid: 'a', title: 'Step one', parentId: 'p', order: 0, dueDate: undefined });
  const second = dated({ uid: 'b', title: 'Step two', parentId: 'p', order: 1, dueDate: undefined });

  const arrow = (tree: TestRenderer.ReactTestRenderer, label: string) =>
    tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityLabel === label);

  test('no arrows until the subtasks are showing', () => {
    const { tree } = render([par, first, second]);
    expect(arrow(tree, 'Move Step one down')).toBeUndefined();
    act(() => tree.unmount());
  });

  test('the first step can only go down and the last only up', () => {
    const { tree } = render([par, first, second]);
    press(tree, '0/2');

    expect(arrow(tree, 'Move Step one up')).toBeUndefined();
    expect(arrow(tree, 'Move Step one down')).toBeDefined();
    expect(arrow(tree, 'Move Step two up')).toBeDefined();
    expect(arrow(tree, 'Move Step two down')).toBeUndefined();
    act(() => tree.unmount());
  });

  test('moving one reports the task and the direction', () => {
    const { tree, props } = render([par, first, second]);
    press(tree, '0/2');
    act(() => arrow(tree, 'Move Step one down')!.props.onPress());

    expect(props.onReorderSubtask).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'a' }),
      'down'
    );
    act(() => tree.unmount());
  });

  test('a lone subtask has nothing to arrange', () => {
    const { tree } = render([par, first]);
    press(tree, '0/1');

    expect(arrow(tree, 'Move Step one up')).toBeUndefined();
    expect(arrow(tree, 'Move Step one down')).toBeUndefined();
    act(() => tree.unmount());
  });

  test('a top-level task is not offered them', () => {
    const { tree } = render([par, first, second]);
    press(tree, '0/2');

    expect(arrow(tree, 'Move Write the paper up')).toBeUndefined();
    act(() => tree.unmount());
  });

  test('steps keep their arranged sequence even when priorities differ', () => {
    // compareTasks would hoist the high-priority step; a sequence must not
    // reshuffle itself.
    const urgent = dated({ uid: 'b', title: 'Step two', parentId: 'p', order: 1, priority: 4, dueDate: undefined });
    const { tree } = render([par, first, urgent]);
    press(tree, '0/2');

    const shown = textOf(tree);
    expect(shown.indexOf('Step one')).toBeLessThan(shown.indexOf('Step two'));
    act(() => tree.unmount());
  });
});
