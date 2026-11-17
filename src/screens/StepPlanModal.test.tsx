import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { StepPlanModal } from './StepPlanModal';
import { HandwritingTextInput } from './HandwritingTextInput';
import { CalendarTask } from '../domain/types';

const today = new Date(2026, 10, 16, 19); // Mon 16 Nov
const paper = {
  uid: 'p1', title: 'Project One', completed: false, status: 'todo', createdAt: today,
  dueDate: new Date(2026, 10, 22),
} as CalendarTask & { dueDate: Date };

const textOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('')).join('|');
const byLabel = (tree: TestRenderer.ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityLabel === label)!;
const titles = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(HandwritingTextInput).map(input => input.props.value);

function render(onAdd = jest.fn(), onClose = jest.fn()) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<StepPlanModal task={paper} today={today} onAdd={onAdd} onClose={onClose} />); });
  return tree;
}

describe('planning an assignment from steps', () => {
  test('nothing is planned until a list is chosen', () => {
    const tree = render();
    expect(textOf(tree)).toContain('Project One · due Sun, Nov 22');
    expect(textOf(tree)).toContain('Nothing is added until you press Add.');
    expect(titles(tree)).toEqual([]);
    expect(textOf(tree)).not.toContain('Add ');
  });

  test('choosing a list shows each step with its day and length', () => {
    const tree = render();
    act(() => byLabel(tree, 'Use the Paper or project steps').props.onPress());
    expect(titles(tree)).toEqual(['Read and gather', 'Outline', 'Draft', 'Revise', 'Submit']);
    const text = textOf(tree);
    expect(text).toContain('Mon, Nov 16');
    expect(text).toContain('Sat, Nov 21');
    // Only the heading names the deadline: no step lands on it.
    expect(text.split('Sun, Nov 22').length - 1).toBe(1);
    expect(text).toContain('Add 5 steps');
  });

  test('a step can be moved, dropped, and the rest added in order', () => {
    const onAdd = jest.fn();
    const tree = render(onAdd);
    act(() => byLabel(tree, 'Use the Discussion post steps').props.onPress());
    act(() => byLabel(tree, 'Reply to peers a day later').props.onPress());
    act(() => byLabel(tree, 'Drop Post initial').props.onPress());
    expect(titles(tree)).toEqual(['Read and watch', 'Draft initial post', 'Reply to peers']);
    act(() => byLabel(tree, 'Add 3 steps').props.onPress());
    const [task, steps] = onAdd.mock.calls[0];
    expect(task.uid).toBe('p1');
    expect(steps.map((s: { title: string; day: Date }) => [s.title, s.day.getDate()])).toEqual([
      ['Read and watch', 16], ['Draft initial post', 18], ['Reply to peers', 22],
    ]);
  });

  test('a renamed step is added with its new name', () => {
    const onAdd = jest.fn();
    const tree = render(onAdd);
    act(() => byLabel(tree, 'Use the Reading steps').props.onPress());
    // Handwriting reaches the native input; it is read from there on Add.
    const native = tree.root.findAllByType(HandwritingTextInput)[0].findByType(TextInput);
    act(() => native.props.onChangeText('Read 4.1 and 4.4'));
    act(() => byLabel(tree, 'Add 3 steps').props.onPress());
    expect(onAdd.mock.calls[0][1][0].title).toBe('Read 4.1 and 4.4');
  });

  test('Cancel adds nothing', () => {
    const onAdd = jest.fn();
    const onClose = jest.fn();
    const tree = render(onAdd, onClose);
    act(() => byLabel(tree, 'Use the Reading steps').props.onPress());
    const cancel = tree.root.findAllByType(TouchableOpacity)
      .find(node => node.findAllByType(Text).some(t => t.props.children === 'Cancel'))!;
    act(() => cancel.props.onPress());
    expect(onClose).toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
