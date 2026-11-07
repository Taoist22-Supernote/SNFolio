import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { ItemCreationModal } from './ItemCreationModal';
import { pickLinkedNote } from '../supernote/pickLinkedNote';
import { HandwritingTextInput } from './HandwritingTextInput';
jest.mock('../supernote/pickLinkedNote', () => ({ pickLinkedNote: jest.fn() }));

function button(tree: TestRenderer.ReactTestRenderer, label: string) {
  return tree.root.findAllByType(TouchableOpacity).reverse().find(node => node.findAllByType(Text).some(text => [text.props.children].flat().join('') === label))!;
}
test.each([
  ['task', '/Note/Existing.note'], ['event', '/Note/Existing.note'],
  ['task', '/Document/Reference.pdf'], ['event', '/Document/Reference.pdf'],
] as const)('new %s holds selected file %s until Save', async (type, path) => {
  (pickLinkedNote as jest.Mock).mockResolvedValue(path);
  const createTask = jest.fn(), createEvent = jest.fn(), close = jest.fn();
  let tree: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<ItemCreationModal visible type={type} targetDate={new Date(2026, 8, 12)} initialTitle="Linked item" availableFeeds={[]} onClose={close} onCreateTask={createTask} onCreateEvent={createEvent} />); });
  await act(async () => { await button(tree!, 'Link Note / PDF…').props.onPress(); });
  expect(createTask).not.toHaveBeenCalled(); expect(createEvent).not.toHaveBeenCalled();
  const save = tree!.root.findAllByType(TouchableOpacity).reverse().find(node => node.findAllByType(Text).some(text => [text.props.children].flat().join('').includes('💾 Save')));
  expect(save).toBeDefined();
  act(() => save!.props.onPress());
  if (type === 'task') expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ linkedNotePath: path }));
  else expect(createEvent.mock.calls[0][5]).toBe(path);
  act(() => tree!.unmount());
});

test.each(['task', 'event'] as const)('saving a new %s records it before the form closes', type => {
  // onClose can dismiss the form (and the panel), so the item must already be stored by then.
  const order: string[] = [];
  const createTask = jest.fn(() => order.push('create')), createEvent = jest.fn(() => order.push('create')), close = jest.fn(() => order.push('close'));
  let tree: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<ItemCreationModal visible type={type} targetDate={new Date(2026, 8, 12)} initialTitle="Quick item" availableFeeds={[]} onClose={close} onCreateTask={createTask} onCreateEvent={createEvent} />); });
  const save = tree!.root.findAllByType(TouchableOpacity).reverse().find(node => node.findAllByType(Text).some(text => [text.props.children].flat().join('').includes('💾 Save')));
  act(() => save!.props.onPress());
  expect(order).toEqual(['create', 'close']);
  act(() => tree!.unmount());
});

test('canceling a new item discards the pending note link', async () => {
  (pickLinkedNote as jest.Mock).mockResolvedValue('/Note/Existing.note');
  const createTask = jest.fn(), createEvent = jest.fn(), close = jest.fn();
  const date = new Date(2026, 8, 12);
  const render = (visible: boolean) => <ItemCreationModal visible={visible} type="task" targetDate={date} initialTitle="Draft" availableFeeds={[]} onClose={close} onCreateTask={createTask} onCreateEvent={createEvent} />;
  let tree: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(render(true)); });
  await act(async () => { await button(tree!, 'Link Note / PDF…').props.onPress(); });
  act(() => tree!.update(render(false)));
  act(() => tree!.update(render(true)));
  expect(button(tree!, 'Link Note / PDF…')).toBeDefined();
  expect(createTask).not.toHaveBeenCalled();
  expect(createEvent).not.toHaveBeenCalled();
  act(() => tree!.unmount());
});

test.each(['none', 'class', 'meeting'] as const)('event saves explicit %s calendar designation', async designation => {
  const create = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<ItemCreationModal visible type="event" targetDate={new Date(2026, 8, 20)} initialTitle="Designated event" availableFeeds={[]} onClose={() => {}} onCreateTask={() => {}} onCreateEvent={create} />); });
  const label = designation === 'none' ? 'None' : designation === 'class' ? 'Class (C)' : 'Meeting (M)';
  act(() => button(tree, label).props.onPress());
  const save = tree.root.findAllByType(TouchableOpacity).reverse().find(node => node.findAllByType(Text).some(text => [text.props.children].flat().join('').includes('💾 Save')))!;
  act(() => save.props.onPress());
  expect(create.mock.calls[0][6]).toBe(designation);
  act(() => tree.unmount());
});

describe('subtasks on the task form', () => {
  const parentTask = {
    uid: 'p', title: 'Write the paper', completed: false, createdAt: new Date(2026, 10, 1),
    dueDate: new Date(2026, 10, 6),
  } as const;
  const sub = (uid: string, over: Record<string, unknown> = {}) => ({
    uid, title: `Step ${uid}`, completed: false, createdAt: new Date(2026, 10, 1), parentId: 'p', ...over,
  });

  const renderForm = (props: Record<string, unknown> = {}) => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ItemCreationModal
          visible
          type="task"
          targetDate={new Date(2026, 10, 6)}
          availableFeeds={[]}
          onClose={jest.fn()}
          onCreateEvent={jest.fn()}
          onCreateTask={jest.fn()}
          editingTask={parentTask as never}
          {...props}
        />
      );
    });
    return tree;
  };

  const textOf = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('')).join('|');

  test('the form lists the subtasks and how many are done', () => {
    const tree = renderForm({
      subtasks: [sub('a'), sub('b', { completed: true, status: 'done' })],
      onToggleSubtask: jest.fn(),
    });

    const shown = textOf(tree);
    expect(shown).toContain('Subtasks (1/2)');
    expect(shown).toContain('Step a');
    expect(shown).toContain('Step b');
    act(() => tree.unmount());
  });

  test('it says what finishing this task will do to them', () => {
    // The cascade is the reason subtasks belong on this form at all.
    const tree = renderForm({ subtasks: [sub('a')], onToggleSubtask: jest.fn() });

    expect(textOf(tree)).toContain('Completing this task completes its subtasks; reopening it reopens them.');
    act(() => tree.unmount());
  });

  test('a subtask can be ticked off from here', () => {
    const onToggleSubtask = jest.fn();
    const tree = renderForm({ subtasks: [sub('a')], onToggleSubtask });

    const check = tree.root.findAllByType(TouchableOpacity)
      .find(node => node.props.accessibilityLabel === 'Complete Step a');
    expect(check).toBeDefined();
    act(() => check!.props.onPress());

    expect(onToggleSubtask).toHaveBeenCalledWith(expect.objectContaining({ uid: 'a' }));
    act(() => tree.unmount());
  });

  test('another subtask can be added without leaving the form', () => {
    const onAddSubtaskHere = jest.fn();
    const tree = renderForm({ subtasks: [], onAddSubtaskHere });

    const add = button(tree, '＋ Add subtask');
    expect(add).toBeDefined();
    act(() => tree.root.findAllByType(HandwritingTextInput).slice(-1)[0].props.onChangeText('Find the citation'));
    act(() => add!.props.onPress());

    expect(onAddSubtaskHere).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'p' }),
      'Find the citation'
    );
    act(() => tree.unmount());
  });

  test('a subtask that cannot take subtasks is not offered the field', () => {
    // onAddSubtaskHere is withheld for a task that is itself a subtask.
    const tree = renderForm({ subtasks: [], onAddSubtaskHere: undefined });

    expect(textOf(tree)).not.toContain('Add a subtask');
    act(() => tree.unmount());
  });

  test('a brand new task shows no subtask panel at all', () => {
    const tree = renderForm({ editingTask: null, subtasks: [sub('a')], onAddSubtaskHere: jest.fn() });

    expect(textOf(tree)).not.toContain('Subtasks');
    expect(textOf(tree)).not.toContain('Add a subtask');
    act(() => tree.unmount());
  });
});
