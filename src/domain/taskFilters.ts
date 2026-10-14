import { CalendarEvent, CalendarTask } from './types';

/**
 * Groups tasks for a single day's view.
 *
 * Overdue tasks keep their original due date — nothing is silently rewritten —
 * and instead surface in a Past Due section so they cannot be lost. That
 * section, and the undated pool, only appear when looking at today: showing
 * "past due" while browsing a future day would be nonsense, and repeating the
 * undated pool on every day would just be noise.
 */
export interface SectionedTasks {
  pastDue: CalendarTask[];
  dueToday: CalendarTask[];
  /**
   * Dated after the viewed day. Populated regardless of which day is being
   * viewed, so a month-grid strip has something to show — its two existing
   * pools, No Date and Past Due, are both empty for a tidy calendar, which
   * made the strip look broken rather than empty.
   */
  upcoming: CalendarTask[];
  noDate: CalendarTask[];
  completed: CalendarTask[];
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function byDueThenCreated(a: CalendarTask, b: CalendarTask): number {
  if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
    return a.order - b.order;
  }
  const aDue = a.dueDate ? a.dueDate.getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.dueDate ? b.dueDate.getTime() : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

export function sectionTasksForDay(
  tasks: CalendarTask[],
  viewedDay: Date,
  now: Date = new Date()
): SectionedTasks {
  const viewed = startOfDay(viewedDay);
  const today = startOfDay(now);
  const viewingToday = viewed.getTime() === today.getTime();

  const result: SectionedTasks = { pastDue: [], dueToday: [], upcoming: [], noDate: [], completed: [] };

  for (const task of tasks) {
    if (task.completed) {
      // Completed work belongs to the day it was finished. Tasks completed
      // before completedAt existed fall back to their due date so they are
      // not orphaned entirely.
      const stamp = task.completedAt ?? task.dueDate;
      if (stamp && isSameDay(stamp, viewed)) {
        result.completed.push(task);
      }
      continue;
    }

    if (!task.dueDate) {
      if (viewingToday) result.noDate.push(task);
      continue;
    }

    if (isSameDay(task.dueDate, viewed)) {
      result.dueToday.push(task);
    } else if (viewingToday && startOfDay(task.dueDate).getTime() < today.getTime()) {
      result.pastDue.push(task);
    } else if (startOfDay(task.dueDate).getTime() > viewed.getTime()) {
      result.upcoming.push(task);
    }
  }

  result.pastDue.sort(byDueThenCreated);
  result.dueToday.sort(byDueThenCreated);
  result.upcoming.sort(byDueThenCreated);
  result.noDate.sort(byDueThenCreated);
  result.completed.sort(byDueThenCreated);

  return result;
}

/**
 * Tasks to show on a month-grid cell: those due that day whatever their state
 * relative to today, plus anything completed that day so finished work is
 * visible where it happened. Undated tasks appear nowhere on a grid — there is
 * no day to place them on.
 */
export function tasksForCalendarDay(tasks: CalendarTask[], day: Date): CalendarTask[] {
  return tasks
    .filter(task => {
      if (task.completed) {
        const stamp = task.completedAt ?? task.dueDate;
        return Boolean(stamp && isSameDay(stamp, day));
      }
      return Boolean(task.dueDate && isSameDay(task.dueDate, day));
    })
    .sort((a, b) => {
      // Open work first — a cell full of struck-through items shouldn't bury
      // what still needs doing.
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return byDueThenCreated(a, b);
    });
}

/** Total items a day is showing, for the header summary. */
export function countOpenTasks(sections: SectionedTasks): number {
  return sections.pastDue.length + sections.dueToday.length + sections.noDate.length;
}


/**
 * Converts a legacy task — a CalendarEvent carrying isTask or the "[TASK] "
 * summary prefix — into a real CalendarTask. Tasks predate the dedicated type,
 * so stored data has to be lifted across on first load.
 */
export function taskFromLegacyEvent(event: CalendarEvent): CalendarTask {
  return {
    uid: event.uid,
    title: (event.summary || '').replace(/^\[TASK\]\s*/i, '').trim(),
    dueDate: event.start ? new Date(event.start) : undefined,
    completed: event.completed === true,
    completedAt: event.completed ? new Date(event.start) : undefined,
    createdAt: event.start ? new Date(event.start) : new Date(),
    notes: event.description,
  };
}

export function isLegacyTaskEvent(event: CalendarEvent): boolean {
  return event.isTask === true || /^\[TASK\]\s*/i.test(event.summary || '');
}

export interface MonthGroup {
  /** Sortable key, e.g. "2026-10". */
  key: string;
  label: string;
  tasks: CalendarTask[];
}

/**
 * Upcoming work broken into the months it falls in.
 *
 * Upcoming has no horizon — it is everything dated after the day being viewed —
 * so once a term of deadlines is in it the list runs to dozens and a flat run of
 * rows says nothing about how far away any of it is.
 *
 * The year is shown only when it is not the current one. Repeating "2026" down a
 * column of headings is noise; a January that belongs to next year is not.
 */
export function groupByMonth(tasks: CalendarTask[], now: Date): MonthGroup[] {
  const groups: MonthGroup[] = [];
  const index = new Map<string, MonthGroup>();

  for (const task of tasks) {
    if (!task.dueDate) continue;
    const due = new Date(task.dueDate);
    if (!Number.isFinite(due.getTime())) continue;

    const key = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}`;
    let group = index.get(key);
    if (!group) {
      group = {
        key,
        label: due.getFullYear() === now.getFullYear()
          ? due.toLocaleDateString('en-US', { month: 'long' })
          : due.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        tasks: [],
      };
      index.set(key, group);
      // Input order is preserved rather than re-sorted: the caller has already
      // sorted by due date, so months arrive in order.
      groups.push(group);
    }
    group.tasks.push(task);
  }

  return groups;
}
