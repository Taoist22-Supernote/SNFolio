import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity, View } from 'react-native';
import { DayScheduleGrid } from './DayScheduleGrid';
import { withWorkTime } from '../domain/workBlocks';
import { CalendarEvent, CalendarTask } from '../domain/types';

const at = (hour: number, minute = 0) => new Date(2026, 10, 17, hour, minute);

const textOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join('')).join('|');

const pressLabel = (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const target = tree.root.findAllByType(TouchableOpacity)
    .filter(node => node.findAllByType(Text).some(text => [text.props.children].flat(Infinity).join('').includes(label)))
    .sort((a, b) => a.findAllByType(TouchableOpacity).length - b.findAllByType(TouchableOpacity).length)[0];
  if (!target) throw new Error(`No button labelled ${label}`);
  act(() => target.props.onPress());
};

const essay: CalendarTask = withWorkTime(
  { uid: 'essay', title: 'Draft essay', completed: false, status: 'todo', createdAt: at(7), dueDate: new Date(2026, 10, 20) },
  at(14),
  60,
);
const meeting: CalendarEvent = { uid: 'm', summary: 'Team meeting', start: at(10), end: at(11), allDay: false, attendees: [] };

function render(now: Date, handlers: Partial<React.ComponentProps<typeof DayScheduleGrid>> = {}) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <DayScheduleGrid
        events={[meeting]}
        startHour={8}
        endHour={20}
        notePaths={{}}
        onEditEvent={jest.fn()}
        onNoteAction={jest.fn()}
        onDeleteEvent={jest.fn()}
        typeLabel={() => ''}
        workTasks={[essay]}
        now={now}
        taskMeta={() => 'due Fri'}
        {...handlers}
      />,
    );
  });
  return tree;
}

describe('work blocks on the schedule', () => {
  test('a planned task is drawn on the grid beside the events', () => {
    const text = textOf(render(at(9), { hourHeight: 80 }));
    expect(text).toContain('Team meeting');
    expect(text).toContain('Draft essay');
    expect(text).toContain('due Fri');
    expect(text).toContain('⏱ Move');
  });

  test('a block in progress says NOW and is drawn inverted', () => {
    const tree = render(at(14, 20));
    expect(textOf(tree)).toContain('▶ NOW');
    const blocks = tree.root.findAllByType(View).filter(node =>
      [node.props.style].flat(Infinity).some((s: any) => s && s.backgroundColor === '#000000'));
    expect(blocks.length).toBeGreaterThan(0);
  });

  test('an open block whose time has passed asks to be replanned', () => {
    const text = textOf(render(at(16)));
    expect(text).toContain('MISSED');
    expect(text).toContain('⏱ Replan');
  });

  test('the state shows even on a block too short for the meta line', () => {
    // A one-hour block at the default 58 px has no meta line.
    expect(textOf(render(at(14, 20)))).toContain('▶ NOW · ');
  });

  test('the block ticks off, moves and comes off the schedule', () => {
    const onToggleTask = jest.fn();
    const onPlanTask = jest.fn();
    const onUnplanTask = jest.fn();
    const tree = render(at(9), { onToggleTask, onPlanTask, onUnplanTask });
    pressLabel(tree, '☐');
    pressLabel(tree, '⏱ Move');
    const unplan = tree.root.findAll(node =>
      node.type === TouchableOpacity && node.props.accessibilityLabel === 'Take Draft essay off the schedule');
    act(() => unplan[0].props.onPress());
    expect(onToggleTask).toHaveBeenCalledWith(essay);
    expect(onPlanTask).toHaveBeenCalledWith(essay);
    expect(onUnplanTask).toHaveBeenCalledWith(essay);
  });
});
