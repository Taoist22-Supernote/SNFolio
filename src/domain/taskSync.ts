import { CalendarEvent, CalendarTask } from './types';
import { taskStatus, withStatus } from './taskModel';

export function normaliseCollectionUrl(url?: string): string {
  const trimmed = (url || '').trim();
  return trimmed ? `${trimmed.replace(/\/+$/, '')}/` : '';
}

export function inferTaskCollectionUrl(resourceUrl?: string): string | undefined {
  if (!resourceUrl) {
    return undefined;
  }
  const clean = resourceUrl.split(/[?#]/, 1)[0];
  const slash = clean.lastIndexOf('/');
  return slash >= 0 ? normaliseCollectionUrl(clean.slice(0, slash + 1)) : undefined;
}

export function taskSourceCollection(task: CalendarTask): string | undefined {
  return task.caldavCollectionUrl
    ? normaliseCollectionUrl(task.caldavCollectionUrl)
    : inferTaskCollectionUrl(task.caldavUrl);
}

/** Device-only tasks may join the active list; server-backed tasks may not move implicitly. */
export function taskBelongsToCollection(task: CalendarTask, collectionUrl: string): boolean {
  const source = taskSourceCollection(task);
  return !source || source === normaliseCollectionUrl(collectionUrl);
}

export function taskToCaldavItem(task: CalendarTask): CalendarEvent {
  const due = task.dueDate ? new Date(task.dueDate) : new Date(0);
  return {
    uid: task.uid,
    summary: task.title,
    description: task.notes,
    start: due,
    end: task.dueDate ? new Date(due.getTime() + 30 * 60 * 1000) : new Date(0),
    allDay: task.dueDate ? task.allDay !== false : true,
    attendees: [],
    isTask: true,
    undatedTask: !task.dueDate,
    completed: task.completed,
    priority: task.priority,
    parentUid: task.parentId,
    caldavUrl: task.caldavUrl,
    etag: task.etag,
  };
}

export function taskFromCaldavItem(
  item: CalendarEvent,
  existing?: CalendarTask,
  collectionUrl?: string
): CalendarTask {
  const base: CalendarTask = {
    uid: item.uid,
    title: item.summary.replace(/^\[TASK\]\s*/i, '').trim(),
    dueDate: item.undatedTask ? undefined : new Date(item.start),
    allDay: item.allDay,
    // A task cannot be its own parent; a server that says so is ignored
    // rather than producing a row that nests inside itself.
    parentId: item.parentUid && item.parentUid !== item.uid ? item.parentUid : undefined,
    completed: item.completed === true,
    createdAt: existing?.createdAt || new Date(),
    notes: item.description,
    priority: item.priority,
    caldavUrl: item.caldavUrl,
    etag: item.etag,
    caldavCollectionUrl: collectionUrl
      ? normaliseCollectionUrl(collectionUrl)
      : existing?.caldavCollectionUrl || inferTaskCollectionUrl(item.caldavUrl),
  };
  return withStatus(base, item.completed ? 'done' : existing ? taskStatus(existing) === 'in-progress' ? 'in-progress' : 'todo' : 'todo');
}

/**
 * A task in the shape the creation form speaks.
 *
 * The form was built for events and edits tasks by projecting them into that
 * shape, diverting back to the task store on save by uid. Shared so that the
 * screen and the form itself project a task identically — two slightly
 * different projections of the same task is a bug waiting on a field nobody
 * compares.
 */
export function taskAsFormEvent(task: CalendarTask): CalendarEvent {
  const due = task.dueDate ? new Date(task.dueDate) : undefined;
  return {
    uid: task.uid,
    summary: `[TASK] ${task.title}`,
    isTask: true,
    completed: task.completed,
    description: task.notes,
    start: due ?? new Date(),
    end: due ?? new Date(),
    // An undated task opens as all-day; giving it a date is what moves it out
    // of the No Date section.
    allDay: !due || task.allDay !== false,
    attendees: [],
  };
}
