import { NativeModules } from 'react-native';
import { PluginFileAPI } from 'sn-plugin-lib';
import {
  actionsFileText,
  ATOMS_ACTIONS_FILE,
  ATOMS_SUMMARY_FILE,
  parseAtomsActions,
  parseResurfaceSummary,
  withAction,
  type AtomsAction,
  type AtomsActionKind,
  type ResurfaceAtom,
  type ResurfaceSummary,
} from '../domain/atomsResurface';
import { openResourceFile } from './exportService';
import { ensureFileReadPermission } from './pluginPermissions';

/**
 * Reads Atoms' Resurface summary and records what was tapped in the Day
 * Planner. Both files sit in the plugin host's files folder, which Atoms and
 * SNFolio share (sn-atoms/docs/SNFOLIO-HANDOFF.md). Never throws: a missing
 * Atoms install just means no Resurface section content.
 */

/** The Atoms plugin's ID (sn-atoms/PluginConfig.json). */
export const ATOMS_PLUGIN_ID = 'e8ce18ys7azuhi67';

type AtomsSharedModule = {
  pluginFolderState?: (pluginId: string) => Promise<{ checked: boolean; installed: boolean; folders: string[] }>;
  readAtomsShared?: (name: string) => Promise<string | null>;
  writeAtomsShared?: (name: string, content: string) => Promise<string>;
};

const Native = NativeModules.CalendarFile as AtomsSharedModule | undefined;

export interface ResurfaceRead {
  summary: ResurfaceSummary | null;
  actions: AtomsAction[];
  /** Why nothing could be read, for the section's empty message; '' when fine. */
  problem: string;
}

export async function readAtomsResurface(): Promise<ResurfaceRead> {
  if (!Native?.readAtomsShared) {
    return { summary: null, actions: [], problem: 'This SNFolio build cannot read Atoms. Reinstall SNFolio.' };
  }
  try {
    const [summaryRaw, actionsRaw] = await Promise.all([
      Native.readAtomsShared(ATOMS_SUMMARY_FILE),
      Native.readAtomsShared(ATOMS_ACTIONS_FILE),
    ]);
    const summary = parseResurfaceSummary(summaryRaw);
    const problem = summaryRaw === null ? 'none' : summary === null ? 'unreadable' : '';
    if (problem) console.log(`[SNFolio] Atoms resurface.json: ${problem}`);
    // Uninstalling Atoms leaves its list behind, so a list alone doesn't mean
    // Atoms is still there. Hide it when Atoms' plugin folder is gone, but only
    // when the plugins folder could be checked at all.
    if (summary && (await atomsUninstalled())) {
      return { summary: null, actions: [], problem: 'uninstalled' };
    }
    return { summary, actions: parseAtomsActions(actionsRaw), problem };
  } catch (e: any) {
    console.log(`[SNFolio] reading Atoms files failed: ${e?.message ?? e}`);
    return { summary: null, actions: [], problem: `Could not read Atoms' list (${e?.message ?? 'read failed'}).` };
  }
}

let folderStateLogged = false;

/** True only when the plugins folder was found and Atoms' folder is not in it. */
async function atomsUninstalled(): Promise<boolean> {
  if (!Native?.pluginFolderState) return false;
  try {
    const state = await Native.pluginFolderState(ATOMS_PLUGIN_ID);
    if (!folderStateLogged) {
      folderStateLogged = true;
      console.log(`[SNFolio] plugin folders (checked=${state.checked}, atoms=${state.installed}): ${state.folders.join(', ')}`);
    }
    return state.checked && !state.installed;
  } catch {
    return false;
  }
}

/** Adds one tap to from-snfolio.json for Atoms to apply. Returns the new list, or null on failure. */
export async function recordAtomsAction(id: string, action: AtomsActionKind): Promise<AtomsAction[] | null> {
  if (!Native?.readAtomsShared || !Native.writeAtomsShared) return null;
  try {
    const current = parseAtomsActions(await Native.readAtomsShared(ATOMS_ACTIONS_FILE));
    const next = withAction(current, id, action, Date.now());
    await Native.writeAtomsShared(ATOMS_ACTIONS_FILE, actionsFileText(next));
    return next;
  } catch (e: any) {
    console.log(`[SNFolio] writing Atoms action failed: ${e?.message ?? e}`);
    return null;
  }
}

/**
 * Opens the page an idea came from. PluginFileAPI.openFile opens notes and
 * PDFs at the page (Atoms' Go to Source uses it); the existing open-file
 * route is the fallback, at the file's last-used page.
 */
export async function openResurfaceSource(atom: ResurfaceAtom): Promise<{ success: boolean; message: string }> {
  if (!(await ensureFileReadPermission())) {
    return { success: false, message: 'File access was not allowed.' };
  }
  try {
    const res: any = await PluginFileAPI.openFile(atom.source.path, Math.max(0, atom.source.page));
    if (res?.success && res.result) {
      return { success: true, message: `Opened ${atom.source.title}` };
    }
  } catch {
    // fall back below
  }
  const fallback = await openResourceFile(atom.source.path);
  return { success: fallback.success, message: fallback.message };
}
