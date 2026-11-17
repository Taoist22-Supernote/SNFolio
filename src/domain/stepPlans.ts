/**
 * Plan an assignment from a list of steps (CT, 2026-11-17).
 *
 * The difficulty was not doing the work but knowing what had to be on the
 * list: an assignment sat as one task until the last day, because nothing
 * broke it into sittings. A step list turns it into subtasks, each with its
 * own day and a planned session, spread from today to the day before it is
 * due so the last step lands with a day to spare.
 *
 * Nothing is added until the plan has been seen: every step can be renamed,
 * moved to another day or dropped first.
 */

export interface StepTemplate {
  id: string;
  name: string;
  /** Each step and the length of the session it gets, in minutes. */
  steps: { title: string; minutes: number }[];
}

export const STEP_TEMPLATES: StepTemplate[] = [
  {
    id: 'paper',
    name: 'Paper or project',
    steps: [
      { title: 'Read and gather', minutes: 90 },
      { title: 'Outline', minutes: 60 },
      { title: 'Draft', minutes: 120 },
      { title: 'Revise', minutes: 60 },
      { title: 'Submit', minutes: 30 },
    ],
  },
  {
    id: 'discussion',
    name: 'Discussion post',
    steps: [
      { title: 'Read and watch', minutes: 90 },
      { title: 'Draft initial post', minutes: 60 },
      { title: 'Post initial', minutes: 30 },
      { title: 'Reply to peers', minutes: 45 },
    ],
  },
  {
    id: 'reading',
    name: 'Reading',
    steps: [
      { title: 'Read sections', minutes: 90 },
      { title: 'Recall notes from memory', minutes: 30 },
      { title: 'Review against the text', minutes: 30 },
    ],
  },
];

export interface PlannedStep {
  title: string;
  /** Midnight of the day the step is due and its session is planned. */
  day: Date;
  minutes: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function midnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole days from `a` to `b`, both taken at midnight; DST-safe. */
function daysBetween(a: Date, b: Date): number {
  return Math.round((midnight(b).getTime() - midnight(a).getTime()) / DAY_MS);
}

export function addDays(day: Date, count: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + count);
}

/**
 * The last day a step may land on: the day before the deadline, or today when
 * that has already passed (a plan made the day before, or late, still has
 * somewhere to go).
 */
export function lastPlanDay(today: Date, due: Date): Date {
  const dayBefore = addDays(midnight(due), -1);
  return daysBetween(today, dayBefore) < 0 ? midnight(today) : dayBefore;
}

/**
 * Spreads the steps evenly from today to the day before `due`. The first step
 * is today and the last is on the buffer day; with more steps than days,
 * several share a day, in order.
 */
export function planSteps(template: StepTemplate, today: Date, due: Date): PlannedStep[] {
  const first = midnight(today);
  const span = daysBetween(first, lastPlanDay(today, due));
  const count = template.steps.length;
  return template.steps.map((step, index) => ({
    title: step.title,
    minutes: step.minutes,
    day: addDays(first, count === 1 ? span : Math.round((index * span) / (count - 1))),
  }));
}

/**
 * Moves one step a day earlier or later, kept between today and the deadline
 * itself (the buffer is a default, not a rule).
 */
export function shiftStepDay(day: Date, by: number, today: Date, due: Date): Date {
  const moved = addDays(day, by);
  if (daysBetween(today, moved) < 0) {return midnight(today);}
  if (daysBetween(moved, due) < 0) {return midnight(due) < midnight(today) ? midnight(today) : midnight(due);}
  return moved;
}
