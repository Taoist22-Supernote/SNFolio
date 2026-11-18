import { isSameDay } from './taskFilters';
import { isDone } from './taskModel';
import { formatTimeOfDay, minutesFromDate, TimeFormat, TIME_STEP } from './timeOfDay';
import { CalendarEvent, CalendarTask, WorkSession } from './types';

/**
 * Planned work time: when a task gets done, as distinct from when it is due.
 *
 * A deadline alone left tasks in a list beside the day rather than in it.
 * Nothing on the schedule said "this is when the essay happens", so the
 * schedule filled with events and the tasks waited in a column that read as
 * less important (CT, 2026-11-15). A work block gives the task a place on the
 * hour grid, drawn alongside events and sharing their overlap columns, so a
 * planned task occupies the day the same way a meeting does.
 *
 * A task can have several sessions (CT, 2026-11-15): written work takes more
 * than one sitting. Each session is its own block and is ticked off on its
 * own; the task stays open until it is finished from its row.
 */

/** Lengths offered when planning, in minutes. */
export const WORK_DURATIONS = [15, 30, 45, 60, 90, 120, 180];
export const DEFAULT_WORK_MINUTES = 60;

/** Grid uids for work blocks, so they never collide with an event's uid. */
const WORK_UID_PREFIX = 'work:';

/** One session of one task: what the schedule draws as a block. */
export interface WorkBlock {
  task: CalendarTask;
  session: WorkSession;
}

function validSession(session: WorkSession | undefined): session is WorkSession {
  return !!session && session.start instanceof Date && !Number.isNaN(session.start.getTime());
}

/** The task's sessions, earliest first, with any unreadable ones left out. */
export function sessionsOf(task: CalendarTask): WorkSession[] {
  return (task.workSessions ?? [])
    .filter(validSession)
    .slice()
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id));
}

export function hasWorkTime(task: CalendarTask): boolean {
  return sessionsOf(task).length > 0;
}

/** Sessions still to do. A finished task has none, whatever its sessions say. */
export function openSessions(task: CalendarTask): WorkSession[] {
  return isDone(task) ? [] : sessionsOf(task).filter(session => !session.done);
}

export function minutesOf(session: WorkSession): number {
  const minutes = session.minutes;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_WORK_MINUTES;
}

/**
 * The length the planner opens on: the session's own when moving one, else
 * the task's last open session's, so an essay planned in 90-minute sittings
 * is planned that way again.
 */
export function defaultSessionMinutes(task: CalendarTask, session?: WorkSession): number {
  if (session) {return minutesOf(session);}
  const open = openSessions(task);
  return open.length > 0 ? minutesOf(open[open.length - 1]) : DEFAULT_WORK_MINUTES;
}

export function sessionEnd(session: WorkSession): Date {
  return new Date(session.start.getTime() + minutesOf(session) * 60_000);
}

/** A short id unused on this task. */
function nextSessionId(task: CalendarTask): string {
  const used = new Set((task.workSessions ?? []).map(session => session.id));
  let n = used.size + 1;
  while (used.has(`s${n}`)) {n += 1;}
  return `s${n}`;
}

/**
 * Adds a session, or moves one when `sessionId` names an existing one. Moving
 * a session keeps whether it was done: replanning a missed sitting reopens it
 * only because a missed one was never done.
 */
export function withSession(task: CalendarTask, start: Date, minutes: number, sessionId?: string): CalendarTask {
  const length = Math.max(TIME_STEP, Math.round(minutes));
  const sessions = task.workSessions ?? [];
  if (sessionId && sessions.some(session => session.id === sessionId)) {
    return {
      ...task,
      workSessions: sessions.map(session => session.id === sessionId
        ? { ...session, start: new Date(start), minutes: length }
        : session),
    };
  }
  return {
    ...task,
    workSessions: [...sessions, { id: nextSessionId(task), start: new Date(start), minutes: length }],
  };
}

export function withoutSession(task: CalendarTask, sessionId: string): CalendarTask {
  const rest = (task.workSessions ?? []).filter(session => session.id !== sessionId);
  const base = { ...task };
  delete (base as Partial<CalendarTask>).workSessions;
  return rest.length > 0 ? { ...base, workSessions: rest } : base;
}

export function withSessionDone(task: CalendarTask, sessionId: string, done: boolean): CalendarTask {
  return {
    ...task,
    workSessions: (task.workSessions ?? []).map(session => {
      if (session.id !== sessionId) {return session;}
      const plain: WorkSession = { id: session.id, start: session.start, minutes: session.minutes };
      return done ? { ...plain, done: true } : plain;
    }),
  };
}

/**
 * Ticking this session would leave the task with nothing else planned, so
 * the planner asks whether the task itself is finished (CT, 2026-11-16).
 * Ticking a block finishes only that session, which left a task with all its
 * work done still listed in Actionable Deliverables.
 */
export function ticksLastSession(task: CalendarTask, sessionId: string): boolean {
  const session = findSession(task, sessionId);
  if (!session || session.done || isDone(task)) {return false;}
  return openSessions(task).every(open => open.id === sessionId);
}

export function findSession(task: CalendarTask, sessionId: string | undefined): WorkSession | undefined {
  return sessionId ? sessionsOf(task).find(session => session.id === sessionId) : undefined;
}

/** Identifies one session across all tasks, e.g. for "ignore the one being moved". */
export function sessionKey(taskUid: string, sessionId: string): string {
  return `${taskUid}:${sessionId}`;
}

/**
 * Sessions planned on `day`, earliest first.
 *
 * Finished ones stay: a ticked-off block shows the morning went as planned,
 * and removing it would leave a hole that reads as free time.
 */
export function workBlocksForDay(tasks: CalendarTask[], day: Date): WorkBlock[] {
  const blocks: WorkBlock[] = [];
  for (const task of tasks) {
    for (const session of sessionsOf(task)) {
      if (isSameDay(session.start, day)) {blocks.push({ task, session });}
    }
  }
  return blocks.sort((a, b) =>
    a.session.start.getTime() - b.session.start.getTime() || a.task.uid.localeCompare(b.task.uid));
}

/** A work block in the shape the grid positions, so tasks and events share columns. */
export function workBlockEvent(block: WorkBlock): CalendarEvent {
  return {
    uid: `${WORK_UID_PREFIX}${sessionKey(block.task.uid, block.session.id)}`,
    summary: block.task.title,
    start: new Date(block.session.start),
    end: sessionEnd(block.session),
    allDay: false,
    attendees: [],
    isTask: true,
  };
}

export function isWorkBlockUid(uid: string): boolean {
  return uid.startsWith(WORK_UID_PREFIX);
}

/** The session key inside a work block's grid uid. */
export function sessionKeyOfWorkBlock(uid: string): string {
  return uid.slice(WORK_UID_PREFIX.length);
}

export type WorkBlockState = 'done' | 'now' | 'missed' | 'planned';

/**
 * Whether a block is happening, behind, or still ahead.
 *
 * The prompt the schedule was missing: a block in progress is drawn inverted
 * so it stands out at a glance on e-ink, and one whose time has passed with
 * the session still open says so instead of quietly sliding into the past.
 * A finished task finishes all its blocks.
 */
export function workBlockState(block: WorkBlock, now: Date): WorkBlockState {
  if (block.session.done || isDone(block.task)) {return 'done';}
  if (sessionEnd(block.session).getTime() <= now.getTime()) {return 'missed';}
  if (block.session.start.getTime() <= now.getTime()) {return 'now';}
  return 'planned';
}

/**
 * A session left unticked that was still ahead when its task was finished: the
 * task got done early and the sitting was never needed. The schedule shows it
 * ticked with its task, but it is not time worked, so Work Time leaves it out
 * (CT, 2026-11-17). A task finished with no recorded time keeps the old rule.
 */
export function sessionNotNeeded(block: WorkBlock): boolean {
  const finished = block.task.completedAt;
  return isDone(block.task) && !block.session.done && !!finished
    && block.session.start.getTime() >= finished.getTime();
}

/** Something that already claims time on a day, in minutes from midnight. */
export interface BusySpan {
  title: string;
  startMinute: number;
  endMinute: number;
  /** True for a planned work session, false for an event. */
  isWork: boolean;
}

/**
 * What already claims time on `day`: timed events and open work sessions.
 * All-day events claim no hours, and a finished session is no longer a plan,
 * so neither counts. Shared by the first-free-slot search and the overlap
 * warning, so the planner never suggests a slot it then warns about.
 */
function busyOnDay(day: Date, events: CalendarEvent[], tasks: CalendarTask[], ignoreSessionKey?: string): BusySpan[] {
  const busy: BusySpan[] = [];
  for (const event of events) {
    if (event.allDay || !isSameDay(event.start, day)) {continue;}
    const s = minutesFromDate(event.start);
    const e = isSameDay(event.end, day) ? minutesFromDate(event.end) : 24 * 60;
    busy.push({ title: event.summary, startMinute: s, endMinute: Math.max(e, s + TIME_STEP), isWork: false });
  }
  for (const { task, session } of workBlocksForDay(tasks, day)) {
    if (session.done || isDone(task) || sessionKey(task.uid, session.id) === ignoreSessionKey) {continue;}
    const s = minutesFromDate(session.start);
    busy.push({ title: task.title, startMinute: s, endMinute: s + minutesOf(session), isWork: true });
  }
  return busy;
}

/**
 * What a session at `start` for `minutes` would collide with, earliest
 * first. The planner warns with this but still saves (CT, 2026-11-15): the
 * grid already draws a clash side by side, so it is allowed, just no longer
 * silent. A task's other sessions count, so two sittings of the same essay
 * are not planned on top of each other.
 */
export function workOverlaps(
  start: Date,
  minutes: number,
  events: CalendarEvent[],
  tasks: CalendarTask[],
  ignoreSessionKey?: string,
): BusySpan[] {
  const from = minutesFromDate(start);
  const to = from + minutes;
  return busyOnDay(start, events, tasks, ignoreSessionKey)
    .filter(b => from < b.endMinute && b.startMinute < to)
    .sort((a, b) => a.startMinute - b.startMinute || a.title.localeCompare(b.title));
}

/**
 * What a block on the Schedule clashes with: the same check as the planner's
 * warning, so a clash that arrives after planning (a CalDAV sync, a class
 * added later) is marked on the block rather than only drawn side by side.
 * Only a block still to do or in progress is marked: a finished one is no
 * longer a plan, and a missed one already says MISSED.
 */
export function blockClashes(block: WorkBlock, events: CalendarEvent[], blocks: WorkBlock[], now: Date): BusySpan[] {
  const state = workBlockState(block, now);
  if (state !== 'planned' && state !== 'now') {
    return [];
  }
  const tasks = [...new Map(blocks.map(b => [b.task.uid, b.task])).values()];
  return workOverlaps(block.session.start, minutesOf(block.session), events, tasks, sessionKey(block.task.uid, block.session.id));
}

/**
 * The first gap on `day` long enough for `minutes` of work.
 *
 * Starts at the top of the visible grid, or at the next quarter hour if the
 * day is today — offering a slot that has already gone is no help. Timed
 * events and open work sessions count as busy; all-day events do not, since
 * they claim no hours. Falls back to the earliest candidate start when the
 * day is full, so the planner still opens somewhere sensible.
 */
export function suggestWorkStart(
  day: Date,
  events: CalendarEvent[],
  tasks: CalendarTask[],
  minutes: number,
  now: Date,
  startHour = 8,
  endHour = 20,
  ignoreSessionKey?: string,
): Date {
  const base = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  let earliest = startHour * 60;
  if (isSameDay(day, now)) {
    const next = Math.ceil(minutesFromDate(now) / TIME_STEP) * TIME_STEP;
    earliest = Math.max(earliest, next);
  }
  const latestEnd = Math.min(24 * 60, Math.max(earliest + minutes, (endHour + 1) * 60));

  const busy = busyOnDay(day, events, tasks, ignoreSessionKey);
  for (let start = earliest; start + minutes <= latestEnd; start += TIME_STEP) {
    const end = start + minutes;
    if (!busy.some(b => start < b.endMinute && b.startMinute < end)) {
      return new Date(base.getTime() + start * 60_000);
    }
  }
  return new Date(base.getTime() + Math.min(earliest, 23 * 60) * 60_000);
}

/**
 * The session a task row should name: the first open one on the day being
 * viewed, else the next open one after it, else the latest open one (a missed
 * sitting still waiting to be replanned).
 */
export function sessionToShow(task: CalendarTask, viewedDay: Date): WorkSession | undefined {
  const open = openSessions(task);
  if (open.length === 0) {return undefined;}
  const dayStart = new Date(viewedDay.getFullYear(), viewedDay.getMonth(), viewedDay.getDate()).getTime();
  return open.find(session => isSameDay(session.start, viewedDay))
    ?? open.find(session => session.start.getTime() >= dayStart)
    ?? open[open.length - 1];
}

/**
 * Short label for a task row: "⏱ 2:00 PM" when its next session is on the day
 * being viewed, "⏱ Tue 2:00 PM" when on another, with "+2" for further open
 * sessions. Empty when nothing open is planned.
 */
export function workTimeLabel(task: CalendarTask, viewedDay: Date, format: TimeFormat = '12h'): string {
  const shown = sessionToShow(task, viewedDay);
  if (!shown) {return '';}
  const time = formatTimeOfDay(minutesFromDate(shown.start), format);
  const others = openSessions(task).length - 1;
  const more = others > 0 ? ` +${others}` : '';
  if (isSameDay(shown.start, viewedDay)) {return `⏱ ${time}${more}`;}
  const weekday = shown.start.toLocaleDateString('en-US', { weekday: 'short' });
  return `⏱ ${weekday} ${time}${more}`;
}

/**
 * Reads the stored form, old or new, into sessions. 0.1.33 stored one
 * workStart/workMinutes pair on the task; that becomes session "s1". Dates
 * arrive as strings from JSON. Anything unreadable is dropped rather than
 * stopping the task from loading.
 */
export function reviveWorkSessions(raw: any): WorkSession[] | undefined {
  const sessions: WorkSession[] = [];
  if (Array.isArray(raw?.workSessions)) {
    for (const item of raw.workSessions) {
      const start = item?.start ? new Date(item.start) : undefined;
      if (!start || Number.isNaN(start.getTime()) || typeof item.id !== 'string' || !item.id) {continue;}
      const session: WorkSession = {
        id: item.id,
        start,
        minutes: Number.isFinite(item.minutes) && item.minutes > 0 ? item.minutes : DEFAULT_WORK_MINUTES,
      };
      if (item.done === true) {session.done = true;}
      sessions.push(session);
    }
  } else if (raw?.workStart) {
    const start = new Date(raw.workStart);
    if (!Number.isNaN(start.getTime())) {
      const minutes = raw.workMinutes;
      sessions.push({
        id: 's1',
        start,
        minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_WORK_MINUTES,
      });
    }
  }
  return sessions.length > 0 ? sessions : undefined;
}
