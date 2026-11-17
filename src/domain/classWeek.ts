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

/** One thing in the week, in day order: a task due, or a planned session. */
export type WeekItem =
  | { kind: 'due'; at: Date; task: CalendarTask }
  | { kind: 'session'; at: Date; task: CalendarTask; session: WorkSession };

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

  const items: WeekItem[] = [];
  for (const task of tasks) {
    if (isDone(task)) {continue;}
    if (task.dueDate && inWeek(task.dueDate)) {items.push({ kind: 'due', at: task.dueDate, task });}
    for (const session of sessionsOf(task)) {
      if (!session.done && inWeek(session.start)) {items.push({ kind: 'session', at: session.start, task, session });}
    }
  }
  // Day order; on one day, an all-day deadline (midnight) leads, then by time.
  items.sort((a, b) => a.at.getTime() - b.at.getTime()
    || (a.kind === b.kind ? 0 : a.kind === 'due' ? -1 : 1)
    || a.task.title.localeCompare(b.task.title));

  return {
    state: 'during',
    week,
    weekCount,
    start: range.start,
    end: range.end,
    due: items.filter(item => item.kind === 'due').length,
    sessions: items.filter(item => item.kind === 'session').length,
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
