import { canPostpone, postponeOptions, postponedTask, postponedToDay } from './taskPostpone';
import { CalendarTask } from './types';

// Local time throughout: a date-only string parses as UTC, which lands on the
// previous day in Honolulu and silently moves every expectation.
const at = (iso: string): Date => new Date(iso);

const task = (over: Partial<CalendarTask> = {}): CalendarTask => ({
  uid: 'task-1',
  title: 'Submit the draft',
  completed: false,
  createdAt: at('2026-11-01T09:00:00'),
  ...over,
});

const now = at('2026-11-06T10:30:00');

describe('postponeOptions', () => {
  test('a task due today offers tomorrow and next week', () => {
    const options = postponeOptions(task({ dueDate: at('2026-11-06T17:00:00') }), now);

    expect(options.map(o => o.label)).toEqual(['Tomorrow', 'Next week']);
    expect(options[0].date).toEqual(at('2026-11-07T17:00:00'));
    expect(options[1].date).toEqual(at('2026-11-13T17:00:00'));
  });

  test('the clock time survives the move', () => {
    const [tomorrow] = postponeOptions(task({ dueDate: at('2026-11-06T17:45:30') }), now);

    expect(tomorrow.date.getHours()).toBe(17);
    expect(tomorrow.date.getMinutes()).toBe(45);
  });

  test('an overdue task counts forward from today, not from the date it missed', () => {
    // Counting from the due date would offer Oct 29 to a task due Oct 28:
    // one past date swapped for another.
    const options = postponeOptions(task({ dueDate: at('2026-10-28T09:00:00') }), now);

    expect(options.map(o => o.label)).toEqual(['Today', 'Tomorrow', 'Next week']);
    expect(options[0].date).toEqual(at('2026-11-06T09:00:00'));
    expect(options[1].date).toEqual(at('2026-11-07T09:00:00'));
    expect(options[2].date).toEqual(at('2026-11-13T09:00:00'));
  });

  test('a future task moves by an interval and is not described as tomorrow', () => {
    const options = postponeOptions(task({ dueDate: at('2026-12-01T09:00:00') }), now);

    expect(options.map(o => o.label)).toEqual(['+1 day', '+1 week']);
    expect(options[0].date).toEqual(at('2026-12-02T09:00:00'));
    expect(options[1].date).toEqual(at('2026-12-08T09:00:00'));
  });

  test('every option says where it lands', () => {
    const options = postponeOptions(task({ dueDate: at('2026-11-06T17:00:00') }), now);

    expect(options.map(o => o.dateLabel)).toEqual(['Nov 7', 'Nov 13']);
  });

  test('it crosses a month boundary without arithmetic of its own', () => {
    const [, week] = postponeOptions(task({ dueDate: at('2026-11-28T09:00:00') }), now);

    expect(week.date).toEqual(at('2026-12-05T09:00:00'));
  });

  test('an undated task has no deadline to push', () => {
    expect(postponeOptions(task(), now)).toEqual([]);
    expect(canPostpone(task(), now)).toBe(false);
  });

  test('a finished task is not offered a new deadline', () => {
    const done = task({ dueDate: at('2026-11-06T09:00:00'), completed: true, status: 'done' });

    expect(postponeOptions(done, now)).toEqual([]);
    expect(canPostpone(done, now)).toBe(false);
  });

  test('an unparseable date is refused rather than producing an invalid one', () => {
    expect(postponeOptions(task({ dueDate: new Date('nonsense') }), now)).toEqual([]);
  });
});

describe('postponedTask', () => {
  test('only the due date changes', () => {
    const original = task({
      dueDate: at('2026-11-06T17:00:00'),
      notes: 'with the revised figures',
      status: 'in-progress',
      priority: 1,
      caldavUrl: 'https://example.com/tasks/1.ics',
      allDay: false,
    });

    const moved = postponedTask(original, at('2026-11-13T17:00:00'));

    expect(moved.dueDate).toEqual(at('2026-11-13T17:00:00'));
    expect({ ...moved, dueDate: undefined }).toEqual({ ...original, dueDate: undefined });
  });

  test('it does not mutate the task it was given', () => {
    const original = task({ dueDate: at('2026-11-06T17:00:00') });
    postponedTask(original, at('2026-11-13T17:00:00'));

    expect(original.dueDate).toEqual(at('2026-11-06T17:00:00'));
  });
});

describe('postponedToDay', () => {
  test('a date picked from a calendar keeps the task\'s time of day', () => {
    // The picker hands back midnight; a task due at 17:00 must stay due at
    // 17:00, as it does through the quick options.
    const moved = postponedToDay(
      task({ dueDate: at('2026-11-06T17:00:00') }),
      at('2026-12-24T00:00:00')
    );

    expect(moved.dueDate).toEqual(at('2026-12-24T17:00:00'));
  });

  test('an undated task takes the chosen day as given', () => {
    const moved = postponedToDay(task(), at('2026-12-24T00:00:00'));

    expect(moved.dueDate).toEqual(at('2026-12-24T00:00:00'));
  });
});
