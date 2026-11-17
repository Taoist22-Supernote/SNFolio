import { classWeekCount, classWeekNumber, classWeekRange, classWeekStartDay } from './linkedFileWeeks';
import { isDone } from './taskModel';
import { CalendarTask, Project, WorkSession } from './types';
import { sessionsOf } from './workBlocks';

/**
 * Where a Project is in its weeks, shown at the top of the Project
 * (CT, 2026-11-17). Weeks were set up and used deep in Project settings,
 * where they were hard to find, and nothing in the Project said which week
 * it was or what that week held. This is the line that does both.
 */

/**
 * One task on one day of the week: due that day, planned that day, or both.
 * A step planned on the day it is due is one row, not a deadline row and a
 * session row (CT, 2026-11-17: the two read as duplicates).
 */
export interface WeekItem {
  /** Midnight of the day. */
  day: Date;
  task: CalendarTask;
  /** True when the task is due this day. */
  due: boolean;
  /** Its open sessions this day, earliest first. */
  sessions: WorkSession[];
}

export type ClassWeekSummary =
  /** A Class without a start date: the line offers to set one. */
  | { state: 'unset' }
  | { state: 'before'; starts: Date }
  | {
    state: 'during';
    week: number;
    /** Undefined when the Project has no due date to end its weeks. */
    weekCount?: number;
    start: Date;
    end: Date;
    /** Open tasks due this week. */
    due: number;
    /** Open sessions planned this week. */
    sessions: number;
    items: WeekItem[];
  }
  | { state: 'after'; weekCount: number };

export function classWeekSummary(
  project: Project,
  tasks: CalendarTask[],
  now: Date,
): ClassWeekSummary | undefined {
  const start = project.classStartDate;
  if (!start) {return project.category === 'class' ? { state: 'unset' } : undefined;}

  const weekStart = classWeekStartDay(start, project.classWeekStartsOn);
  const week = classWeekNumber(now, start, weekStart);
  const weekCount = project.dueDate ? classWeekCount(start, project.dueDate, weekStart) : undefined;
  if (week < 1) {return { state: 'before', starts: new Date(start.getFullYear(), start.getMonth(), start.getDate()) };}
  if (weekCount !== undefined && week > weekCount) {return { state: 'after', weekCount };}

  const range = classWeekRange(week, start, weekStart);
  const from = range.start.getTime();
  const until = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate() + 1).getTime();
  const inWeek = (date: Date) => date.getTime() >= from && date.getTime() < until;

  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const rows = new Map<string, WeekItem>();
  const rowFor = (task: CalendarTask, date: Date): WeekItem => {
    const day = midnight(date);
    const key = `${task.uid}|${day.getTime()}`;
    const row = rows.get(key) ?? { day, task, due: false, sessions: [] };
    rows.set(key, row);
    return row;
  };
  let due = 0;
  let sessions = 0;
  for (const task of tasks) {
    if (isDone(task)) {continue;}
    if (task.dueDate && inWeek(task.dueDate)) {
      rowFor(task, task.dueDate).due = true;
      due += 1;
    }
    for (const session of sessionsOf(task)) {
      if (!session.done && inWeek(session.start)) {
        rowFor(task, session.start).sessions.push(session);
        sessions += 1;
      }
    }
  }
  // Day order; within a day, deadlines with no time lead, then by start time.
  const firstTime = (row: WeekItem) => row.sessions.length
    ? Math.min(...row.sessions.map(session => session.start.getTime()))
    : row.day.getTime();
  const items = [...rows.values()];
  items.forEach(row => row.sessions.sort((a, b) => a.start.getTime() - b.start.getTime()));
  items.sort((a, b) => a.day.getTime() - b.day.getTime()
    || firstTime(a) - firstTime(b)
    || a.task.title.localeCompare(b.task.title));

  return {
    state: 'during',
    week,
    weekCount,
    start: range.start,
    end: range.end,
    due,
    sessions,
    items,
  };
}

const shortDay = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "📆 Week 4 of 9 · Nov 16 – 22 · 3 due · 5 sessions planned", and the other states. */
export function classWeekLabel(summary: ClassWeekSummary): string {
  switch (summary.state) {
    case 'unset':
      return '📆 Weeks not set · Set start date';
    case 'before':
      return `📆 Starts ${summary.starts.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · Week 1`;
    case 'after':
      return `📆 Finished · ${summary.weekCount} week${summary.weekCount === 1 ? '' : 's'}`;
    case 'during': {
      const of = summary.weekCount ? ` of ${summary.weekCount}` : '';
      const sameMonth = summary.start.getMonth() === summary.end.getMonth();
      const span = `${shortDay(summary.start)} – ${sameMonth ? summary.end.getDate() : shortDay(summary.end)}`;
      const sessions = `${summary.sessions} session${summary.sessions === 1 ? '' : 's'} planned`;
      return `📆 Week ${summary.week}${of} · ${span} · ${summary.due} due · ${sessions}`;
    }
  }
}
