import { NativeModules } from 'react-native';

jest.mock('sn-plugin-lib', () => ({
  PluginManager: { hasPermission: jest.fn().mockResolvedValue(1), requestPermission: jest.fn().mockResolvedValue(1) },
  PluginFileAPI: { openFile: jest.fn().mockResolvedValue({ success: true, result: true }) },
  FileUtils: {},
  PluginCommAPI: {},
  PluginNoteAPI: {},
}));

import { ATOMS_PLUGIN_ID, readAtomsResurface, recordAtomsAction } from './atomsBridge';

const files: Record<string, string> = {};
const native = NativeModules.CalendarFile as any;
const summary = JSON.stringify({
  app: 'Atoms',
  format: 1,
  writtenAt: 1,
  resurfaceDays: 7,
  atoms: [{ id: '20261110a', title: 'Idea', words: 'w', lastSeen: 0, source: { kind: 'pdf', path: '/x.pdf', title: 'X', page: 0 } }],
});

beforeEach(() => {
  for (const key of Object.keys(files)) delete files[key];
  native.readAtomsShared = jest.fn(async (name: string) => files[name] ?? null);
  native.writeAtomsShared = jest.fn(async (name: string, text: string) => {
    files[name] = text;
    return `/files/atoms-shared/${name}`;
  });
  native.pluginFolderState = jest.fn(async (id: string) => ({ checked: true, installed: id === ATOMS_PLUGIN_ID, folders: [ATOMS_PLUGIN_ID] }));
});

test('without Atoms there is no list, so nothing is shown', async () => {
  expect((await readAtomsResurface()).summary).toBeNull();
});

test('reads the list while Atoms is installed', async () => {
  files['resurface.json'] = summary;
  expect((await readAtomsResurface()).summary?.atoms).toHaveLength(1);
});

test('a list left behind after Atoms is uninstalled is ignored', async () => {
  files['resurface.json'] = summary;
  native.pluginFolderState = jest.fn(async () => ({ checked: true, installed: false, folders: [] }));
  const read = await readAtomsResurface();
  expect(read.summary).toBeNull();
  expect(read.problem).toBe('uninstalled');
});

test('if the plugins folder cannot be checked, the list is still used', async () => {
  files['resurface.json'] = summary;
  native.pluginFolderState = jest.fn(async () => ({ checked: false, installed: false, folders: [] }));
  expect((await readAtomsResurface()).summary).not.toBeNull();
});

test('taps are appended for Atoms to pick up', async () => {
  await recordAtomsAction('20261110a', 'seen');
  await recordAtomsAction('20261110a', 'dismiss');
  const written = JSON.parse(files['from-snfolio.json']);
  expect(written.app).toBe('SNFolio');
  expect(written.actions.map((a: any) => a.action)).toEqual(['seen', 'dismiss']);
});
