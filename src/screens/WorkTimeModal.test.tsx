import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { WorkTimeModal } from './WorkTimeModal';
import { withWorkTime } from '../domain/workBlocks';
import { CalendarTask } from '../domain/types';

const at = (hour: number, minute = 0) => new Date(2026, 10, 17, hour, minute);
const textOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join('')).join('|');
const press = (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const target = tree.root.findAllByType(TouchableOpacity)
    .filter(node => node.findAllByType(Text).some(text => [text.props.children].flat(Infinity).join('') === label))
    .sort((a, b) => a.findAllByType(TouchableOpacity).length - b.findAllByType(TouchableOpacity).length)[0];
  if (!target) throw new Error(`No button labelled ${label}`);
  act(() => target.props.onPress());
};

const essay: CalendarTask = {
  uid: 'essay', title: 'Draft essay', completed: false, status: 'todo', createdAt: at(7), dueDate: new Date(2026, 10, 20),
};

function render(task: CalendarTask, props: Partial<React.ComponentProps<typeof WorkTimeModal>> = {}) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <WorkTimeModal task={task} suggestedStart={at(10, 30)} onSave={jest.fn()} onClear={jest.fn()} onClose={jest.fn()} {...props} />,
    );
  });
  return tree;
}

test('an unplanned task opens on the suggested slot and says the deadline stays', () => {
  const onSave = jest.fn();
  const tree = render(essay, { onSave });
  const text = textOf(tree);
  expect(text).toContain('10:30 AM');
  expect(text).toContain('The deadline stays where it is.');
  expect(text).not.toContain('Take off schedule');
  press(tree, '1h 30m');
  press(tree, 'Put on schedule');
  expect(onSave).toHaveBeenCalledWith(essay, at(10, 30), 90);
});

test('changing the length follows the free slot until a time is chosen by hand', () => {
  const onSave = jest.fn();
  const suggestFor = jest.fn((_day: Date, minutes: number) => (minutes > 60 ? at(13) : at(10, 30)));
  const tree = render(essay, { onSave, suggestFor });
  press(tree, '2h');
  press(tree, 'Put on schedule');
  expect(onSave).toHaveBeenCalledWith(essay, at(13), 120);
});

test('a planned task opens on its own time and can come off the schedule', () => {
  const planned = withWorkTime(essay, at(14), 45);
  const onClear = jest.fn();
  const onSave = jest.fn();
  const tree = render(planned, { onClear, onSave });
  expect(textOf(tree)).toContain('2:00 PM');
  press(tree, 'Save');
  expect(onSave).toHaveBeenCalledWith(planned, at(14), 45);
  press(tree, 'Take off schedule');
  expect(onClear).toHaveBeenCalledWith(planned);
});
