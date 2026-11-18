/**
 * The built-in Guide (2026-11-17): every topic opens, pages turn, and each page is
 * short enough to read on a Nomad without scrolling.
 */
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {Pressable, Text} from 'react-native';
import {HelpScreen} from './HelpScreen';
import {HELP_TOPICS, splitLabel, type HelpBlock} from '../help/helpContent';

const textOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('')).join('|');
const press = (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const target = tree.root
    .findAllByType(Pressable)
    .find(p => p.findAllByType(Text).some(t => [t.props.children].flat(Infinity).join('').includes(label)));
  if (!target) {
    throw new Error(`No button ${label}`);
  }
  act(() => target.props.onPress());
};

const words = (block: HelpBlock): string[] => {
  switch (block.kind) {
    case 'para':
      return [block.text];
    case 'steps':
    case 'bullets':
      return block.items;
    case 'note':
      return [block.label, block.text];
    case 'table':
      return [...block.headers, ...block.rows.flat()];
  }
};

test('every page fits a Nomad screen: about 150 words, never over 200', () => {
  for (const topic of HELP_TOPICS) {
    topic.pages.forEach((page, i) => {
      const count = page.blocks.flatMap(words).join(' ').split(/\s+/).length;
      expect([topic.id, i, count <= 200]).toEqual([topic.id, i, true]);
    });
  }
});

test('topic ids are unique', () => {
  expect(new Set(HELP_TOPICS.map(t => t.id)).size).toBe(HELP_TOPICS.length);
});

test('contents, a topic, its pages, and back', () => {
  const onDone = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<HelpScreen initialTopicId={null} onDone={onDone} />);
  });
  for (const topic of HELP_TOPICS) {
    expect(textOf(tree)).toContain(topic.title);
  }
  press(tree, 'Work Time on the Schedule');
  expect(textOf(tree)).toContain('Page 1 of 2');
  press(tree, 'Next ▶');
  expect(textOf(tree)).toContain('Moving and finishing');
  press(tree, 'Contents');
  expect(textOf(tree)).toContain('Guide for SNFolio');
  press(tree, 'Done');
  expect(onDone).toHaveBeenCalled();
});

test('"Label — text" items emphasise the label', () => {
  expect(splitLabel('Areas — ongoing.')).toEqual({label: 'Areas', text: 'ongoing.'});
  expect(splitLabel('no label here')).toBeNull();
});
