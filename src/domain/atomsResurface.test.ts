import {
  actionsFileText,
  dueResurfaceAtoms,
  parseAtomsActions,
  parseResurfaceSummary,
  sinceLabel,
  withAction,
} from './atomsResurface';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 200 * DAY;

function summaryText(over: Record<string, unknown> = {}) {
  const atom = (id: string, lastSeen: number) => ({
    id,
    title: `Idea ${id}`,
    words: 'words',
    lastSeen,
    source: { kind: 'pdf', path: '/storage/emulated/0/Document/Ch9.pdf', title: 'Ch9', page: 213 },
  });
  return JSON.stringify({
    app: 'Atoms',
    format: 1,
    writtenAt: NOW - DAY,
    resurfaceDays: 7,
    atoms: [atom('a', NOW - 90 * DAY), atom('b', NOW - 40 * DAY), atom('c', NOW - 10 * DAY), atom('d', NOW - 8 * DAY), atom('e', NOW - 2 * DAY)],
    ...over,
  });
}

describe('summary from Atoms', () => {
  it('reads a valid summary and rejects anything else', () => {
    const s = parseResurfaceSummary(summaryText());
    expect(s?.atoms.map(a => a.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(s?.atoms[0].source.page).toBe(213);
    expect(parseResurfaceSummary(null)).toBeNull();
    expect(parseResurfaceSummary('nope')).toBeNull();
    expect(parseResurfaceSummary(summaryText({ app: 'Shelf' }))).toBeNull();
    expect(parseResurfaceSummary(summaryText({ format: 2 }))).toBeNull();
  });

  it('shows the first three due, by the gap set in Atoms', () => {
    const s = parseResurfaceSummary(summaryText());
    expect(dueResurfaceAtoms(s, [], NOW).map(a => a.id)).toEqual(['a', 'b', 'c']);
    const month = parseResurfaceSummary(summaryText({ resurfaceDays: 30 }));
    expect(dueResurfaceAtoms(month, [], NOW).map(a => a.id)).toEqual(['a', 'b']);
  });

  it('leaves out ideas tapped here that Atoms has not picked up yet', () => {
    const s = parseResurfaceSummary(summaryText());
    const actions = withAction([], 'a', 'seen', NOW);
    expect(dueResurfaceAtoms(s, actions, NOW).map(a => a.id)).toEqual(['b', 'c', 'd']);
    // A tap older than the summary is already reflected in it.
    expect(dueResurfaceAtoms(s, [{ id: 'a', action: 'seen', at: NOW - 2 * DAY }], NOW).map(a => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('nothing to show without a summary', () => {
    expect(dueResurfaceAtoms(null, [], NOW)).toEqual([]);
  });
});

describe('actions for Atoms', () => {
  it('times always increase, newest 200 kept', () => {
    let actions = withAction([], 'a', 'seen', 100);
    actions = withAction(actions, 'b', 'dismiss', 100);
    expect(actions.map(a => a.at)).toEqual([100, 101]);
    for (let i = 0; i < 250; i += 1) actions = withAction(actions, `x${i}`, 'seen', 1000 + i);
    expect(actions).toHaveLength(200);
    expect(actions[199].id).toBe('x249');
  });

  it('round trip through the file Atoms reads', () => {
    const actions = withAction(withAction([], 'a', 'seen', 5), 'b', 'dismiss', 9);
    expect(JSON.parse(actionsFileText(actions))).toEqual({ app: 'SNFolio', actions });
    expect(parseAtomsActions(actionsFileText(actions))).toEqual(actions);
    expect(parseAtomsActions('{"actions":[{"id":"a","action":"boom","at":1}]}')).toEqual([]);
  });

  it('since labels', () => {
    expect(sinceLabel(NOW - 3 * DAY, NOW)).toBe('3 days');
    expect(sinceLabel(NOW - 35 * DAY, NOW)).toBe('5 weeks');
    expect(sinceLabel(NOW - 95 * DAY, NOW)).toBe('3 months');
  });
});
