import { isPdfPath, LinkedFileMarker } from './LinkedFileMarker';
import { useTimeFormat } from './TimeFormatContext';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CalendarEvent, CalendarTask } from '../domain/types';
import { DEFAULT_DAY_GRID, gridHeight, gridHours, hourLabel, placeEvents } from '../domain/dayGrid';
import { statusGlyph, taskStatus } from '../domain/taskModel';
import {
  isWorkBlockUid,
  taskUidOfWorkBlock,
  workBlockEvent,
  WorkBlockState,
  workBlockState,
} from '../domain/workBlocks';

interface DayScheduleGridProps {
  events: CalendarEvent[];
  startHour: number;
  endHour: number;
  /** Note path per event uid, so a row can offer Open rather than Create. */
  notePaths: Record<string, string>;
  onEditEvent: (event: CalendarEvent) => void;
  onNoteAction: (event: CalendarEvent, existingPath?: string) => void;
  onDeleteEvent: (event: CalendarEvent) => void;
  /** Type label for an event, e.g. "🎓 Class". Empty when untyped. */
  typeLabel: (event: CalendarEvent) => string;
  /** Height of one hour; defaults to 58. The Manta Day Planner fits it to the screen. */
  hourHeight?: number;
  /** Tasks with a work time on this day, drawn as blocks among the events. */
  workTasks?: CalendarTask[];
  /** The clock the blocks are judged against: Now, Missed. */
  now?: Date;
  onToggleTask?: (task: CalendarTask) => void;
  onEditTask?: (task: CalendarTask) => void;
  /** Move the block: opens the planner on it. */
  onPlanTask?: (task: CalendarTask) => void;
  /** Take the task off the schedule; its deadline is untouched. */
  onUnplanTask?: (task: CalendarTask) => void;
  /** Short context for a task block, e.g. "due Fri". */
  taskMeta?: (task: CalendarTask) => string;
}

const STATE_LABEL: Record<WorkBlockState, string> = {
  now: '▶ NOW',
  missed: 'MISSED',
  done: '',
  planned: '',
};

/**
 * The day as a grid of hours rather than a list of rows.
 *
 * A list said what was on but not when: an hour with nothing in it looked the
 * same as no gap at all. Positioned against hour lines, the shape of the day
 * is legible — where the free afternoon is, which two things collide.
 *
 * Positioning lives in domain/dayGrid so the clamping and overlap columns are
 * tested off device.
 */
function DayScheduleGridInner({
  events,
  startHour,
  endHour,
  notePaths,
  onEditEvent,
  onNoteAction,
  onDeleteEvent,
  typeLabel,
  hourHeight,
  workTasks = [],
  now,
  onToggleTask,
  onEditTask,
  onPlanTask,
  onUnplanTask,
  taskMeta,
}: DayScheduleGridProps): React.JSX.Element {
  const timeFormat = useTimeFormat();
  // The grid grows with the hours chosen, unless the caller fits it to the
  // space it has (the Manta Day Planner, which must not scroll).
  const options = { ...DEFAULT_DAY_GRID, startHour, endHour, ...(hourHeight ? { hourHeight } : {}) };
  const allDay = events.filter(e => e.allDay);
  // Work blocks go through the same placement as events, so a task planned
  // over a meeting splits the hour with it instead of hiding beneath it.
  const workByUid = new Map(workTasks.map(task => [task.uid, task]));
  const placed = placeEvents([...events, ...workTasks.map(workBlockEvent)], options);
  const clock = now ?? new Date();
  const hours = gridHours(options);
  const height = gridHeight(options);

  return (
    <View>
      {/* Pinned above: an all-day item has no position on an hour grid. */}
      {allDay.map(evt => (
        <TouchableOpacity key={`allday-${evt.uid}`} style={styles.allDayRow} onPress={() => onEditEvent(evt)}>
          <Text allowFontScaling={false} style={styles.allDayTag}>
            ALL DAY
          </Text>
          <Text allowFontScaling={false} style={styles.allDayTitle} numberOfLines={1}>
            <LinkedFileMarker item={evt} />{evt.summary}
          </Text>
        </TouchableOpacity>
      ))}

      <View style={[styles.grid, { height }]}>
        {hours.map((hour, idx) => (
          <View
            key={hour}
            style={[styles.hourRow, { top: idx * options.hourHeight }]}
            pointerEvents="none"
          >
            <Text allowFontScaling={false} style={styles.hourLabel}>
              {hourLabel(hour, timeFormat)}
            </Text>
            <View style={styles.hourLine} />
          </View>
        ))}

        {/* Blocks sit in their own layer inset past the hour labels. Sharing
            the grid's box meant a percentage width resolved against the full
            width, so a full-width block overhung the right edge by the gutter. */}
        <View style={styles.blockLayer} pointerEvents="box-none">
        {placed.map(({ event, top, height: blockHeight, column, columns }) => {
          // Columns share the track width; a single event takes all of it.
          const widthPercent = 100 / columns;
          const position = {
            top,
            height: blockHeight,
            left: `${column * widthPercent}%` as const,
            width: `${widthPercent}%` as const,
          };

          if (isWorkBlockUid(event.uid)) {
            const task = workByUid.get(taskUidOfWorkBlock(event.uid));
            if (!task) return null;
            const state = workBlockState(task, clock);
            const inverted = state === 'now';
            // The state rides in the title line, which every block has room
            // for; a one-hour block is too short for the meta line, and the
            // cue is the point of the block.
            const stateLabel = STATE_LABEL[state];
            const meta = taskMeta?.(task) ?? '';
            return (
              <View
                key={event.uid}
                style={[
                  styles.block,
                  styles.workBlock,
                  state === 'missed' && styles.workBlockMissed,
                  state === 'done' && styles.workBlockDone,
                  inverted && styles.workBlockNow,
                  position,
                ]}
              >
                <View style={styles.workTitleRow}>
                  <TouchableOpacity
                    onPress={() => onToggleTask?.(task)}
                    accessibilityLabel={`${state === 'done' ? 'Reopen' : 'Complete'} ${task.title}`}
                  >
                    <Text allowFontScaling={false} style={[styles.workCheck, inverted && styles.workTextNow]}>
                      {statusGlyph(taskStatus(task))}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.blockBody} onPress={() => onEditTask?.(task)}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.blockTitle, inverted && styles.workTextNow, state === 'done' && styles.workTitleDone]}
                      numberOfLines={1}
                    >
                      {stateLabel ? <Text style={styles.workState}>{`${stateLabel} · `}</Text> : null}
                      <LinkedFileMarker item={task} />{task.title}
                    </Text>
                  </TouchableOpacity>
                </View>
                {blockHeight >= META_MIN_HEIGHT && meta ? (
                  <Text allowFontScaling={false} style={[styles.blockMeta, inverted && styles.workTextNow]} numberOfLines={1}>
                    {meta}
                  </Text>
                ) : null}
                {blockHeight >= ACTIONS_MIN_HEIGHT && state !== 'done' && (
                  <View style={styles.blockActions}>
                    <TouchableOpacity style={styles.blockActionBtn} onPress={() => onPlanTask?.(task)}>
                      <Text allowFontScaling={false} style={[styles.blockAction, inverted && styles.workTextNow]} numberOfLines={1}>
                        {state === 'missed' ? '⏱ Replan' : '⏱ Move'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.blockDeleteBtn}
                      onPress={() => onUnplanTask?.(task)}
                      accessibilityLabel={`Take ${task.title} off the schedule`}
                    >
                      <Text allowFontScaling={false} style={[styles.blockDelete, inverted && styles.workTextNow]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }

          const existingPath = notePaths[event.uid];

          return (
            <View
              key={event.uid}
              style={[styles.block, position]}
            >
              <TouchableOpacity style={styles.blockBody} onPress={() => onEditEvent(event)}>
                <Text allowFontScaling={false} style={styles.blockTitle} numberOfLines={1}>
                  <LinkedFileMarker item={event} />{event.summary}
                </Text>
                {/* Each line only appears if it fits. Rendering all three in a
                    short block overflowed the box, and with the box clipped
                    the lines collided — which read as text behind the icon. */}
                {blockHeight >= META_MIN_HEIGHT && (
                  <Text allowFontScaling={false} style={styles.blockMeta} numberOfLines={1}>
                    {[typeLabel(event), event.location].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </TouchableOpacity>

              {blockHeight >= ACTIONS_MIN_HEIGHT && (
              <View style={styles.blockActions}>
                {/* The action takes the room it needs and the delete stays a
                    fixed sliver, rather than the two splitting evenly and
                    truncating the only label that carries meaning. */}
                <TouchableOpacity
                  style={styles.blockActionBtn}
                  onPress={() => onNoteAction(event, existingPath)}
                >
                  <Text allowFontScaling={false} style={styles.blockAction} numberOfLines={1}>
                    {existingPath ? (isPdfPath(existingPath) ? '📄 Open PDF' : '📂 Open Note') : '📝 Create Note'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.blockDeleteBtn} onPress={() => onDeleteEvent(event)}>
                  <Text allowFontScaling={false} style={styles.blockDelete}>
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>
              )}
            </View>
          );
        })}
        </View>
      </View>
    </View>
  );
}

const GUTTER = 62;

/**
 * Heights at which each line earns its place.
 *
 * A one-hour block cannot hold a title, a meta line and an action row at
 * these sizes; drawing all three overflowed a clipped box and the lines
 * collided.
 */
const ACTIONS_MIN_HEIGHT = 46;
const META_MIN_HEIGHT = 66;

/**
 * Changing day re-rendered this five or six times — the day's events, the note
 * sweep and the journal check all arrive separately — at roughly 400 ms each
 * on device with a busy calendar. Its inputs settle after the first of those.
 */
export const DayScheduleGrid = React.memo(DayScheduleGridInner);

const styles = StyleSheet.create({
  allDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 5,
    backgroundColor: '#f2f2f2',
  },
  allDayTag: { fontSize: 10, fontWeight: 'bold', color: '#303030', marginRight: 8 },
  allDayTitle: { flex: 1, fontSize: 13, fontWeight: 'bold', color: '#000000' },
  grid: { position: 'relative' },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hourLabel: {
    width: GUTTER,
    fontSize: 12,
    color: '#303030',
    textAlign: 'right',
    paddingRight: 8,
  },
  // Dotted rather than solid: the lines are a reference, and solid rules at
  // every hour compete with the event blocks for attention.
  hourLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#b0b0b0',
    borderStyle: 'dotted',
  },
  blockLayer: {
    position: 'absolute',
    left: GUTTER,
    right: 4,
    top: 0,
    bottom: 0,
  },
  block: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 5,
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  blockBody: { flex: 1 },
  blockTitle: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  blockMeta: { fontSize: 11, color: '#404040' },
  blockActions: { flexDirection: 'row', alignItems: 'center' },
  blockActionBtn: { flex: 1 },
  blockAction: { fontSize: 11, fontWeight: 'bold', color: '#000000' },
  blockDeleteBtn: { paddingLeft: 8 },
  blockDelete: { fontSize: 12, color: '#606060' },
  // Dashed, so a planned task reads as yours to do rather than somewhere to
  // be, while still taking up the hour the way an event does.
  workBlock: { borderStyle: 'dashed', backgroundColor: '#f7f7f7' },
  // In progress: inverted, the one block on the page that is black.
  workBlockNow: { borderStyle: 'solid', backgroundColor: '#000000' },
  workBlockMissed: { borderStyle: 'dotted', borderColor: '#404040' },
  workBlockDone: { borderWidth: 1, borderColor: '#909090', backgroundColor: '#ffffff' },
  workTitleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  workCheck: { fontSize: 14, color: '#000000', marginRight: 5 },
  workTextNow: { color: '#ffffff' },
  workState: { fontWeight: 'bold' },
  workTitleDone: { textDecorationLine: 'line-through', color: '#707070' },
});
