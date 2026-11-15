import {
  inferTaskCollectionUrl,
  taskBelongsToCollection,
  taskAsFormEvent,
  taskFromCaldavItem,
  taskToCaldavItem,
} from './taskSync';
import { CalendarEvent, CalendarTask } from './types';

describe('task CalDAV conversion', () => {
  test('preserves due date, completion, priority and notes', () => {
    const due = new Date(2026, 7, 20, 15, 30);
    const item = taskToCaldavItem({
      uid: 't1', title: 'Ship release', dueDate: due, completed: true,
      status: 'done', priority: 4, notes: 'Double check package', createdAt: new Date(),
    });
    expect(item.isTask).toBe(true);
    expect(item.completed).toBe(true);
    expect(item.priority).toBe(4);
    const task = taskFromCaldavItem(item);
    expect(task.dueDate).toEqual(due);
    expect(task.status).toBe('done');
    expect(task.notes).toBe('Double check package');
  });

  test('a sync keeps the work time planned on the device', () => {
    // The server has no field for it, so the incoming copy never carries one;
    // rebuilding from it alone would take every planned task off the schedule.
    const existing: CalendarTask = {
      uid: 't3', title: 'Essay', completed: false, createdAt: new Date(),
      dueDate: new Date(2026, 10, 20), workStart: new Date(2026, 10, 17, 14), workMinutes: 90,
    };
    const incoming = taskToCaldavItem({ ...existing, title: 'Essay (renamed)' });
    const synced = taskFromCaldavItem(incoming, existing);
    expect(synced.title).toBe('Essay (renamed)');
    expect(synced.workStart).toEqual(new Date(2026, 10, 17, 14));
    expect(synced.workMinutes).toBe(90);
  });

  test('preserves an undated task without inventing a due date', () => {
    const item = taskToCaldavItem({
      uid: 't2', title: 'Someday', completed: false, createdAt: new Date(),
    });
    expect(item.undatedTask).toBe(true);
    expect(taskFromCaldavItem(item).dueDate).toBeUndefined();
  });

  test('ties an imported task to its source collection', () => {
    const collection = 'https://dav.example.test/user/tasks/';
    const task = taskFromCaldavItem({
      uid: 'remote', summary: 'Remote', start: new Date(0), end: new Date(0),
      allDay: true, attendees: [], isTask: true, undatedTask: true,
      caldavUrl: `${collection}remote.ics`,
    }, undefined, collection);

    expect(task.caldavCollectionUrl).toBe(collection);
    expect(taskBelongsToCollection(task, collection)).toBe(true);
    expect(taskBelongsToCollection(task, 'https://other.example.test/tasks/')).toBe(false);
  });

  test('infers ownership for tasks stored before collection tracking existed', () => {
    expect(inferTaskCollectionUrl('https://dav.example.test/tasks/old.ics?token=x'))
      .toBe('https://dav.example.test/tasks/');
  });
});


const subtaskItem = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  uid: 'todo-child',
  summary: 'Draft the appendix',
  start: new Date('2026-11-10T17:00:00Z'),
  end: new Date('2026-11-10T17:30:00Z'),
  allDay: false,
  attendees: [],
  isTask: true,
  ...over,
});

const subtaskTask = (over: Partial<CalendarTask> = {}): CalendarTask => ({
  uid: 'todo-child',
  title: 'Draft the appendix',
  completed: false,
  createdAt: new Date('2026-11-01T09:00:00'),
  ...over,
});

describe('a parent link survives a round trip', () => {
  test('an incoming subtask becomes a task with a parent', () => {
    expect(taskFromCaldavItem(subtaskItem({ parentUid: 'todo-parent' })).parentId).toBe('todo-parent');
  });

  test('a task with no parent link gets none', () => {
    expect(taskFromCaldavItem(subtaskItem()).parentId).toBeUndefined();
  });

  test('a server claiming a task is its own parent is ignored', () => {
    // It would otherwise render as a row nested inside itself.
    expect(taskFromCaldavItem(subtaskItem({ parentUid: 'todo-child' })).parentId).toBeUndefined();
  });

  test('an outgoing subtask carries its parent back to the server', () => {
    // The outbound VTODO is rebuilt from scratch, so anything not projected
    // here is destroyed on the server the next time this task is pushed.
    expect(taskToCaldavItem(subtaskTask({ parentId: 'todo-parent' })).parentUid).toBe('todo-parent');
  });

  test('ticking off or moving a subtask does not orphan it', () => {
    const stored = taskFromCaldavItem(subtaskItem({ parentUid: 'todo-parent' }));
    const pushedBack = taskToCaldavItem({ ...stored, completed: true });

    expect(pushedBack.parentUid).toBe('todo-parent');
  });
});

describe('taskAsFormEvent', () => {
  test('a dated task opens on its own due date', () => {
    const due = new Date('2026-11-10T17:00:00');
    const projected = taskAsFormEvent(subtaskTask({ dueDate: due, allDay: false }));

    expect(projected.start).toEqual(due);
    expect(projected.allDay).toBe(false);
    expect(projected.summary).toBe('[TASK] Draft the appendix');
    expect(projected.isTask).toBe(true);
  });

  test('an undated task opens as all-day, which is what No Date means here', () => {
    const projected = taskAsFormEvent(subtaskTask());
    expect(projected.allDay).toBe(true);
  });

  test('the uid is carried so a save overwrites rather than duplicating', () => {
    expect(taskAsFormEvent(subtaskTask()).uid).toBe('todo-child');
  });
});
