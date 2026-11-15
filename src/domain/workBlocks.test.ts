import {
  hasWorkTime,
  isWorkBlockUid,
  suggestWorkStart,
  taskUidOfWorkBlock,
  workBlockEvent,
  workBlocksForDay,
  workBlockState,
  workOverlaps,
  workTimeLabel,
  withoutWorkTime,
  withWorkTime,
} from './workBlocks';
import { placeEvents } from './dayGrid';
import { CalendarEvent, CalendarTask } from './types';

const DAY = new Date(2026, 10, 17); // Tue 17 Nov 2026

function at(hour: number, minute = 0, day = DAY): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
}

function task(uid: string, over: Partial<CalendarTask> = {}): CalendarTask {
  return { uid, title: uid, completed: false, status: 'todo', createdAt: at(7), ...over };
}

function event(uid: string, start: Date, end: Date, over: Partial<CalendarEvent> = {}): CalendarEvent {
  return { uid, summary: uid, start, end, allDay: false, attendees: [], ...over };
}

describe('planning and clearing a work time', () => {
  test('withWorkTime sets both fields and leaves the deadline alone', () => {
    const due = at(17, 0, new Date(2026, 10, 20));
    const planned = withWorkTime(task('essay', { dueDate: due }), at(14), 90);
    expect(planned.workStart).toEqual(at(14));
    expect(planned.workMinutes).toBe(90);
    expect(planned.dueDate).toEqual(due);
    expect(hasWorkTime(planned)).toBe(true);
  });

  test('withoutWorkTime removes the plan', () => {
    const cleared = withoutWorkTime(withWorkTime(task('essay'), at(14), 60));
    expect(hasWorkTime(cleared)).toBe(false);
    expect('workStart' in cleared).toBe(false);
  });
});

describe('the day a block sits on', () => {
  test('lists only tasks planned that day, earliest first, finished ones included', () => {
    const tasks = [
      withWorkTime(task('late'), at(15), 30),
      withWorkTime(task('early', { completed: true, status: 'done' }), at(9), 30),
      withWorkTime(task('tomorrow'), at(9, 0, new Date(2026, 10, 18)), 30),
      task('unplanned', { dueDate: at(10) }),
    ];
    expect(workBlocksForDay(tasks, DAY).map(t => t.uid)).toEqual(['early', 'late']);
  });

  test('a block shares overlap columns with an event it collides with', () => {
    const block = workBlockEvent(withWorkTime(task('essay'), at(10), 60));
    const placed = placeEvents([event('standup', at(10), at(10, 30)), block], {
      startHour: 8, endHour: 20, hourHeight: 60, minHeight: 20,
    });
    expect(placed).toHaveLength(2);
    expect(placed.every(p => p.columns === 2)).toBe(true);
    const placedBlock = placed.find(p => isWorkBlockUid(p.event.uid));
    expect(placedBlock?.height).toBe(60);
    expect(taskUidOfWorkBlock(placedBlock!.event.uid)).toBe('essay');
  });
});

describe('state, which is the visual prompt', () => {
  const planned = withWorkTime(task('essay'), at(14), 60);
  test('ahead, in progress, then missed', () => {
    expect(workBlockState(planned, at(13))).toBe('planned');
    expect(workBlockState(planned, at(14, 30))).toBe('now');
    expect(workBlockState(planned, at(15, 1))).toBe('missed');
  });
  test('finished work is done whatever the clock says', () => {
    expect(workBlockState({ ...planned, completed: true, status: 'done' }, at(16))).toBe('done');
  });
});

describe('suggesting a slot', () => {
  const now = at(6); // before the grid, on the same day

  test('the first gap that fits, stepping past events and other blocks', () => {
    const events = [event('class', at(8), at(9, 30)), event('lunch', at(12), at(13))];
    const tasks = [withWorkTime(task('reading'), at(9, 30), 60)];
    expect(suggestWorkStart(DAY, events, tasks, 60, now)).toEqual(at(10, 30));
    expect(suggestWorkStart(DAY, events, tasks, 120, now)).toEqual(at(13));
  });

  test('all-day events claim no hours', () => {
    const events = [event('holiday', at(0), at(0, 0, new Date(2026, 10, 18)), { allDay: true })];
    expect(suggestWorkStart(DAY, events, [], 60, now)).toEqual(at(8));
  });

  test('today starts from the next quarter hour, not a slot already gone', () => {
    expect(suggestWorkStart(DAY, [], [], 30, at(10, 7))).toEqual(at(10, 15));
  });

  test('re-planning a task ignores its own current block', () => {
    const tasks = [withWorkTime(task('essay'), at(8), 60)];
    expect(suggestWorkStart(DAY, [], tasks, 60, now, 8, 20, 'essay')).toEqual(at(8));
    expect(suggestWorkStart(DAY, [], tasks, 60, now, 8, 20)).toEqual(at(9));
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
    event('Holiday', at(0), at(0, 0, new Date(2026, 10, 18)), { allDay: true }),
    event('Tomorrow class', at(10, 0, new Date(2026, 10, 18)), at(11, 0, new Date(2026, 10, 18))),
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

  test('other open work blocks count, but not a finished one or the task itself', () => {
    const tasks = [
      withWorkTime(task('reading', { title: 'Chapter 9 reading' }), at(14), 60),
      withWorkTime(task('done', { completed: true, status: 'done' }), at(14), 60),
      withWorkTime(task('essay'), at(14), 60),
    ];
    const found = workOverlaps(at(14, 30), 60, [], tasks, 'essay');
    expect(found).toEqual([{ title: 'Chapter 9 reading', startMinute: 840, endMinute: 900, isWork: true }]);
  });

  test('the suggested slot never overlaps anything', () => {
    const tasks = [withWorkTime(task('reading'), at(9, 30), 60)];
    const start = suggestWorkStart(DAY, events, tasks, 90, at(6));
    expect(workOverlaps(start, 90, events, tasks)).toEqual([]);
  });
});

describe('row label', () => {
  const planned = withWorkTime(task('essay'), at(14), 60);
  test('time alone on the day being viewed', () => {
    expect(workTimeLabel(planned, DAY)).toBe('⏱ 2:00 PM');
    expect(workTimeLabel(planned, DAY, '24h')).toBe('⏱ 14:00');
  });
  test('weekday and time from another day', () => {
    expect(workTimeLabel(planned, new Date(2026, 10, 16))).toBe('⏱ Tue 2:00 PM');
  });
  test('nothing when unplanned', () => {
    expect(workTimeLabel(task('essay'), DAY)).toBe('');
  });
});
