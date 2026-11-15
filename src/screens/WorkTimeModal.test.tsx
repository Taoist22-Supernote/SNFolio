import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { overlapMessage, WorkTimeModal } from './WorkTimeModal';
import { BusySpan, findSession, withSession } from '../domain/workBlocks';
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
  expect(onSave).toHaveBeenCalledWith(essay, at(10, 30), 90, undefined);
});

test('changing the length follows the free slot until a time is chosen by hand', () => {
  const onSave = jest.fn();
  const suggestFor = jest.fn((_day: Date, minutes: number) => (minutes > 60 ? at(13) : at(10, 30)));
  const tree = render(essay, { onSave, suggestFor });
  press(tree, '2h');
  press(tree, 'Put on schedule');
  expect(onSave).toHaveBeenCalledWith(essay, at(13), 120, undefined);
});

test('moving a session opens on its own time and can take it off the schedule', () => {
  const planned = withSession(essay, at(14), 45);
  const onClear = jest.fn();
  const onSave = jest.fn();
  const tree = render(planned, { session: findSession(planned, 's1'), onClear, onSave });
  const text = textOf(tree);
  expect(text).toContain('2:00 PM');
  expect(text).toContain('Move session');
  press(tree, 'Save');
  expect(onSave).toHaveBeenCalledWith(planned, at(14), 45, 's1');
  press(tree, 'Take off schedule');
  expect(onClear).toHaveBeenCalledWith(planned, 's1');
});

test('adding another session names the ones already planned and starts at their length', () => {
  const planned = withSession(withSession(essay, at(14), 90), new Date(2026, 10, 19, 9), 90);
  const onSave = jest.fn();
  const tree = render(planned, { onSave });
  const text = textOf(tree);
  expect(text).toContain('Plan work time');
  expect(text).toContain('Adding another session. 2 others are planned: Tue 2:00 PM, Thu 9:00 AM');
  expect(text).not.toContain('Take off schedule');
  press(tree, 'Put on schedule');
  expect(onSave).toHaveBeenCalledWith(planned, at(10, 30), 90, undefined);
});

test('moving one of several sessions mentions only the others', () => {
  const planned = withSession(withSession(essay, at(14), 60), new Date(2026, 10, 19, 9), 60);
  const text = textOf(render(planned, { session: findSession(planned, 's2') }));
  expect(text).toContain('Moving one session. 1 other is planned: Tue 2:00 PM');
});

describe('overlap warning', () => {
  const meeting: BusySpan = { title: 'Team meeting', startMinute: 600, endMinute: 660, isWork: false };
  const reading: BusySpan = { title: 'Chapter 9 reading', startMinute: 630, endMinute: 690, isWork: true };
  const lunch: BusySpan = { title: 'Lunch', startMinute: 720, endMinute: 780, isWork: false };

  test('names what the time runs into and says saving is still allowed', () => {
    const tree = render(essay, { overlapsFor: () => [meeting] });
    expect(textOf(tree)).toContain('Overlaps Team meeting (10:00 AM–11:00 AM). You can still save.');
  });

  test('says nothing when the time is free', () => {
    expect(textOf(render(essay, { overlapsFor: () => [] }))).not.toContain('Overlaps');
    expect(textOf(render(essay))).not.toContain('Overlaps');
  });

  test('re-checks when the length changes, and saving still works', () => {
    const onSave = jest.fn();
    const overlapsFor = jest.fn((start: Date, minutes: number) => (minutes > 60 ? [meeting] : []));
    const tree = render(essay, { overlapsFor, onSave, suggestedStart: at(9) });
    expect(textOf(tree)).not.toContain('Overlaps');
    press(tree, '2h');
    expect(textOf(tree)).toContain('Overlaps Team meeting');
    press(tree, 'Put on schedule');
    expect(onSave).toHaveBeenCalledWith(essay, at(9), 120, undefined);
  });

  test('another planned task is called planned, and a long list is cut short', () => {
    expect(overlapMessage([meeting, reading, lunch], '12h')).toBe(
      'Overlaps Team meeting (10:00 AM–11:00 AM) and Chapter 9 reading (planned, 10:30 AM–11:30 AM) and 1 more. You can still save.',
    );
    expect(overlapMessage([meeting], '24h')).toBe('Overlaps Team meeting (10:00–11:00). You can still save.');
  });
});
