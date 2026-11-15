import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { WeeklyReviewView } from './WeeklyReviewView';
import { CalendarTask, Project } from '../domain/types';
import { withSession, withSessionDone } from '../domain/workBlocks';

const textOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join('')).join('|');

test('This Week by Project lists each project\'s due tasks, events and notes, and opens them', () => {
  const project: Project = { id: 'ids', name: 'IDS105', status: 'active', createdAt: new Date(2026, 7, 1) };
  const essay = { uid: 'essay', title: 'Essay 1', completed: false, createdAt: new Date(2026, 7, 1), dueDate: new Date(2026, 8, 30, 12) };
  const lecture = { uid: 'lec_1', summary: 'Research Methods', start: new Date(2026, 8, 29, 10), end: new Date(2026, 8, 29, 11), allDay: false, attendees: [] };
  const onOpenProject = jest.fn();
  const onOpenFile = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<WeeklyReviewView
      selectedDate={new Date(2026, 8, 30)} weekStartsOn={1} tasks={[essay]} projects={[project]}
      projectOf={() => 'ids'} journalDates={[]} weeklyNoteExists={true}
      projectWeeks={[{ project, due: [essay], events: [lecture], notes: [{ label: 'Lecture 5.note', path: '/N/Lecture 5.note' }], week: 5 }]}
      onOpenFile={onOpenFile} onOpenWeeklyNote={jest.fn()} onEditTask={jest.fn()} onOpenProject={onOpenProject} onOpenJournal={jest.fn()} />);
  });
  const text = textOf(tree);
  expect(text).toContain('THIS WEEK BY PROJECT');
  expect(text).toContain('🚀 IDS105 · Week 5');
  expect(text).toContain('Essay 1');
  expect(text).toContain('Research Methods');
  expect(text).toContain('Lecture 5.note');
  const pressText = (label: string) => act(() => tree.root.findAllByType(TouchableOpacity)
    .find(node => node.findAllByType(Text).some(t => [t.props.children].flat(Infinity).join('').includes(label)))!.props.onPress());
  pressText('Lecture 5.note');
  expect(onOpenFile).toHaveBeenCalledWith('/N/Lecture 5.note');
  pressText('🚀 IDS105');
  expect(onOpenProject).toHaveBeenCalledWith(project);
  act(() => tree.unmount());
});

describe('Work Time', () => {
  const project: Project = { id: 'ids', name: 'IDS105', status: 'active', createdAt: new Date(2026, 7, 1) };
  const base = { completed: false, status: 'todo' as const, createdAt: new Date(2026, 7, 1) };
  const on = (day: number, hour: number) => new Date(2026, 10, day, hour);
  // Week of Mon 16 Nov 2026, looked at on Wed 18 at noon.
  const essay = withSessionDone(withSession(withSession({ ...base, uid: 'essay', title: 'Essay' }, on(16, 9), 90), on(17, 14), 60), 's1', true);
  const loose = withSession({ ...base, uid: 'loose', title: 'Loose end' }, on(20, 9), 30);

  function render(tasks: CalendarTask[], onReplanSession = jest.fn(), onEditTask = jest.fn()) {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<WeeklyReviewView
        selectedDate={on(18, 0)} weekStartsOn={1} tasks={tasks} projects={[project]}
        projectOf={uid => (uid === 'essay' ? 'ids' : undefined)} journalDates={[]} weeklyNoteExists={true}
        projectWeeks={[]} now={on(18, 12)}
        onOpenFile={jest.fn()} onOpenWeeklyNote={jest.fn()} onEditTask={onEditTask} onOpenProject={jest.fn()}
        onOpenJournal={jest.fn()} onReplanSession={onReplanSession} />);
    });
    return tree;
  }

  test('totals, a row per project, and what "done" means', () => {
    const text = textOf(render([essay, loose]));
    expect(text).toContain('WORK TIME');
    expect(text).toContain('3h|Planned');
    expect(text).toContain('1h 30m|Done');
    expect(text).toContain('1h|Missed');
    expect(text).toContain('30m|Ahead');
    expect(text).toContain('not time measured');
    expect(text).toContain('IDS105|███░░ 1h 30m of 2h 30m');
    expect(text).toContain('No project|░░░░░ 0m of 30m');
  });

  test('a missed session is listed with its time, and Replan opens the planner on it', () => {
    const onReplanSession = jest.fn();
    const onEditTask = jest.fn();
    const tree = render([essay, loose], onReplanSession, onEditTask);
    const text = textOf(tree);
    expect(text).toContain('MISSED · 1 session');
    expect(text).toContain('Tue 2:00 PM · 1h');
    const replan = tree.root.findAll(node =>
      node.type === TouchableOpacity && node.props.accessibilityLabel === 'Replan the missed session of Essay');
    act(() => replan[0].props.onPress());
    expect(onReplanSession).toHaveBeenCalledWith(essay, 's2');
    const row = tree.root.findAllByType(TouchableOpacity)
      .find(node => node.findAllByType(Text).some(t => [t.props.children].flat(Infinity).join('') === 'Tue 2:00 PM · 1h'))!;
    act(() => row.props.onPress());
    expect(onEditTask).toHaveBeenCalledWith(essay);
  });

  test('a week with nothing planned says how to plan', () => {
    const text = textOf(render([{ ...base, uid: 'x', title: 'Unplanned' }]));
    expect(text).toContain('No work sessions planned this week');
    expect(text).not.toContain('Planned|');
  });
});
