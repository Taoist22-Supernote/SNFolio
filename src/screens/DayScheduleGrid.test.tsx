import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity, View } from 'react-native';
import { DayScheduleGrid } from './DayScheduleGrid';
import { LinkedFilePathsContext } from './LinkedFileMarker';
import { withSession, withSessionDone, workBlocksForDay } from '../domain/workBlocks';
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

const essay: CalendarTask = withSession(
  { uid: 'essay', title: 'Draft essay', completed: false, status: 'todo', createdAt: at(7), dueDate: new Date(2026, 10, 20) },
  at(14),
  60,
);
const meeting: CalendarEvent = { uid: 'm', summary: 'Team meeting', start: at(10), end: at(11), allDay: false, attendees: [] };

function render(
  now: Date,
  handlers: Partial<React.ComponentProps<typeof DayScheduleGrid>> = {},
  linkedPaths: Record<string, string> = {},
) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <LinkedFilePathsContext.Provider value={linkedPaths}>
      <DayScheduleGrid
        events={[meeting]}
        startHour={8}
        endHour={20}
        notePaths={{}}
        onEditEvent={jest.fn()}
        onNoteAction={jest.fn()}
        onDeleteEvent={jest.fn()}
        typeLabel={() => ''}
        workBlocks={workBlocksForDay([essay], at(0))}
        now={now}
        taskMeta={() => 'due Fri'}
        {...handlers}
      />
      </LinkedFilePathsContext.Provider>,
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

  test('the block ticks off its session, moves and comes off the schedule', () => {
    const onToggleSession = jest.fn();
    const onToggleTask = jest.fn();
    const onPlanTask = jest.fn();
    const onUnplanTask = jest.fn();
    const tree = render(at(9), { onToggleSession, onToggleTask, onPlanTask, onUnplanTask });
    pressLabel(tree, '☐');
    pressLabel(tree, '⏱ Move');
    const unplan = tree.root.findAll(node =>
      node.type === TouchableOpacity && node.props.accessibilityLabel === 'Take Draft essay off the schedule');
    act(() => unplan[0].props.onPress());
    expect(onToggleSession).toHaveBeenCalledWith(essay, 's1');
    expect(onToggleTask).not.toHaveBeenCalled();
    expect(onPlanTask).toHaveBeenCalledWith(essay, 's1');
    expect(onUnplanTask).toHaveBeenCalledWith(essay, 's1');
  });

  test('two sessions of one task are two blocks, each acting on its own session', () => {
    const twice = withSession(essay, at(9), 60);
    const onPlanTask = jest.fn();
    const tree = render(at(8), { workBlocks: workBlocksForDay([twice], at(0)), onPlanTask, hourHeight: 80 });
    expect(textOf(tree).split('Draft essay').length - 1).toBe(2);
    const moves = tree.root.findAllByType(TouchableOpacity)
      .filter(node => node.findAllByType(Text).some(t => [t.props.children].flat(Infinity).join('') === '⏱ Move')
        && node.findAllByType(TouchableOpacity).length === 1);
    moves.forEach(button => act(() => button.props.onPress()));
    expect(onPlanTask.mock.calls.map(([, id]) => id).sort()).toEqual(['s1', 's2']);
  });

  test('a ticked session is done while the task stays open, and unticks the session', () => {
    const ticked = withSessionDone(essay, 's1', true);
    const onToggleSession = jest.fn();
    const tree = render(at(9), { workBlocks: workBlocksForDay([ticked], at(0)), onToggleSession });
    expect(textOf(tree)).toContain('☑');
    expect(textOf(tree)).not.toContain('⏱ Move');
    pressLabel(tree, '☑');
    expect(onToggleSession).toHaveBeenCalledWith(ticked, 's1');
  });

  test('a block of a finished task reopens the task', () => {
    const finished = { ...essay, completed: true, status: 'done' as const };
    const onToggleTask = jest.fn();
    const onToggleSession = jest.fn();
    const tree = render(at(9), { workBlocks: workBlocksForDay([finished], at(0)), onToggleTask, onToggleSession });
    pressLabel(tree, '☑');
    expect(onToggleTask).toHaveBeenCalledWith(finished);
    expect(onToggleSession).not.toHaveBeenCalled();
  });

  test('a block with no note offers to create one', () => {
    const onTaskNoteAction = jest.fn();
    // No meeting: its own Create Note has the same label.
    const tree = render(at(9), { onTaskNoteAction, events: [] });
    pressLabel(tree, '📝 Create Note');
    expect(onTaskNoteAction).toHaveBeenCalledWith(essay);
  });

  test('a block opens the note or PDF linked to its task', () => {
    const onTaskNoteAction = jest.fn();
    const withNote = render(at(14, 20), { onTaskNoteAction }, { essay: '/storage/emulated/0/Note/Task Notes/Essay.note' });
    expect(textOf(withNote)).toContain('📂 Open Note');
    pressLabel(withNote, '📂 Open Note');
    expect(onTaskNoteAction).toHaveBeenCalledWith(essay);

    const withPdf = render(at(9), { onTaskNoteAction }, { essay: '/storage/emulated/0/Document/Reading.pdf' });
    expect(textOf(withPdf)).toContain('📄 Open PDF');
  });

  test('an event\'s note does not label a task block', () => {
    const text = textOf(render(at(9), { onTaskNoteAction: jest.fn() }, { m: '/storage/emulated/0/Note/Meeting.note' }));
    expect(text).toContain('📝 Create Note');
  });

  test('a ticked block keeps its note but not Move or ✕', () => {
    const done = { ...essay, completed: true, status: 'done' as const };
    const text = textOf(render(at(16), { onTaskNoteAction: jest.fn(), workBlocks: workBlocksForDay([done], at(0)) }, { essay: '/x/Essay.note' }));
    expect(text).toContain('📂 Open Note');
    expect(text).not.toContain('⏱ Move');
    expect(text).not.toContain('⏱ Replan');
  });
});

describe('a block too short for the button row', () => {
  const short = withSession(
    { uid: 'quick', title: 'Quick review', completed: false, status: 'todo', createdAt: at(7) },
    at(16),
    30,
  );
  const byLabel = (tree: TestRenderer.ReactTestRenderer, label: string) =>
    tree.root.findAll(node => node.type === TouchableOpacity && node.props.accessibilityLabel === label);

  test('keeps Move and the note as icons on its title line', () => {
    const onPlanTask = jest.fn();
    const onTaskNoteAction = jest.fn();
    const tree = render(at(9), { workBlocks: workBlocksForDay([short], at(0)), onPlanTask, onTaskNoteAction, events: [] });
    expect(textOf(tree)).not.toContain('⏱ Move');
    act(() => byLabel(tree, 'Move Quick review')[0].props.onPress());
    act(() => byLabel(tree, 'Create Note for Quick review')[0].props.onPress());
    expect(onPlanTask).toHaveBeenCalledWith(short, 's1');
    expect(onTaskNoteAction).toHaveBeenCalledWith(short);
  });

  test('the note icon says what it opens, and a missed block replans', () => {
    const tree = render(at(18), { workBlocks: workBlocksForDay([short], at(0)), onPlanTask: jest.fn(), onTaskNoteAction: jest.fn(), events: [] },
      { quick: '/x/Reading.pdf' });
    expect(textOf(tree)).toContain('📄');
    expect(byLabel(tree, 'Open PDF for Quick review')).toHaveLength(1);
    expect(byLabel(tree, 'Replan Quick review')).toHaveLength(1);
  });

  test('a ticked short block keeps the note icon but not Move', () => {
    const ticked = withSessionDone(short, 's1', true);
    const tree = render(at(9), { workBlocks: workBlocksForDay([ticked], at(0)), onPlanTask: jest.fn(), onTaskNoteAction: jest.fn(), events: [] });
    expect(byLabel(tree, 'Move Quick review')).toHaveLength(0);
    expect(byLabel(tree, 'Create Note for Quick review')).toHaveLength(1);
  });

  test('a tall block has the button row and no icons', () => {
    const tree = render(at(9), { onPlanTask: jest.fn(), onTaskNoteAction: jest.fn(), hourHeight: 80, events: [] });
    expect(textOf(tree)).toContain('⏱ Move');
    expect(byLabel(tree, 'Move Draft essay')).toHaveLength(0);
  });
});

describe('clash marker', () => {
  const overMeeting = withSession(
    { uid: 'clash', title: 'Read chapter', completed: false, status: 'todo', createdAt: at(7) },
    at(10, 30),
    60,
  );

  test('a block running into an event says CLASH, and the other block does not', () => {
    const tree = render(at(8), { workBlocks: workBlocksForDay([overMeeting, essay], at(0)) });
    const text = textOf(tree);
    expect(text).toContain('CLASH · ');
    expect(text.split('CLASH').length - 1).toBe(1);
    const labelled = tree.root.findAll(node => node.type === Text
      && node.props.accessibilityLabel === 'Read chapter, clashes with Team meeting');
    expect(labelled.length).toBeGreaterThan(0);
  });

  test('in progress shows both NOW and CLASH; once missed, only MISSED', () => {
    const blocks = workBlocksForDay([overMeeting], at(0));
    expect(textOf(render(at(10, 45), { workBlocks: blocks }))).toContain('▶ NOW · CLASH · ');
    const missed = textOf(render(at(12), { workBlocks: blocks }));
    expect(missed).toContain('MISSED · ');
    expect(missed).not.toContain('CLASH');
  });

  test('no events in the way, no marker', () => {
    expect(textOf(render(at(8), { events: [] }))).not.toContain('CLASH');
  });
});
