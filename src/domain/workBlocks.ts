import { isSameDay } from './taskFilters';
import { isDone } from './taskModel';
import { formatTimeOfDay, minutesFromDate, TimeFormat, TIME_STEP } from './timeOfDay';
import { CalendarEvent, CalendarTask } from './types';

/**
 * Planned work time: when a task gets done, as distinct from when it is due.
 *
 * A deadline alone left tasks in a list beside the day rather than in it.
 * Nothing on the schedule said "this is when the essay happens", so the
 * schedule filled with events and the tasks waited in a column that read as
 * less important (CT, 2026-11-15). A work block gives the task a place on the
 * hour grid, drawn alongside events and sharing their overlap columns, so a
 * planned task occupies the day the same way a meeting does.
 */

/** Lengths offered when planning, in minutes. */
export const WORK_DURATIONS = [15, 30, 45, 60, 90, 120, 180];
export const DEFAULT_WORK_MINUTES = 60;

/** Grid uids for work blocks, so they never collide with an event's uid. */
const WORK_UID_PREFIX = 'work:';

export function hasWorkTime(task: CalendarTask): task is CalendarTask & { workStart: Date; workMinutes: number } {
  return task.workStart instanceof Date && !Number.isNaN(task.workStart.getTime());
}

export function workMinutesOf(task: CalendarTask): number {
  const minutes = task.workMinutes ?? DEFAULT_WORK_MINUTES;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_WORK_MINUTES;
}

export function workEnd(task: CalendarTask): Date | undefined {
  if (!hasWorkTime(task)) return undefined;
  return new Date(task.workStart.getTime() + workMinutesOf(task) * 60_000);
}

export function withWorkTime(task: CalendarTask, start: Date, minutes: number): CalendarTask {
  return { ...task, workStart: new Date(start), workMinutes: Math.max(TIME_STEP, Math.round(minutes)) };
}

export function withoutWorkTime(task: CalendarTask): CalendarTask {
  const rest = { ...task };
  delete rest.workStart;
  delete rest.workMinutes;
  return rest;
}

/**
 * Tasks planned on `day`, earliest first.
 *
 * Finished ones stay: a ticked-off block shows the morning went as planned,
 * and removing it would leave a hole that reads as free time.
 */
export function workBlocksForDay(tasks: CalendarTask[], day: Date): CalendarTask[] {
  return tasks
    .filter(task => hasWorkTime(task) && isSameDay(task.workStart as Date, day))
    .sort((a, b) => (a.workStart as Date).getTime() - (b.workStart as Date).getTime());
}

/** A work block in the shape the grid positions, so tasks and events share columns. */
export function workBlockEvent(task: CalendarTask): CalendarEvent {
  const start = task.workStart ? new Date(task.workStart) : new Date(0);
  return {
    uid: `${WORK_UID_PREFIX}${task.uid}`,
    summary: task.title,
    start,
    end: workEnd(task) ?? start,
    allDay: false,
    attendees: [],
    isTask: true,
  };
}

export function isWorkBlockUid(uid: string): boolean {
  return uid.startsWith(WORK_UID_PREFIX);
}

export function taskUidOfWorkBlock(uid: string): string {
  return uid.slice(WORK_UID_PREFIX.length);
}

export type WorkBlockState = 'done' | 'now' | 'missed' | 'planned';

/**
 * Whether a block is happening, behind, or still ahead.
 *
 * The prompt the schedule was missing: a block in progress is drawn inverted
 * so it stands out at a glance on e-ink, and one whose time has passed with
 * the task still open says so instead of quietly sliding into the past.
 */
export function workBlockState(task: CalendarTask, now: Date): WorkBlockState {
  if (isDone(task)) return 'done';
  const end = workEnd(task);
  if (!hasWorkTime(task) || !end) return 'planned';
  if (end.getTime() <= now.getTime()) return 'missed';
  if (task.workStart.getTime() <= now.getTime()) return 'now';
  return 'planned';
}

/** Something that already claims time on a day, in minutes from midnight. */
export interface BusySpan {
  title: string;
  startMinute: number;
  endMinute: number;
  /** True for another task's work block, false for an event. */
  isWork: boolean;
}

/**
 * What already claims time on `day`: timed events and other open work blocks.
 * All-day events claim no hours, and a finished block is no longer a plan, so
 * neither counts. Shared by the first-free-slot search and the overlap
 * warning, so the planner never suggests a slot it then warns about.
 */
function busyOnDay(day: Date, events: CalendarEvent[], tasks: CalendarTask[], ignoreTaskUid?: string): BusySpan[] {
  const busy: BusySpan[] = [];
  for (const event of events) {
    if (event.allDay || !isSameDay(event.start, day)) continue;
    const s = minutesFromDate(event.start);
    const e = isSameDay(event.end, day) ? minutesFromDate(event.end) : 24 * 60;
    busy.push({ title: event.summary, startMinute: s, endMinute: Math.max(e, s + TIME_STEP), isWork: false });
  }
  for (const task of workBlocksForDay(tasks, day)) {
    if (task.uid === ignoreTaskUid || isDone(task)) continue;
    const s = minutesFromDate(task.workStart as Date);
    busy.push({ title: task.title, startMinute: s, endMinute: s + workMinutesOf(task), isWork: true });
  }
  return busy;
}

/**
 * What a planned block at `start` for `minutes` would collide with, earliest
 * first. The planner warns with this but still saves (CT, 2026-11-15): the
 * grid already draws a clash side by side, so it is allowed, just no longer
 * silent.
 */
export function workOverlaps(
  start: Date,
  minutes: number,
  events: CalendarEvent[],
  tasks: CalendarTask[],
  ignoreTaskUid?: string,
): BusySpan[] {
  const from = minutesFromDate(start);
  const to = from + minutes;
  return busyOnDay(start, events, tasks, ignoreTaskUid)
    .filter(b => from < b.endMinute && b.startMinute < to)
    .sort((a, b) => a.startMinute - b.startMinute || a.title.localeCompare(b.title));
}

/**
 * The first gap on `day` long enough for `minutes` of work.
 *
 * Starts at the top of the visible grid, or at the next quarter hour if the
 * day is today — offering a slot that has already gone is no help. Timed
 * events and other open work blocks count as busy; all-day events do not,
 * since they claim no hours. Falls back to the earliest candidate start when
 * the day is full, so the planner still opens somewhere sensible.
 */
export function suggestWorkStart(
  day: Date,
  events: CalendarEvent[],
  tasks: CalendarTask[],
  minutes: number,
  now: Date,
  startHour = 8,
  endHour = 20,
  ignoreTaskUid?: string,
): Date {
  const base = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  let earliest = startHour * 60;
  if (isSameDay(day, now)) {
    const next = Math.ceil(minutesFromDate(now) / TIME_STEP) * TIME_STEP;
    earliest = Math.max(earliest, next);
  }
  const latestEnd = Math.min(24 * 60, Math.max(earliest + minutes, (endHour + 1) * 60));

  const busy = busyOnDay(day, events, tasks, ignoreTaskUid).map(b => [b.startMinute, b.endMinute]);

  for (let start = earliest; start + minutes <= latestEnd; start += TIME_STEP) {
    const end = start + minutes;
    if (!busy.some(([s, e]) => start < e && s < end)) {
      return new Date(base.getTime() + start * 60_000);
    }
  }
  return new Date(base.getTime() + Math.min(earliest, 23 * 60) * 60_000);
}

/**
 * Short label for a task row: "⏱ 2:00 PM" when planned on the day being
 * viewed, "⏱ Tue 2:00 PM" when on another. Empty when nothing is planned.
 */
export function workTimeLabel(task: CalendarTask, viewedDay: Date, format: TimeFormat = '12h'): string {
  if (!hasWorkTime(task)) return '';
  const time = formatTimeOfDay(minutesFromDate(task.workStart), format);
  if (isSameDay(task.workStart, viewedDay)) return `⏱ ${time}`;
  const weekday = task.workStart.toLocaleDateString('en-US', { weekday: 'short' });
  return `⏱ ${weekday} ${time}`;
}
