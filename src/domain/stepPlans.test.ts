import { addDays, lastPlanDay, planSteps, shiftStepDay, STEP_TEMPLATES, StepTemplate } from './stepPlans';

const MON = new Date(2026, 10, 16, 19, 30); // Mon 16 Nov, evening
const day = (date: number) => new Date(2026, 10, date);
const template = (id: string) => STEP_TEMPLATES.find(t => t.id === id)!;
const days = (plan: { day: Date }[]) => plan.map(step => step.day.getDate());

describe('step lists', () => {
  test('the three lists SNFolio comes with', () => {
    expect(STEP_TEMPLATES.map(t => t.name)).toEqual(['Paper or project', 'Discussion post', 'Reading']);
    expect(template('paper').steps.map(s => s.title)).toEqual(['Read and gather', 'Outline', 'Draft', 'Revise', 'Submit']);
    expect(template('discussion').steps.map(s => s.title)).toEqual(['Read and watch', 'Draft initial post', 'Post initial', 'Reply to peers']);
    expect(template('reading').steps.map(s => s.title)).toEqual(['Read sections', 'Recall notes from memory', 'Review against the text']);
  });
});

describe('spreading steps before the deadline', () => {
  test('evenly from today, the last step the day before it is due', () => {
    // Due Sun 22: steps run Mon 16 to Sat 21.
    const plan = planSteps(template('paper'), MON, day(22));
    expect(days(plan)).toEqual([16, 17, 19, 20, 21]);
    expect(plan.map(step => step.title)[4]).toBe('Submit');
    expect(plan.every(step => step.day.getHours() === 0)).toBe(true);
  });

  test('with more steps than days, several share a day in order', () => {
    // Due Thu 19: Mon 16 to Wed 18.
    expect(days(planSteps(template('paper'), MON, day(19)))).toEqual([16, 17, 17, 18, 18]);
  });

  test('due tomorrow or already past, everything lands today', () => {
    expect(days(planSteps(template('discussion'), MON, day(17)))).toEqual([16, 16, 16, 16]);
    expect(days(planSteps(template('discussion'), MON, day(10)))).toEqual([16, 16, 16, 16]);
    expect(lastPlanDay(MON, day(10)).getDate()).toBe(16);
  });

  test('a single step goes on the buffer day', () => {
    const one: StepTemplate = { id: 'x', name: 'x', steps: [{ title: 'Do it', minutes: 30 }] };
    expect(days(planSteps(one, MON, day(22)))).toEqual([21]);
  });

  test('each step keeps its session length', () => {
    expect(planSteps(template('reading'), MON, day(22)).map(s => s.minutes)).toEqual([90, 30, 30]);
  });

  test('works across a month end', () => {
    expect(planSteps(template('reading'), new Date(2026, 10, 29), new Date(2026, 11, 4)).map(s => s.day.toDateString()))
      .toEqual([new Date(2026, 10, 29), new Date(2026, 11, 1), new Date(2026, 11, 3)].map(d => d.toDateString()));
  });
});

describe('moving a step to another day', () => {
  test('a day either way', () => {
    expect(shiftStepDay(day(18), 1, MON, day(22)).getDate()).toBe(19);
    expect(shiftStepDay(day(18), -1, MON, day(22)).getDate()).toBe(17);
  });

  test('never before today, and up to the deadline itself', () => {
    expect(shiftStepDay(day(16), -1, MON, day(22)).getDate()).toBe(16);
    expect(shiftStepDay(day(21), 1, MON, day(22)).getDate()).toBe(22);
    expect(shiftStepDay(day(22), 1, MON, day(22)).getDate()).toBe(22);
  });

  test('a past deadline keeps the step on today', () => {
    expect(shiftStepDay(day(16), 1, MON, day(10)).getDate()).toBe(16);
  });

  test('addDays is calendar days', () => {
    expect(addDays(day(30), 2).getDate()).toBe(2);
  });
});
