import { CalendarTask, Project } from './types';
import { WeekRange } from './plannerReview';
import { minutesOf, sessionNotNeeded, sessionsOf, WorkBlock, workBlockState } from './workBlocks';

/**
 * Planned against done, for the Weekly Review (CT, 2026-11-15).
 *
 * "Done" is the planned length of the sessions that were ticked off, not time
 * measured: SNFolio has no timer, so a ticked 90-minute block counts as 90
 * minutes. The point is to see where the week's plan went, not to log hours.
 * Sessions a task no longer needed, because it was finished before they came
 * round, are left out altogether: neither planned nor done.
 */
export interface ProjectWorkTime {
  /** Undefined for the "No project" row. */
  project?: Project;
  plannedMinutes: number;
  doneMinutes: number;
}

export interface WorkWeekSummary {
  /** Every session this week, whatever happened to it. */
  plannedMinutes: number;
  /** Ticked sessions, and a finished task's sessions up to when it was finished. */
  doneMinutes: number;
  /** Time passed, still open: what Replan is for. */
  missedMinutes: number;
  /** In progress or still to come. */
  aheadMinutes: number;
  /** One row per Project with work this week, most planned first; "No project" last. */
  byProject: ProjectWorkTime[];
  /** Missed sessions, earliest first. */
  missed: WorkBlock[];
}

export function workWeekSummary(
  tasks: CalendarTask[],
  range: WeekRange,
  now: Date,
  projects: Project[],
  projectOf: (uid: string) => string | undefined,
): WorkWeekSummary {
  const summary: WorkWeekSummary = {
    plannedMinutes: 0, doneMinutes: 0, missedMinutes: 0, aheadMinutes: 0, byProject: [], missed: [],
  };
  const projectById = new Map(projects.map(project => [project.id, project]));
  const rows = new Map<string, ProjectWorkTime>();
  const NO_PROJECT = '';

  for (const task of tasks) {
    for (const session of sessionsOf(task)) {
      const at = session.start.getTime();
      if (at < range.start.getTime() || at >= range.endExclusive.getTime()) {continue;}
      if (sessionNotNeeded({ task, session })) {continue;}
      const minutes = minutesOf(session);
      const state = workBlockState({ task, session }, now);
      summary.plannedMinutes += minutes;
      if (state === 'done') {summary.doneMinutes += minutes;}
      else if (state === 'missed') {
        summary.missedMinutes += minutes;
        summary.missed.push({ task, session });
      } else {summary.aheadMinutes += minutes;}

      // A task filed under a Project that no longer exists counts as none.
      const projectId = projectOf(task.uid);
      const project = projectId ? projectById.get(projectId) : undefined;
      const key = project?.id ?? NO_PROJECT;
      const row = rows.get(key) ?? { project, plannedMinutes: 0, doneMinutes: 0 };
      row.plannedMinutes += minutes;
      if (state === 'done') {row.doneMinutes += minutes;}
      rows.set(key, row);
    }
  }

  summary.byProject = [...rows.values()].sort((a, b) => {
    if (!a.project !== !b.project) {return a.project ? -1 : 1;}
    return b.plannedMinutes - a.plannedMinutes || (a.project?.name ?? '').localeCompare(b.project?.name ?? '');
  });
  summary.missed.sort((a, b) =>
    a.session.start.getTime() - b.session.start.getTime() || a.task.title.localeCompare(b.task.title));
  return summary;
}
