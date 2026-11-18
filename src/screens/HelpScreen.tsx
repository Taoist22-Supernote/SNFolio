import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {
  findTopic,
  HELP_TOPICS,
  HELP_VERSION,
  splitLabel,
  type HelpBlock,
  type HelpTopicId,
} from '../help/helpContent';

type Props = {
  /** Topic to open on. Null opens the contents list. */
  initialTopicId: HelpTopicId | null;
  /** True when shown automatically on first launch. */
  firstRun?: boolean;
  /** Leave the guide and go back to where the user was. */
  onDone: () => void;
};

/**
 * The in-app guide. Topics are read a page at a time with ◀ ▶ rather than by scrolling,
 * because scrolling ghosts on e-ink. The body still sits in a ScrollView so that a page
 * which turns out too long for a small screen can be reached rather than cut off.
 */
export function HelpScreen({initialTopicId, firstRun = false, onDone}: Props) {
  const [topicId, setTopicId] = useState<HelpTopicId | null>(initialTopicId);
  const [pageIndex, setPageIndex] = useState(0);

  const topic = topicId ? findTopic(topicId) : undefined;

  const openTopic = (id: HelpTopicId) => {
    setTopicId(id);
    setPageIndex(0);
  };

  const showContents = () => {
    setTopicId(null);
    setPageIndex(0);
  };

  if (!topic) {
    return (
      <View style={styles.root}>
        <View style={styles.bar}>
          <View style={styles.barSide} />
          <Text style={styles.barTitle}>Guide</Text>
          <Pressable onPress={onDone} style={[styles.barSide, styles.barSideEnd]}>
            <Text style={styles.barButtonText}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {HELP_TOPICS.map(item => (
            <Pressable
              key={item.id}
              onPress={() => openTopic(item.id)}
              style={styles.topicRow}>
              <View style={styles.topicText}>
                <Text style={styles.topicTitle}>{item.title}</Text>
                <Text style={styles.topicSummary}>{item.summary}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          <Text style={styles.version}>Guide for SNFolio {HELP_VERSION}</Text>
        </ScrollView>
      </View>
    );
  }

  const pageCount = topic.pages.length;
  const page = topic.pages[Math.min(pageIndex, pageCount - 1)];
  const isFirst = pageIndex === 0;
  const isLast = pageIndex >= pageCount - 1;

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={showContents} style={styles.barSide}>
          <Text style={styles.barButtonText}>Contents</Text>
        </Pressable>
        <Text style={styles.barTitle} numberOfLines={1}>
          {topic.title}
        </Text>
        <Pressable onPress={onDone} style={[styles.barSide, styles.barSideEnd]}>
          <Text style={styles.barButtonText}>Done</Text>
        </Pressable>
      </View>

      {/* Keyed by page so each turn starts at the top, like turning a page. */}
      <ScrollView key={`${topic.id}-${pageIndex}`} contentContainerStyle={styles.body}>
        {firstRun && topic.id === 'quick-start' && isFirst && (
          <Text style={styles.welcome}>Welcome to SNFolio</Text>
        )}
        {page.heading ? <Text style={styles.pageHeading}>{page.heading}</Text> : null}
        {page.blocks.map((block, index) => (
          <HelpBlockView key={index} block={block} />
        ))}
        {firstRun && isLast && (
          <View style={styles.note}>
            <Text style={styles.noteLabel}>This guide is always here</Text>
            <Text style={styles.noteText}>
              Tap ⚙, then 📖 Guide, to open it again. Tap Done to start using SNFolio.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.pager}>
        <Pressable
          onPress={() => setPageIndex(index => Math.max(0, index - 1))}
          disabled={isFirst}
          style={[styles.pageButton, isFirst && styles.pageButtonDisabled]}>
          <Text style={[styles.pageButtonText, isFirst && styles.pageButtonTextDisabled]}>
            ◀ Back
          </Text>
        </Pressable>
        <Text style={styles.pageCount}>
          Page {pageIndex + 1} of {pageCount}
        </Text>
        <Pressable
          onPress={() => setPageIndex(index => Math.min(pageCount - 1, index + 1))}
          disabled={isLast}
          style={[styles.pageButton, isLast && styles.pageButtonDisabled]}>
          <Text style={[styles.pageButtonText, isLast && styles.pageButtonTextDisabled]}>
            Next ▶
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function LabelledText({item, style}: {item: string; style: object}) {
  const parts = splitLabel(item);
  if (!parts) {
    return <Text style={style}>{item}</Text>;
  }
  return (
    <Text style={style}>
      <Text style={styles.strong}>{parts.label}</Text> — {parts.text}
    </Text>
  );
}

function HelpBlockView({block}: {block: HelpBlock}) {
  switch (block.kind) {
    case 'para':
      return <Text style={styles.para}>{block.text}</Text>;
    case 'steps':
      return (
        <View style={styles.list}>
          {block.items.map((item, index) => (
            <View key={index} style={styles.listRow}>
              <Text style={styles.listMarker}>{index + 1}.</Text>
              <LabelledText item={item} style={styles.listText} />
            </View>
          ))}
        </View>
      );
    case 'bullets':
      return (
        <View style={styles.list}>
          {block.items.map((item, index) => (
            <View key={index} style={styles.listRow}>
              <Text style={styles.listMarker}>•</Text>
              <LabelledText item={item} style={styles.listText} />
            </View>
          ))}
        </View>
      );
    case 'note':
      return (
        <View style={styles.note}>
          <Text style={styles.noteLabel}>{block.label}</Text>
          <Text style={styles.noteText}>{block.text}</Text>
        </View>
      );
    case 'table':
      return (
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            <Text style={[styles.tableCellLeft, styles.strong]}>{block.headers[0]}</Text>
            <Text style={[styles.tableCellRight, styles.strong]}>{block.headers[1]}</Text>
          </View>
          {block.rows.map(([left, right], index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.tableCellLeft, styles.strong]}>{left}</Text>
              <Text style={styles.tableCellRight}>{right}</Text>
            </View>
          ))}
        </View>
      );
  }
}

// Black on white with borders, not colour: the panel is greyscale, and a light grey
// renders close to white on it.
const INK = '#1e2522';
const RULE = '#9a9a92';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  bar: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: RULE,
  },
  barSide: {
    width: 96,
    paddingVertical: 10,
  },
  barSideEnd: {
    alignItems: 'flex-end',
  },
  barTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: INK,
  },
  barButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: INK,
  },
  body: {
    padding: 20,
    paddingBottom: 32,
  },
  welcome: {
    fontSize: 24,
    fontWeight: '800',
    color: INK,
    marginBottom: 12,
  },
  pageHeading: {
    fontSize: 21,
    fontWeight: '800',
    color: INK,
    marginBottom: 12,
  },
  para: {
    fontSize: 18,
    lineHeight: 27,
    color: INK,
    marginBottom: 14,
  },
  strong: {
    fontWeight: '800',
  },
  list: {
    marginBottom: 14,
  },
  listRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  listMarker: {
    width: 28,
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '800',
    color: INK,
  },
  listText: {
    flex: 1,
    fontSize: 18,
    lineHeight: 27,
    color: INK,
  },
  note: {
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
  },
  noteLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: INK,
    marginBottom: 4,
  },
  noteText: {
    fontSize: 17,
    lineHeight: 25,
    color: INK,
  },
  table: {
    borderTopWidth: 1,
    borderColor: RULE,
    marginBottom: 14,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: RULE,
    paddingVertical: 8,
  },
  tableHeaderRow: {
    borderBottomWidth: 2,
    borderColor: INK,
  },
  tableCellLeft: {
    width: '38%',
    paddingRight: 12,
    fontSize: 17,
    lineHeight: 24,
    color: INK,
  },
  tableCellRight: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
    color: INK,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: RULE,
  },
  topicText: {
    flex: 1,
  },
  topicTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: INK,
  },
  topicSummary: {
    fontSize: 16,
    color: INK,
    marginTop: 2,
  },
  chevron: {
    fontSize: 28,
    color: INK,
    paddingLeft: 12,
  },
  version: {
    marginTop: 20,
    fontSize: 14,
    color: INK,
    textAlign: 'center',
  },
  pager: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: RULE,
  },
  pageButton: {
    minWidth: 120,
    minHeight: 48,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  pageButtonDisabled: {
    borderColor: RULE,
  },
  pageButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: INK,
  },
  pageButtonTextDisabled: {
    color: RULE,
  },
  pageCount: {
    fontSize: 16,
    fontWeight: '700',
    color: INK,
  },
});
