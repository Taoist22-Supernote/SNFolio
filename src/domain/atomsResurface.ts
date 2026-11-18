/**
 * Resurface ideas from the Atoms plugin in the Day Planner (CT, 2026-11-10).
 * The file formats are fixed by sn-atoms/docs/SNFOLIO-HANDOFF.md:
 *
 * - Atoms writes `resurface.json`: atoms that may come back, least recently
 *   seen first, plus how many days count as "a while".
 *   Since 2026-11-15 it also carries `inbox`: the fleeting atoms still to be
 *   processed, which the Day Planner strip shows one at a time as a reminder.
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
  /**
   * When Atoms says it is due: after its own gap (3 days while it needs
   * practice) or a Not Now week. Absent from older Atoms builds, which are
   * due by lastSeen and the setting.
   */
  dueAt?: number;
  source: { kind: string; path: string; title: string; page: number };
}

export interface InboxAtom {
  id: string;
  title: string;
  words: string;
  created: number;
}

export interface AtomsInbox {
  /** Every fleeting atom in Atoms; `atoms` may stop short of it. */
  count: number;
  /** Oldest first, as Atoms wrote them. */
  atoms: InboxAtom[];
}

export interface ResurfaceSummary {
  writtenAt: number;
  resurfaceDays: number;
  atoms: ResurfaceAtom[];
  /** Empty when Atoms is older than the Inbox hand-off. */
  inbox: AtomsInbox;
}

/** 'snooze' is Not Now (back in a week); older Atoms builds ignore it. */
export type AtomsActionKind = 'seen' | 'dismiss' | 'snooze';

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
        ...(isNum(a.dueAt) ? { dueAt: a.dueAt } : {}),
        source: { kind: isStr(s.kind) ? s.kind : 'other', path: s.path, title: s.title, page: Math.max(0, Math.floor(s.page)) },
      });
    }
  }
  return { writtenAt: parsed.writtenAt, resurfaceDays: parsed.resurfaceDays, atoms, inbox: parseInbox(parsed.inbox) };
}

function parseInbox(raw: any): AtomsInbox {
  const atoms: InboxAtom[] = [];
  for (const a of Array.isArray(raw?.atoms) ? raw.atoms : []) {
    if (a && isStr(a.id) && isStr(a.title) && isStr(a.words) && isNum(a.created)) {
      atoms.push({ id: a.id, title: a.title, words: a.words, created: a.created });
    }
  }
  // A count smaller than the list would read as nonsense ("Inbox 2" over
  // five rotating atoms); trust whichever is larger.
  const count = isNum(raw?.count) ? Math.max(Math.floor(raw.count), atoms.length) : atoms.length;
  return { count, atoms };
}

/**
 * The Inbox atom to show after SNFolio is opened again (CT, 2026-11-15): the
 * one after the last shown, wrapping to the oldest. A reminder that rotates,
 * because several usually wait at once. When the last one shown has left the
 * Inbox (promoted, merged, deleted), starts again from the oldest.
 */
export function nextInboxAtom(inbox: AtomsInbox, lastShownId?: string): InboxAtom | undefined {
  if (inbox.atoms.length === 0) {
    return undefined;
  }
  const at = lastShownId ? inbox.atoms.findIndex(a => a.id === lastShownId) : -1;
  return inbox.atoms[at < 0 ? 0 : (at + 1) % inbox.atoms.length];
}

/** The atom being shown now, between openings: the same one, or the oldest if it has gone. */
export function shownInboxAtom(inbox: AtomsInbox, shownId?: string): InboxAtom | undefined {
  return inbox.atoms.find(a => a.id === shownId) ?? inbox.atoms[0];
}

/**
 * The strip's one line. Resurface comes first, as before; the Inbox part is
 * added only when atoms are waiting, and its title is what gets cut short on
 * a narrow screen, since the line truncates at its end.
 */
export function resurfaceStripLabel(dueCount: number, inbox: AtomsInbox, shown: InboxAtom | undefined, now: number): string {
  if (inbox.count === 0 || !shown) {
    return dueCount > 0 ? `💡 ${dueCount} idea${dueCount === 1 ? '' : 's'} to resurface` : '💡 Nothing to resurface today';
  }
  const resurface = dueCount > 0 ? `💡 Resurface ${dueCount}` : '💡 Nothing to resurface';
  return `${resurface} · 📥 Inbox ${inbox.count} · ${shown.title} (${sinceLabel(shown.created, now)})`;
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
    if (a && isStr(a.id) && (a.action === 'seen' || a.action === 'dismiss' || a.action === 'snooze') && isNum(a.at)) {
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
  const due = (a: ResurfaceAtom) => (a.dueAt !== undefined ? a.dueAt <= now : a.lastSeen <= cutoff);
  return summary.atoms.filter(a => due(a) && !actedSince.has(a.id)).slice(0, limit);
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
