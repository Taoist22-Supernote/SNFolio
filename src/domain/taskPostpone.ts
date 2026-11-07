import { CalendarTask } from './types';
import { isDone } from './taskModel';

/**
 * Pushing a task's deadline out, which is the edit people make most and the
 * one that costs the most presses: open the task, find the date field, open
 * the picker, navigate the month, select, save.
 *
 * Only the due date moves. A task's date is stored in `dueDate` alone —
 * taskToCaldavItem projects it onto the outbound VTODO's DUE — so nothing else
 * has to be kept in step, and `allDay` continues to decide whether the server
 * sees a date or a date-time.
 */
export interface PostponeOption {
  id: 'today' | 'day' | 'week';
  /** What the move is, in the words that fit this task's current date. */
  label: string;
  /** Where it lands, so the choice is never ambiguous. */
  dateLabel: string;
  date: Date;
}

const startOfDay = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

/**
 * The same clock time on another day.
 *
 * Preserved rather than normalised: a task due at 17:00 that moves to tomorrow
 * is still due at 17:00, and an all-day task keeps whatever time it was stored
 * with, since `allDay` and not the time is what the server is told.
 */
function sameTimeOn(day: Date, source: Date): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds()
  );
}

const addDays = (day: Date, days: number): Date =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);

const shortDate = (value: Date): string =>
  value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * Where this task could go, or nothing when postponing makes no sense.
 *
 * An undated task has no deadline to push, and a finished one has nothing
 * pending, so both return an empty list and the control is not offered at all
 * rather than offered and inert.
 *
 * Overdue tasks count forward from today, not from the date they missed:
 * "tomorrow" on a task that was due last week has to mean tomorrow, or the
 * option moves it from one past date to another. A task already in the future
 * counts from its own due date, where +1 week means a week later than planned.
 */
export function postponeOptions(task: CalendarTask, now: Date = new Date()): PostponeOption[] {
  if (!task.dueDate || isDone(task)) return [];

  const due = new Date(task.dueDate);
  if (!Number.isFinite(due.getTime())) return [];

  const today = startOfDay(now);
  const dueDay = startOfDay(due);
  const late = dueDay.getTime() < today.getTime();
  const anchor = late ? today : dueDay;
  // "Tomorrow" is only true when counting from today. A task due next month
  // moves by an interval instead, and saying so avoids implying it comes closer.
  const fromToday = late || dueDay.getTime() === today.getTime();

  const options: PostponeOption[] = [];

  if (late) {
    const date = sameTimeOn(today, due);
    options.push({ id: 'today', label: 'Today', dateLabel: shortDate(date), date });
  }

  const day = sameTimeOn(addDays(anchor, 1), due);
  options.push({
    id: 'day',
    label: fromToday ? 'Tomorrow' : '+1 day',
    dateLabel: shortDate(day),
    date: day,
  });

  const week = sameTimeOn(addDays(anchor, 7), due);
  options.push({
    id: 'week',
    label: fromToday ? 'Next week' : '+1 week',
    dateLabel: shortDate(week),
    date: week,
  });

  return options;
}

/**
 * The task moved to a day chosen freely, keeping the time of day it had.
 *
 * A date picker yields midnight. Without this, picking a date would silently
 * strip the 17:00 from a task due at 17:00, while the quick options above
 * preserve it — the same action with two different results.
 */
export function postponedToDay(task: CalendarTask, day: Date): CalendarTask {
  const due = task.dueDate ? new Date(task.dueDate) : undefined;
  const target = due && Number.isFinite(due.getTime()) ? sameTimeOn(day, due) : new Date(day);
  return postponedTask(task, target);
}

/** The task with its deadline moved. Status, notes and links are untouched. */
export function postponedTask(task: CalendarTask, to: Date): CalendarTask {
  return { ...task, dueDate: new Date(to) };
}

/** Whether this task can be postponed at all, for deciding to show the control. */
export function canPostpone(task: CalendarTask, now: Date = new Date()): boolean {
  return postponeOptions(task, now).length > 0;
}
