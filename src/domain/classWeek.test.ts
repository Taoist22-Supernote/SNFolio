import { classWeekLabel, classWeekSummary } from './classWeek';
import { withSession, withSessionDone } from './workBlocks';
import { CalendarTask, Project } from './types';

// PSY 215: starts Mon 26 Oct 2026, ends Sun 27 Dec; today Tue 17 Nov (Week 4).
const psy: Project = {
  id: 'psy', name: 'Psy 215', status: 'active', createdAt: new Date(2026, 9, 1), category: 'class',
  classStartDate: new Date(2026, 9, 26), dueDate: new Date(2026, 11, 27),
} as Project;
const now = new Date(2026, 10, 17, 10);
const on = (day: number, hour = 0) => new Date(2026, 10, day, hour);

function task(uid: string, over: Partial<CalendarTask> = {}): CalendarTask {
  return { uid, title: uid, completed: false, status: 'todo', createdAt: on(1), ...over };
}

describe('where a class is in its weeks', () => {
  test('during the class: week, span, and the week\'s due tasks and sessions in day order', () => {
    const discussion = withSession(task('Draft initial post', { dueDate: on(19), allDay: true }), on(18, 13), 60);
    const paper = withSession(withSession(task('Project One', { dueDate: on(22), allDay: true }), on(20, 13), 60), on(19, 13), 90);
    const ticked = withSessionDone(withSession(task('Read', { dueDate: on(17) }), on(17, 13), 60), 's1', true);
    const finished = withSession(task('Old', { dueDate: on(18), completed: true, status: 'done' }), on(18, 9), 60);
    const nextWeek = withSession(task('Later', { dueDate: on(24) }), on(23, 9), 60);

    const summary = classWeekSummary(psy, [paper, discussion, ticked, finished, nextWeek], now)!;
    expect(summary).toMatchObject({ state: 'during', week: 4, weekCount: 9, due: 3, sessions: 3 });
    if (summary.state !== 'during') {throw new Error();}
    expect(summary.start).toEqual(on(16));
    expect(summary.end).toEqual(on(22));
    // One row per task per day: a step planned on its due day is one row.
    expect(summary.items.map(i => [i.task.uid, i.day.getDate(), i.due, i.sessions.map(x => x.id)])).toEqual([
      ['Read', 17, true, []],
      ['Draft initial post', 18, false, ['s1']],
      ['Draft initial post', 19, true, []],
      ['Project One', 19, false, ['s2']],
      ['Project One', 20, false, ['s1']],
      ['Project One', 22, true, []],
    ]);
    expect(classWeekLabel(summary)).toBe('📆 Week 4 of 9 · Nov 16 – 22 · 3 due · 3 sessions planned');
  });

  test('a week across two months names both', () => {
    const summary = classWeekSummary(psy, [], new Date(2026, 10, 30))!;
    expect(classWeekLabel(summary)).toBe('📆 Week 6 of 9 · Nov 30 – Dec 6 · 0 due · 0 sessions planned');
  });

  test('weeks follow the class\'s own week start', () => {
    const sundays = { ...psy, classWeekStartsOn: 0 };
    const summary = classWeekSummary(sundays, [], now)!;
    expect(classWeekLabel(summary)).toContain('Nov 15 – 21');
  });

  test('without a due date it counts weeks with no total', () => {
    const open = { ...psy, dueDate: undefined };
    expect(classWeekLabel(classWeekSummary(open, [], now)!)).toBe('📆 Week 4 · Nov 16 – 22 · 0 due · 0 sessions planned');
  });

  test('before it starts, and after it ends', () => {
    expect(classWeekLabel(classWeekSummary(psy, [], new Date(2026, 9, 20))!)).toBe('📆 Starts Mon, Oct 26 · Week 1');
    expect(classWeekLabel(classWeekSummary(psy, [], new Date(2027, 0, 5))!)).toBe('📆 Finished · 9 weeks');
  });

  test('a Class with no start date offers to set one; other Projects show nothing', () => {
    const noStart = { ...psy, classStartDate: undefined };
    expect(classWeekLabel(classWeekSummary(noStart, [], now)!)).toBe('📆 Weeks not set · Set start date');
    expect(classWeekSummary({ ...noStart, category: 'work' }, [], now)).toBeUndefined();
    expect(classWeekSummary({ ...noStart, category: undefined }, [], now)).toBeUndefined();
  });

  test('a work Project with a start date gets the line too', () => {
    expect(classWeekSummary({ ...psy, category: 'work' }, [], now)).toMatchObject({ state: 'during', week: 4 });
  });

  test('planned on the day it is due is one row with both', () => {
    const step = withSession(withSession(task('Outline', { dueDate: on(18), allDay: true }), on(18, 15), 60), on(18, 9), 30);
    const summary = classWeekSummary(psy, [step], now)!;
    if (summary.state !== 'during') {throw new Error();}
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]).toMatchObject({ due: true });
    expect(summary.items[0].sessions.map(x => x.start.getHours())).toEqual([9, 15]);
    expect(summary).toMatchObject({ due: 1, sessions: 2 });
  });

  test('singular wording', () => {
    const one = withSession(task('x', { dueDate: on(18) }), on(18, 9), 60);
    expect(classWeekLabel(classWeekSummary(psy, [one], now)!)).toContain('1 due · 1 session planned');
  });
});
