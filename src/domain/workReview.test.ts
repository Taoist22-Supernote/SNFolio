import { workWeekSummary } from './workReview';
import { plannerWeekRange } from './plannerReview';
import { withSession, withSessionDone } from './workBlocks';
import { CalendarTask, Project } from './types';

// Week of Mon 16 – Sun 22 Nov 2026, looked at on Wed 18 at noon.
const range = plannerWeekRange(new Date(2026, 10, 18), 1);
const now = new Date(2026, 10, 18, 12);
const on = (day: number, hour: number) => new Date(2026, 10, day, hour);

const ids105: Project = { id: 'ids', name: 'IDS105', status: 'active', createdAt: new Date() } as Project;
const acct: Project = { id: 'acct', name: 'ACCT201', status: 'active', createdAt: new Date() } as Project;
const projects = [ids105, acct];

function task(uid: string, over: Partial<CalendarTask> = {}): CalendarTask {
  return { uid, title: uid, completed: false, status: 'todo', createdAt: new Date(), ...over };
}

const essay = withSessionDone(
  withSession(withSession(withSession(task('essay', { title: 'Essay' }), on(16, 9), 90), on(17, 9), 60), on(20, 9), 90),
  's1', true,
); // Mon 90 done, Tue 60 missed, Fri 90 ahead
const reading = withSession(task('reading', { title: 'Chapter 9' }), on(18, 11), 120); // in progress at noon
const loose = withSession(task('loose', { title: 'Loose end' }), on(16, 14), 30); // missed, no project
const finished = withSession(task('lab', { title: 'Lab', completed: true, status: 'done' }), on(17, 14), 45); // task done
const lastWeek = withSession(task('old'), on(13, 9), 60);
const nextWeek = withSession(task('next'), on(23, 9), 60);
const unplanned = task('none');

const projectOf = (uid: string) => ({ essay: 'ids', reading: 'acct', lab: 'acct', ghost: 'deleted' } as Record<string, string>)[uid];
const all = [essay, reading, loose, finished, lastWeek, nextWeek, unplanned];

describe('work time this week', () => {
  const summary = workWeekSummary(all, range, now, projects, projectOf);

  test('totals: planned, done, missed and ahead, this week only', () => {
    expect(summary.plannedMinutes).toBe(90 + 60 + 90 + 120 + 30 + 45);
    expect(summary.doneMinutes).toBe(90 + 45);
    expect(summary.missedMinutes).toBe(60 + 30);
    expect(summary.aheadMinutes).toBe(90 + 120);
    expect(summary.doneMinutes + summary.missedMinutes + summary.aheadMinutes).toBe(summary.plannedMinutes);
  });

  test('a session of a finished task counts as done even if it was never ticked', () => {
    const only = workWeekSummary([finished], range, now, projects, projectOf);
    expect(only).toMatchObject({ plannedMinutes: 45, doneMinutes: 45, missedMinutes: 0 });
  });

  test('one row per Project, most planned first, with No project last', () => {
    expect(summary.byProject.map(row => [row.project?.name ?? 'No project', row.plannedMinutes, row.doneMinutes])).toEqual([
      ['IDS105', 240, 90],
      ['ACCT201', 165, 45],
      ['No project', 30, 0],
    ]);
  });

  test('a task filed under a Project that no longer exists counts as No project', () => {
    const ghost = withSession(task('ghost'), on(19, 9), 60);
    const rows = workWeekSummary([ghost], range, now, projects, projectOf).byProject;
    expect(rows).toEqual([{ project: undefined, plannedMinutes: 60, doneMinutes: 0 }]);
  });

  test('missed sessions, earliest first, each naming its task and session', () => {
    expect(summary.missed.map(b => [b.task.uid, b.session.id])).toEqual([['loose', 's1'], ['essay', 's2']]);
  });

  test('an unplanned week is all zeros with no rows', () => {
    expect(workWeekSummary([unplanned, lastWeek], range, now, projects, projectOf)).toEqual({
      plannedMinutes: 0, doneMinutes: 0, missedMinutes: 0, aheadMinutes: 0, byProject: [], missed: [],
    });
  });
});
