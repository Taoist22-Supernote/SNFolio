import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity, View } from 'react-native';
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

    const add = button(tree, '＋ Add');
    expect(add).toBeDefined();
    act(() => tree.root.findAllByType(HandwritingTextInput).slice(-1)[0].props.onChangeText('Find the citation'));
    act(() => add!.props.onPress());

    expect(onAddSubtaskHere).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'p' }),
      'Find the citation'
    );
    act(() => tree.unmount());
  });

  test('a task with a due date can be planned from steps', () => {
    const onPlanSteps = jest.fn();
    const tree = renderForm({ subtasks: [], onAddSubtaskHere: jest.fn(), onPlanSteps });
    act(() => button(tree, '📋 Plan from steps…').props.onPress());
    expect(onPlanSteps).toHaveBeenCalledWith(expect.objectContaining({ uid: 'p' }));
    act(() => tree.unmount());
  });

  test('without a due date it says what is needed instead', () => {
    const tree = renderForm({
      subtasks: [], onAddSubtaskHere: jest.fn(), onPlanSteps: jest.fn(),
      editingTask: { ...parentTask, dueDate: undefined },
    });
    expect(textOf(tree)).toContain('Save a due date to plan this task from steps.');
    expect(textOf(tree)).not.toContain('Plan from steps…');
    act(() => tree.unmount());
  });

  test('a subtask that cannot take subtasks is not offered the field', () => {
    // onAddSubtaskHere is withheld for a task that is itself a subtask.
    // Asserted on the control, not the placeholder: a placeholder is a prop
    // and would not show up in the rendered text either way.
    const tree = renderForm({ subtasks: [], onAddSubtaskHere: undefined });

    const add = tree.root.findAllByType(TouchableOpacity)
      .find(node => node.props.accessibilityLabel === 'Add this subtask');
    expect(add).toBeUndefined();
    expect(textOf(tree)).not.toContain('Subtasks');
    act(() => tree.unmount());
  });

  test('a brand new task shows no subtask panel at all', () => {
    const tree = renderForm({ editingTask: null, subtasks: [sub('a')], onAddSubtaskHere: jest.fn() });

    expect(textOf(tree)).not.toContain('Subtasks');
    expect(textOf(tree)).not.toContain('Add a subtask');
    act(() => tree.unmount());
  });
});

describe('arranging subtasks on the task form', () => {
  const parentTask = {
    uid: 'p', title: 'Write the paper', completed: false, createdAt: new Date(2026, 10, 1),
  } as const;
  const step = (uid: string, order: number) => ({
    uid, title: `Step ${uid}`, completed: false, createdAt: new Date(2026, 10, 1), parentId: 'p', order,
  });

  const renderForm = (props: Record<string, unknown>) => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ItemCreationModal
          visible type="task" targetDate={new Date(2026, 10, 6)} availableFeeds={[]}
          onClose={jest.fn()} onCreateEvent={jest.fn()} onCreateTask={jest.fn()}
          editingTask={parentTask as never}
          {...props}
        />
      );
    });
    return tree;
  };

  const arrow = (tree: TestRenderer.ReactTestRenderer, label: string) =>
    tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityLabel === label);

  test('the ends are not offered a direction they cannot go', () => {
    const tree = renderForm({
      subtasks: [step('a', 0), step('b', 1), step('c', 2)],
      onToggleSubtask: jest.fn(),
      onReorderSubtask: jest.fn(),
    });

    expect(arrow(tree, 'Move Step a up')).toBeUndefined();
    expect(arrow(tree, 'Move Step a down')).toBeDefined();
    expect(arrow(tree, 'Move Step b up')).toBeDefined();
    expect(arrow(tree, 'Move Step b down')).toBeDefined();
    expect(arrow(tree, 'Move Step c up')).toBeDefined();
    expect(arrow(tree, 'Move Step c down')).toBeUndefined();
    act(() => tree.unmount());
  });

  test('moving a step from the form reports it', () => {
    const onReorderSubtask = jest.fn();
    const tree = renderForm({
      subtasks: [step('a', 0), step('b', 1)],
      onToggleSubtask: jest.fn(),
      onReorderSubtask,
    });

    act(() => arrow(tree, 'Move Step b up')!.props.onPress());

    expect(onReorderSubtask).toHaveBeenCalledWith(expect.objectContaining({ uid: 'b' }), 'up');
    act(() => tree.unmount());
  });

  test('without a reorder handler no arrows are drawn', () => {
    const tree = renderForm({
      subtasks: [step('a', 0), step('b', 1)],
      onToggleSubtask: jest.fn(),
      onReorderSubtask: undefined,
    });

    expect(arrow(tree, 'Move Step a down')).toBeUndefined();
    act(() => tree.unmount());
  });
});

test('the subtask panel is not a child of the footer button row', () => {
  // It was, which laid Save, the subtask list, the add field and Delete out
  // side by side and squashed all four. A layout this wrong is invisible to
  // a text assertion, so the guard is on the parent.
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ItemCreationModal
        visible type="task" targetDate={new Date(2026, 10, 6)} availableFeeds={[]}
        onClose={jest.fn()} onCreateEvent={jest.fn()} onCreateTask={jest.fn()}
        editingTask={{
          uid: 'p', title: 'Write the paper', completed: false, createdAt: new Date(2026, 10, 1),
        } as never}
        subtasks={[{
          uid: 'a', title: 'Step one', completed: false, createdAt: new Date(2026, 10, 1), parentId: 'p',
        }] as never}
        onToggleSubtask={jest.fn()}
        onAddSubtaskHere={jest.fn()}
      />
    );
  });

  const flat = (node: TestRenderer.ReactTestInstance): Record<string, unknown> =>
    Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
  const textIn = (node: TestRenderer.ReactTestInstance) =>
    node.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('')).join('|');

  const footer = tree.root.findAllByType(View).find(node => {
    const style = flat(node);
    return style.flexDirection === 'row' && style.flexWrap === 'wrap'
      && textIn(node).includes('Save Task');
  });

  expect(footer).toBeDefined();
  expect(textIn(footer!)).not.toContain('Subtasks');
  expect(textIn(footer!)).not.toContain('Step one');
  act(() => tree.unmount());
});

test('linking, saving and deleting share one row', () => {
  // They were two rows, each using a third of the width it had.
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ItemCreationModal
        visible type="task" targetDate={new Date(2026, 10, 6)} availableFeeds={[]}
        onClose={jest.fn()} onCreateEvent={jest.fn()} onCreateTask={jest.fn()}
        editingTask={{
          uid: 'p', title: 'Write the paper', completed: false, createdAt: new Date(2026, 10, 1),
        } as never}
        onDeleteTask={jest.fn()}
        onTaskNoteAction={jest.fn()}
      />
    );
  });

  const flat = (node: TestRenderer.ReactTestInstance): Record<string, unknown> =>
    Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
  const textIn = (node: TestRenderer.ReactTestInstance) =>
    node.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('')).join('|');

  const rows = tree.root.findAllByType(View)
    .filter(node => flat(node).flexDirection === 'row' && flat(node).flexWrap === 'wrap');
  const actionRow = rows.find(node => textIn(node).includes('Save Task'));

  expect(actionRow).toBeDefined();
  const shown = textIn(actionRow!);
  expect(shown).toContain('Link Note / PDF…');
  expect(shown).toContain('Create Note');
  expect(shown).toContain('Save Task');
  expect(shown).toContain('Delete');
  act(() => tree.unmount());
});

describe('opening a subtask from its parent', () => {
  const parentTask = {
    uid: 'p', title: 'Write the paper', completed: false, createdAt: new Date(2026, 10, 1),
  } as const;
  const step = { uid: 'a', title: 'Step one', completed: false, createdAt: new Date(2026, 10, 1), parentId: 'p' };

  const renderForm = (props: Record<string, unknown>) => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ItemCreationModal
          visible type="task" targetDate={new Date(2026, 10, 6)} availableFeeds={[]}
          onClose={jest.fn()} onCreateEvent={jest.fn()} onCreateTask={jest.fn()}
          editingTask={parentTask as never}
          subtasks={[step] as never}
          onToggleSubtask={jest.fn()}
          {...props}
        />
      );
    });
    return tree;
  };

  const control = (tree: TestRenderer.ReactTestRenderer, label: string) =>
    tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityLabel === label);

  test('its title opens it, as on every other task row', () => {
    const onEditSubtask = jest.fn();
    const tree = renderForm({ onEditSubtask });

    const body = control(tree, 'Edit Step one');
    expect(body).toBeDefined();
    act(() => body!.props.onPress());

    expect(onEditSubtask).toHaveBeenCalledWith(expect.objectContaining({ uid: 'a' }));
    act(() => tree.unmount());
  });

  test('ticking it off is still a separate target from opening it', () => {
    const onToggleSubtask = jest.fn();
    const onEditSubtask = jest.fn();
    const tree = renderForm({ onToggleSubtask, onEditSubtask });

    act(() => control(tree, 'Complete Step one')!.props.onPress());

    expect(onToggleSubtask).toHaveBeenCalledTimes(1);
    expect(onEditSubtask).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  test('without a handler the title is inert rather than falsely tappable', () => {
    const tree = renderForm({ onEditSubtask: undefined });

    expect(control(tree, 'Edit Step one')?.props.disabled).toBe(true);
    act(() => tree.unmount());
  });
});

test('Save is not sized to swallow the action row', () => {
  // flexGrow made it three times the width of every other button on the row.
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ItemCreationModal
        visible type="task" targetDate={new Date(2026, 10, 6)} availableFeeds={[]}
        onClose={jest.fn()} onCreateEvent={jest.fn()} onCreateTask={jest.fn()}
      />
    );
  });

  const flat = (node: TestRenderer.ReactTestInstance): Record<string, unknown> =>
    Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
  // Innermost match: the dismiss overlay wraps the whole form and carries
  // flex: 1, so the first match would be the overlay rather than the button.
  const save = tree.root.findAllByType(TouchableOpacity)
    .filter(node => node.findAllByType(Text).some(t => [t.props.children].flat(Infinity).join('').includes('Save Task')))
    .sort((a, b) => a.findAllByType(TouchableOpacity).length - b.findAllByType(TouchableOpacity).length)[0];

  expect(save).toBeDefined();
  expect(flat(save!).flexGrow).toBeUndefined();
  expect(flat(save!).flex).toBeUndefined();
  act(() => tree.unmount());
});

describe('the form says which thing it is editing', () => {
  const render1 = (props: Record<string, unknown>) => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ItemCreationModal
          visible type="task" targetDate={new Date(2026, 10, 6)} availableFeeds={[]}
          onClose={jest.fn()} onCreateEvent={jest.fn()} onCreateTask={jest.fn()}
          {...props}
        />
      );
    });
    return tree;
  };
  const textOf = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('')).join('|');

  const step = { uid: 'a', title: 'Step one', completed: false, createdAt: new Date(2026, 10, 1), parentId: 'p' };

  test('a subtask is announced as one, with its parent named', () => {
    // "Edit Task" over a subtask leaves the title field as the only clue to
    // where you are — the very field you came to change.
    const tree = render1({
      editingTask: step as never,
      editingEvent: { uid: 'a', summary: '[TASK] Step one', isTask: true, start: new Date(), end: new Date(), allDay: true, attendees: [] } as never,
      subtaskOf: 'Write the paper',
    });

    const shown = textOf(tree);
    expect(shown).toContain('Edit Subtask');
    expect(shown).toContain('of "Write the paper"');
    expect(shown).not.toContain('Edit Task');
    act(() => tree.unmount());
  });

  test('leaving it reads as going back, not as closing the form', () => {
    const tree = render1({
      editingTask: step as never,
      editingEvent: { uid: 'a', summary: '[TASK] Step one', isTask: true, start: new Date(), end: new Date(), allDay: true, attendees: [] } as never,
      subtaskOf: 'Write the paper',
    });

    expect(textOf(tree)).toContain('‹ Back');
    expect(textOf(tree)).not.toContain('✕ Close');
    act(() => tree.unmount());
  });

  test('an ordinary task still says Edit Task and Close', () => {
    const tree = render1({
      editingTask: { uid: 'p', title: 'Write the paper', completed: false, createdAt: new Date() } as never,
      editingEvent: { uid: 'p', summary: '[TASK] Write the paper', isTask: true, start: new Date(), end: new Date(), allDay: true, attendees: [] } as never,
    });

    const shown = textOf(tree);
    expect(shown).toContain('Edit Task');
    expect(shown).toContain('✕ Close');
    expect(shown).not.toContain('Edit Subtask');
    act(() => tree.unmount());
  });

  test('a new task says New Task', () => {
    expect(textOf(render1({}))).toContain('New Task');
  });
});
