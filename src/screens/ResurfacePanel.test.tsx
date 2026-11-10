import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { ResurfacePanel } from './ResurfacePanel';
import type { ResurfaceAtom } from '../domain/atomsResurface';

const DAY = 24 * 60 * 60 * 1000;
const atom = (id: string): ResurfaceAtom => ({
  id,
  title: `Idea ${id}`,
  words: `Words for ${id}`,
  lastSeen: Date.now() - 35 * DAY,
  source: { kind: 'pdf', path: '/storage/emulated/0/Document/Ch9.pdf', title: 'Ch9', page: 213 },
});
const texts = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const button = (tree: TestRenderer.ReactTestRenderer, label: string, index = 0) =>
  tree.root.findAllByType(TouchableOpacity).filter(b => texts({ root: b } as any).includes(label))[index];

test('shows each idea with its source page and the three buttons, which report the right idea', () => {
  const onOpenSource = jest.fn();
  const onNotNow = jest.fn();
  const onDismiss = jest.fn();
  const onClose = jest.fn();
  let tree: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ResurfacePanel atoms={[atom('a'), atom('b')]} gapDays={7} message="" onOpenSource={onOpenSource} onNotNow={onNotNow} onDismiss={onDismiss} onClose={onClose} />,
    );
  });
  const all = texts(tree!);
  expect(all).toContain('Ideas from Atoms you haven’t opened in a week or more.');
  expect(all).toContain('Ch9 · p. 214 · not opened in 5 weeks');
  act(() => button(tree!, 'Open Source', 1).props.onPress());
  act(() => button(tree!, 'Not Now', 0).props.onPress());
  act(() => button(tree!, 'Don’t Resurface', 1).props.onPress());
  act(() => button(tree!, 'Close').props.onPress());
  expect(onOpenSource.mock.calls[0][0].id).toBe('b');
  expect(onNotNow.mock.calls[0][0].id).toBe('a');
  expect(onDismiss.mock.calls[0][0].id).toBe('b');
  expect(onClose).toHaveBeenCalled();
  act(() => tree!.unmount());
});

test('says so when nothing is left, and shows the last message', () => {
  let tree: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ResurfacePanel atoms={[]} gapDays={30} message="Set aside." onOpenSource={jest.fn()} onNotNow={jest.fn()} onDismiss={jest.fn()} onClose={jest.fn()} />,
    );
  });
  expect(texts(tree!)).toEqual(expect.arrayContaining(['Nothing left to resurface today.', 'Set aside.']));
  act(() => tree!.unmount());
});
