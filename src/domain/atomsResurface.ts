/**
 * Resurface ideas from the Atoms plugin in the Day Planner (CT, 2026-11-10).
 * The file formats are fixed by sn-atoms/docs/SNFOLIO-HANDOFF.md:
 *
 * - Atoms writes `resurface.json`: atoms that may come back, least recently
 *   seen first, plus how many days count as "a while".
 * - SNFolio writes `from-snfolio.json`: what was tapped here. Atoms applies
 *   those the next time it opens. SNFolio never writes Atoms' own data.
 */

export const ATOMS_SUMMARY_FILE = 'resurface.json';
export const ATOMS_ACTIONS_FILE = 'from-snfolio.json';
export const RESURFACE_SHOWN = 3;
const KNOWN_FORMAT = 1;
const ACTIONS_KEPT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResurfaceAtom {
  id: string;
  title: string;
  words: string;
  lastSeen: number;
  source: { kind: string; path: string; title: string; page: number };
}

export interface ResurfaceSummary {
  writtenAt: number;
  resurfaceDays: number;
  atoms: ResurfaceAtom[];
}

export type AtomsActionKind = 'seen' | 'dismiss';

export interface AtomsAction {
  id: string;
  action: AtomsActionKind;
  at: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** Null when there is no summary, or it isn't one this version understands. */
export function parseResurfaceSummary(raw: string | null): ResurfaceSummary | null {
  if (!raw) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || parsed.app !== 'Atoms' || parsed.format !== KNOWN_FORMAT || !isNum(parsed.writtenAt) || !isNum(parsed.resurfaceDays)) {
    return null;
  }
  const atoms: ResurfaceAtom[] = [];
  for (const a of Array.isArray(parsed.atoms) ? parsed.atoms : []) {
    const s = a?.source;
    if (a && isStr(a.id) && isStr(a.title) && isStr(a.words) && isNum(a.lastSeen) && s && isStr(s.path) && isStr(s.title) && isNum(s.page)) {
      atoms.push({
        id: a.id,
        title: a.title,
        words: a.words,
        lastSeen: a.lastSeen,
        source: { kind: isStr(s.kind) ? s.kind : 'other', path: s.path, title: s.title, page: Math.max(0, Math.floor(s.page)) },
      });
    }
  }
  return { writtenAt: parsed.writtenAt, resurfaceDays: parsed.resurfaceDays, atoms };
}

export function parseAtomsActions(raw: string | null): AtomsAction[] {
  if (!raw) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const out: AtomsAction[] = [];
  for (const a of Array.isArray(parsed?.actions) ? parsed.actions : []) {
    if (a && isStr(a.id) && (a.action === 'seen' || a.action === 'dismiss') && isNum(a.at)) {
      out.push({ id: a.id, action: a.action, at: a.at });
    }
  }
  return out;
}

/**
 * The ideas to show: due by Atoms' own setting, minus any acted on here since
 * Atoms last wrote its summary (Atoms hasn't seen those taps yet). Worked out
 * at draw time, so it stays right if Atoms hasn't been opened for days.
 */
export function dueResurfaceAtoms(
  summary: ResurfaceSummary | null,
  actions: AtomsAction[],
  now: number,
  limit = RESURFACE_SHOWN,
): ResurfaceAtom[] {
  if (!summary) return [];
  const cutoff = now - summary.resurfaceDays * DAY_MS;
  const actedSince = new Set(actions.filter(a => a.at > summary.writtenAt).map(a => a.id));
  return summary.atoms.filter(a => a.lastSeen <= cutoff && !actedSince.has(a.id)).slice(0, limit);
}

/** The actions file after one more tap: newest kept, times always increasing. */
export function withAction(actions: AtomsAction[], id: string, action: AtomsActionKind, now: number): AtomsAction[] {
  const latest = actions.reduce((max, a) => Math.max(max, a.at), 0);
  const at = Math.max(now, latest + 1);
  return [...actions, { id, action, at }].slice(-ACTIONS_KEPT);
}

export function actionsFileText(actions: AtomsAction[]): string {
  return JSON.stringify({ app: 'SNFolio', actions });
}

/** "5 weeks", "3 days" since an atom was last opened. */
export function sinceLabel(then: number, now: number): string {
  const days = Math.max(0, Math.floor((now - then) / DAY_MS));
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 60) return `${Math.floor(days / 7)} weeks`;
  return `${Math.floor(days / 30)} months`;
}
