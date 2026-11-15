import {
  blockClashes,
  findSession,
  hasWorkTime,
  isWorkBlockUid,
  openSessions,
  reviveWorkSessions,
  sessionKey,
  sessionKeyOfWorkBlock,
  sessionsOf,
  suggestWorkStart,
  workBlockEvent,
  workBlocksForDay,
  workBlockState,
  workOverlaps,
  workTimeLabel,
  withoutSession,
  withSession,
  withSessionDone,
} from './workBlocks';
import { placeEvents } from './dayGrid';
import { CalendarEvent, CalendarTask } from './types';

const DAY = new Date(2026, 10, 17); // Tue 17 Nov 2026
const WED = new Date(2026, 10, 18);
const THU = new Date(2026, 10, 19);

function at(hour: number, minute = 0, day = DAY): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
}

function task(uid: string, over: Partial<CalendarTask> = {}): CalendarTask {
  return { uid, title: uid, completed: false, status: 'todo', createdAt: at(7), ...over };
}

function event(uid: string, start: Date, end: Date, over: Partial<CalendarEvent> = {}): CalendarEvent {
  return { uid, summary: uid, start, end, allDay: false, attendees: [], ...over };
}

/** A task planned at each of `starts` for `minutes`. */
function planned(uid: string, starts: Date[], minutes = 60, over: Partial<CalendarTask> = {}): CalendarTask {
  return starts.reduce((t, start) => withSession(t, start, minutes), task(uid, over));
}

const done = { completed: true, status: 'done' as const };

describe('planning sessions', () => {
  test('a first session leaves the deadline alone', () => {
    const due = at(17, 0, new Date(2026, 10, 20));
    const essay = withSession(task('essay', { dueDate: due }), at(14), 90);
    expect(sessionsOf(essay)).toEqual([{ id: 's1', start: at(14), minutes: 90 }]);
    expect(essay.dueDate).toEqual(due);
    expect(hasWorkTime(essay)).toBe(true);
  });

  test('more sessions are added, each with its own id, earliest first', () => {
    const essay = planned('essay', [at(14, 0, THU), at(9)]);
    expect(sessionsOf(essay).map(s => [s.id, s.start])).toEqual([['s2', at(9)], ['s1', at(14, 0, THU)]]);
  });

  test('moving a session changes only that one', () => {
    const essay = planned('essay', [at(9), at(14, 0, THU)]);
    const moved = withSession(essay, at(10, 0, WED), 45, 's1');
    expect(findSession(moved, 's1')).toEqual({ id: 's1', start: at(10, 0, WED), minutes: 45 });
    expect(findSession(moved, 's2')?.start).toEqual(at(14, 0, THU));
  });

  test('a new session after a removal still gets an id of its own', () => {
    const essay = withoutSession(planned('essay', [at(9), at(10), at(11)]), 's1');
    const again = withSession(essay, at(12), 60);
    expect(sessionsOf(again).map(s => s.id)).toEqual(['s2', 's3', 's4']);
  });

  test('taking off the last session leaves the task unplanned', () => {
    const cleared = withoutSession(planned('essay', [at(14)]), 's1');
    expect(hasWorkTime(cleared)).toBe(false);
    expect('workSessions' in cleared).toBe(false);
  });

  test('ticking a session finishes only that session, not the task', () => {
    const essay = withSessionDone(planned('essay', [at(9), at(14)]), 's1', true);
    expect(findSession(essay, 's1')?.done).toBe(true);
    expect(essay.completed).toBe(false);
    expect(openSessions(essay).map(s => s.id)).toEqual(['s2']);
    const reopened = withSessionDone(essay, 's1', false);
    expect('done' in findSession(reopened, 's1')!).toBe(false);
  });

  test('a finished task has no open sessions', () => {
    expect(openSessions(planned('essay', [at(9)], 60, done))).toEqual([]);
  });
});

describe('the day a block sits on', () => {
  test('one block per session that day, earliest first, finished ones included', () => {
    const tasks = [
      planned('essay', [at(15), at(9, 0, WED)], 30),
      withSessionDone(planned('reading', [at(9)], 30), 's1', true),
      task('unplanned', { dueDate: at(10) }),
    ];
    expect(workBlocksForDay(tasks, DAY).map(b => sessionKey(b.task.uid, b.session.id))).toEqual(['reading:s1', 'essay:s1']);
    expect(workBlocksForDay(tasks, WED).map(b => sessionKey(b.task.uid, b.session.id))).toEqual(['essay:s2']);
  });

  test('two sessions of one task on one day are two blocks', () => {
    const essay = planned('essay', [at(9), at(14)]);
    expect(workBlocksForDay([essay], DAY)).toHaveLength(2);
  });

  test('a block shares overlap columns with an event it collides with', () => {
    const essay = planned('essay', [at(10)]);
    const block = workBlockEvent(workBlocksForDay([essay], DAY)[0]);
    const placed = placeEvents([event('standup', at(10), at(10, 30)), block], {
      startHour: 8, endHour: 20, hourHeight: 60, minHeight: 20,
    });
    expect(placed).toHaveLength(2);
    expect(placed.every(p => p.columns === 2)).toBe(true);
    const placedBlock = placed.find(p => isWorkBlockUid(p.event.uid));
    expect(placedBlock?.height).toBe(60);
    expect(sessionKeyOfWorkBlock(placedBlock!.event.uid)).toBe('essay:s1');
  });
});

describe('state, which is the visual prompt', () => {
  const essay = planned('essay', [at(14)]);
  const block = workBlocksForDay([essay], DAY)[0];
  test('ahead, in progress, then missed', () => {
    expect(workBlockState(block, at(13))).toBe('planned');
    expect(workBlockState(block, at(14, 30))).toBe('now');
    expect(workBlockState(block, at(15, 1))).toBe('missed');
  });
  test('a ticked session is done whatever the clock says', () => {
    const ticked = withSessionDone(essay, 's1', true);
    expect(workBlockState({ task: ticked, session: findSession(ticked, 's1')! }, at(16))).toBe('done');
  });
  test('finishing the task finishes all its blocks', () => {
    expect(workBlockState({ ...block, task: { ...essay, ...done } }, at(16))).toBe('done');
  });
});

describe('suggesting a slot', () => {
  const now = at(6); // before the grid, on the same day

  test('the first gap that fits, stepping past events and other sessions', () => {
    const events = [event('class', at(8), at(9, 30)), event('lunch', at(12), at(13))];
    const tasks = [planned('reading', [at(9, 30)])];
    expect(suggestWorkStart(DAY, events, tasks, 60, now)).toEqual(at(10, 30));
    expect(suggestWorkStart(DAY, events, tasks, 120, now)).toEqual(at(13));
  });

  test('all-day events claim no hours', () => {
    const events = [event('holiday', at(0), at(0, 0, WED), { allDay: true })];
    expect(suggestWorkStart(DAY, events, [], 60, now)).toEqual(at(8));
  });

  test('today starts from the next quarter hour, not a slot already gone', () => {
    expect(suggestWorkStart(DAY, [], [], 30, at(10, 7))).toEqual(at(10, 15));
  });

  test('moving a session ignores only that session; a new one steps past the task\'s others', () => {
    const tasks = [planned('essay', [at(8)])];
    expect(suggestWorkStart(DAY, [], tasks, 60, now, 8, 20, 'essay:s1')).toEqual(at(8));
    expect(suggestWorkStart(DAY, [], tasks, 60, now, 8, 20)).toEqual(at(9));
  });

  test('ticked sessions and finished tasks leave their time free', () => {
    const tasks = [withSessionDone(planned('a', [at(8)]), 's1', true), planned('b', [at(9)], 60, done)];
    expect(suggestWorkStart(DAY, [], tasks, 120, now)).toEqual(at(8));
  });

  test('a full day still offers somewhere to start', () => {
    const events = [event('conference', at(0), at(23, 59))];
    expect(suggestWorkStart(DAY, events, [], 60, now)).toEqual(at(8));
  });
});

describe('what a planned block would overlap', () => {
  const events = [
    event('Team meeting', at(10), at(11)),
    event('Lunch', at(12), at(13)),
    event('Holiday', at(0), at(0, 0, WED), { allDay: true }),
    event('Tomorrow class', at(10, 0, WED), at(11, 0, WED)),
  ];

  test('timed events the block runs into, earliest first', () => {
    const found = workOverlaps(at(10, 30), 120, events, []);
    expect(found.map(b => b.title)).toEqual(['Team meeting', 'Lunch']);
    expect(found[0]).toMatchObject({ startMinute: 600, endMinute: 660, isWork: false });
  });

  test('touching end to start is not an overlap', () => {
    expect(workOverlaps(at(11), 60, events, [])).toEqual([]);
    expect(workOverlaps(at(9), 60, events, [])).toEqual([]);
  });

  test('all-day events and other days are ignored', () => {
    expect(workOverlaps(at(8), 60, events, [])).toEqual([]);
  });

  test('open sessions count, including the task\'s own others, but not ticked ones or the one being moved', () => {
    const tasks = [
      planned('reading', [at(14)], 60, { title: 'Chapter 9 reading' }),
      withSessionDone(planned('ticked', [at(14)]), 's1', true),
      planned('essay', [at(14), at(14, 30)], 60, { title: 'Draft essay' }),
    ];
    const found = workOverlaps(at(14, 30), 60, [], tasks, 'essay:s2');
    expect(found).toEqual([
      { title: 'Chapter 9 reading', startMinute: 840, endMinute: 900, isWork: true },
      { title: 'Draft essay', startMinute: 840, endMinute: 900, isWork: true },
    ]);
  });

  test('the suggested slot never overlaps anything', () => {
    const tasks = [planned('reading', [at(9, 30)])];
    const start = suggestWorkStart(DAY, events, tasks, 90, at(6));
    expect(workOverlaps(start, 90, events, tasks)).toEqual([]);
  });
});

describe('row label', () => {
  test('time alone when the next session is on the day being viewed', () => {
    const essay = planned('essay', [at(14)]);
    expect(workTimeLabel(essay, DAY)).toBe('⏱ 2:00 PM');
    expect(workTimeLabel(essay, DAY, '24h')).toBe('⏱ 14:00');
  });

  test('weekday and time when it is on another day', () => {
    expect(workTimeLabel(planned('essay', [at(14)]), new Date(2026, 10, 16))).toBe('⏱ Tue 2:00 PM');
  });

  test('names the next open session and counts the rest', () => {
    const essay = planned('essay', [at(9), at(14, 0, THU), at(10, 0, WED)]);
    expect(workTimeLabel(essay, DAY)).toBe('⏱ 9:00 AM +2');
    expect(workTimeLabel(withSessionDone(essay, 's1', true), DAY)).toBe('⏱ Wed 10:00 AM +1');
  });

  test('a missed session still waiting is named when nothing is ahead', () => {
    expect(workTimeLabel(planned('essay', [at(9)]), THU)).toBe('⏱ Tue 9:00 AM');
  });

  test('nothing when unplanned or every session is ticked', () => {
    expect(workTimeLabel(task('essay'), DAY)).toBe('');
    expect(workTimeLabel(withSessionDone(planned('essay', [at(9)]), 's1', true), DAY)).toBe('');
  });
});

describe('loading stored tasks', () => {
  test('0.1.33\'s single work time becomes the first session', () => {
    expect(reviveWorkSessions({ workStart: '2026-11-17T14:00:00.000Z', workMinutes: 90 })).toEqual([
      { id: 's1', start: new Date('2026-11-17T14:00:00.000Z'), minutes: 90 },
    ]);
  });

  test('sessions come back with their dates and done flags', () => {
    const stored = JSON.parse(JSON.stringify({ workSessions: [
      { id: 's1', start: at(9), minutes: 60, done: true },
      { id: 's2', start: at(14), minutes: 30 },
    ] }));
    expect(reviveWorkSessions(stored)).toEqual([
      { id: 's1', start: at(9), minutes: 60, done: true },
      { id: 's2', start: at(14), minutes: 30 },
    ]);
  });

  test('a stored list wins over a leftover old field', () => {
    const stored = { workStart: at(8).toISOString(), workSessions: [{ id: 's1', start: at(9).toISOString(), minutes: 60 }] };
    expect(reviveWorkSessions(stored)?.map(s => s.start)).toEqual([at(9)]);
  });

  test('unreadable sessions are dropped, and none at all is undefined', () => {
    expect(reviveWorkSessions({ workSessions: [{ id: 's1', start: 'not a date' }, { start: at(9).toISOString() }] })).toBeUndefined();
    expect(reviveWorkSessions({})).toBeUndefined();
    expect(reviveWorkSessions({ workSessions: [{ id: 's1', start: at(9).toISOString(), minutes: -5 }] }))
      .toEqual([{ id: 's1', start: at(9), minutes: 60 }]);
  });
});

describe('clashes marked on a block', () => {
  const meeting = event('Team meeting', at(10), at(11));
  const essay = planned('essay', [at(10, 30)], 60, { title: 'Essay' });
  const reading = planned('reading', [at(14)], 60, { title: 'Reading' });
  const blocks = workBlocksForDay([essay, reading], DAY);
  const [essayBlock, readingBlock] = blocks;

  test('a block running into an event clashes; one in a free hour does not', () => {
    expect(blockClashes(essayBlock, [meeting], blocks, at(8)).map(b => b.title)).toEqual(['Team meeting']);
    expect(blockClashes(readingBlock, [meeting], blocks, at(8))).toEqual([]);
  });

  test('two sessions on top of each other both clash, and a block never clashes with itself', () => {
    const other = planned('other', [at(14, 30)], 60, { title: 'Other' });
    const both = workBlocksForDay([reading, other], DAY);
    expect(blockClashes(both[0], [], both, at(8)).map(b => b.title)).toEqual(['Other']);
    expect(blockClashes(both[1], [], both, at(8)).map(b => b.title)).toEqual(['Reading']);
    expect(blockClashes(readingBlock, [], [readingBlock], at(8))).toEqual([]);
  });

  test('in progress is still marked; missed and ticked blocks are not', () => {
    expect(blockClashes(essayBlock, [meeting], blocks, at(10, 45))).toHaveLength(1);
    expect(blockClashes(essayBlock, [meeting], blocks, at(12))).toEqual([]);
    const ticked = withSessionDone(essay, 's1', true);
    expect(blockClashes({ task: ticked, session: findSession(ticked, 's1')! }, [meeting], blocks, at(8))).toEqual([]);
  });

  test('an all-day event is no clash', () => {
    const holiday = event('Holiday', at(0), at(0, 0, WED), { allDay: true });
    expect(blockClashes(readingBlock, [holiday], blocks, at(8))).toEqual([]);
  });
});
