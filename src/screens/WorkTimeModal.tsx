import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DatePickerModal } from './DatePickerModal';
import { TimePickerModal } from './TimePickerModal';
import { useTimeFormat } from './TimeFormatContext';
import { formatDateTime, formatDuration, formatTimeOfDay, minutesFromDate, TimeFormat, withTimeOfDay } from '../domain/timeOfDay';
import { BusySpan, defaultSessionMinutes, openSessions, WORK_DURATIONS } from '../domain/workBlocks';
import { CalendarTask, WorkSession } from '../domain/types';

interface WorkTimeModalProps {
  /**
   * The task being planned. The caller mounts the modal only while planning,
   * keyed by task, so every opening starts from this task's own values.
   */
  task: CalendarTask;
  /**
   * The session being moved. Absent when adding one, which is what Plan on a
   * task row always does, so a task can be given another sitting.
   */
  session?: WorkSession;
  /**
   * Where the planner opens when adding a session: the first
   * free slot on the day being viewed, worked out by the caller, which knows
   * the day's events.
   */
  suggestedStart: Date;
  /** Recomputes the suggestion when the day or length changes. */
  suggestFor?: (day: Date, minutes: number) => Date;
  /**
   * What the chosen time would run into: events and other planned tasks on
   * that day. Shown as a warning; saving is still allowed.
   */
  overlapsFor?: (start: Date, minutes: number) => BusySpan[];
  weekStartsOn?: number;
  /** `sessionId` is the session moved, or undefined for a new one. */
  onSave: (task: CalendarTask, start: Date, minutes: number, sessionId?: string) => void;
  onClear: (task: CalendarTask, sessionId: string) => void;
  onClose: () => void;
}

/**
 * Choose when to work on a task: a day, a start time, and how long.
 *
 * Kept apart from the task form on purpose. The form decides what a task is
 * and when it is owed; this decides when it gets done, and is opened from the
 * schedule and the task rows, where that question comes up.
 */
export function WorkTimeModal({
  task,
  session,
  suggestedStart,
  suggestFor,
  overlapsFor,
  weekStartsOn,
  onSave,
  onClear,
  onClose,
}: WorkTimeModalProps): React.JSX.Element {
  const timeFormat = useTimeFormat();
  const planned = !!session;
  const [start, setStart] = React.useState<Date>(() =>
    session ? new Date(session.start) : suggestedStart);
  const others = openSessions(task).filter(s => s.id !== session?.id);
  const [minutes, setMinutes] = React.useState<number>(() => defaultSessionMinutes(task, session));
  const [picking, setPicking] = React.useState<'date' | 'time' | null>(null);
  // Once the time is chosen by hand, changing the day or length must not
  // move it; until then it follows the first free slot.
  const [timeChosen, setTimeChosen] = React.useState(planned);

  const chooseDay = (day: Date) => {
    setStart(timeChosen || !suggestFor
      ? withTimeOfDay(day, minutesFromDate(start))
      : suggestFor(day, minutes));
  };
  const chooseMinutes = (value: number) => {
    setMinutes(value);
    if (!timeChosen && suggestFor) setStart(suggestFor(start, value));
  };

  const endMinutes = minutesFromDate(start) + minutes;
  const overlaps = overlapsFor?.(start, minutes) ?? [];
  const dayLabel = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <Modal visible transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={styles.title}>{planned ? '⏱ Move session' : '⏱ Plan work time'}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
              <Text allowFontScaling={false} style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text allowFontScaling={false} style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
          {others.length > 0 ? (
            <Text allowFontScaling={false} style={styles.hint}>
              {planned ? 'Moving one session. ' : 'Adding another session. '}
              {others.length === 1 ? '1 other is' : `${others.length} others are`} planned:{' '}
              {others.slice(0, 3).map(s => s.start.toLocaleDateString('en-US', { weekday: 'short' }) + ' '
                + formatTimeOfDay(minutesFromDate(s.start), timeFormat)).join(', ')}
              {others.length > 3 ? ', …' : ''}
            </Text>
          ) : null}
          {task.dueDate ? (
            <Text allowFontScaling={false} style={styles.hint}>
              Due {task.allDay !== false
                ? task.dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                : formatDateTime(task.dueDate, timeFormat)}. The deadline stays where it is.
            </Text>
          ) : null}

          <Text allowFontScaling={false} style={styles.label}>Day</Text>
          <TouchableOpacity style={styles.field} onPress={() => setPicking('date')}>
            <Text allowFontScaling={false} style={styles.fieldText}>{dayLabel}</Text>
          </TouchableOpacity>

          <Text allowFontScaling={false} style={styles.label}>Start</Text>
          <TouchableOpacity style={styles.field} onPress={() => setPicking('time')}>
            <Text allowFontScaling={false} style={styles.fieldText}>
              {formatTimeOfDay(minutesFromDate(start), timeFormat)}
              {!timeChosen && suggestFor ? '  (first free slot)' : ''}
            </Text>
          </TouchableOpacity>

          <Text allowFontScaling={false} style={styles.label}>How long</Text>
          <View style={styles.chipRow}>
            {WORK_DURATIONS.map(value => {
              const selected = value === minutes;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => chooseMinutes(value)}
                >
                  <Text allowFontScaling={false} style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {formatDuration(value)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text allowFontScaling={false} style={styles.hint}>
            {formatTimeOfDay(minutesFromDate(start), timeFormat)} – {formatTimeOfDay(endMinutes, timeFormat)} · {formatDuration(minutes)}
          </Text>
          {/* A clash is allowed, but no longer silent. Bold and boxed rather
              than coloured: e-ink has no red. */}
          {overlaps.length > 0 && (
            <Text allowFontScaling={false} style={styles.overlapWarning}>
              {overlapMessage(overlaps, timeFormat)}
            </Text>
          )}

          <View style={styles.actions}>
            {planned ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => session && onClear(task, session.id)}>
                <Text allowFontScaling={false} style={styles.secondaryText}>Take off schedule</Text>
              </TouchableOpacity>
            ) : <View />}
            <TouchableOpacity style={styles.primaryBtn} onPress={() => onSave(task, start, minutes, session?.id)}>
              <Text allowFontScaling={false} style={styles.primaryText}>{planned ? 'Save' : 'Put on schedule'}</Text>
            </TouchableOpacity>
          </View>

          <DatePickerModal
            visible={picking === 'date'}
            value={start}
            weekStartsOn={weekStartsOn}
            onSelect={chooseDay}
            onClose={() => setPicking(null)}
          />
          <TimePickerModal
            visible={picking === 'time'}
            title="Start working at"
            value={minutesFromDate(start)}
            onSelect={value => {
              setTimeChosen(true);
              setStart(withTimeOfDay(start, value));
            }}
            onClose={() => setPicking(null)}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

/** Shown in full up to this many; the rest become "and N more". */
const OVERLAPS_NAMED = 2;

export function overlapMessage(overlaps: BusySpan[], timeFormat: TimeFormat): string {
  const named = overlaps.slice(0, OVERLAPS_NAMED).map(span => {
    const time = `${formatTimeOfDay(span.startMinute, timeFormat)}–${formatTimeOfDay(span.endMinute, timeFormat)}`;
    return span.isWork ? `${span.title} (planned, ${time})` : `${span.title} (${time})`;
  });
  const more = overlaps.length - named.length;
  return `Overlaps ${named.join(' and ')}${more > 0 ? ` and ${more} more` : ''}. You can still save.`;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  content: { backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#000000', borderRadius: 8, padding: 14, width: 420, maxWidth: '94%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: 'bold', color: '#000000' },
  closeBtn: { minWidth: 44, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 17, color: '#000000' },
  taskTitle: { fontSize: 15, fontWeight: 'bold', color: '#000000', marginTop: 2 },
  label: { fontSize: 13, fontWeight: 'bold', color: '#000000', marginTop: 12, marginBottom: 4 },
  field: { borderWidth: 1, borderColor: '#000000', borderRadius: 4, minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  fieldText: { fontSize: 15, color: '#000000' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: '#000000', borderRadius: 4, minHeight: 40, minWidth: 48, paddingHorizontal: 8, marginRight: 6, marginBottom: 6, alignItems: 'center', justifyContent: 'center' },
  chipSelected: { backgroundColor: '#000000' },
  chipText: { fontSize: 14, color: '#000000' },
  chipTextSelected: { color: '#ffffff', fontWeight: 'bold' },
  overlapWarning: {
    fontSize: 13, fontWeight: 'bold', color: '#000000', marginTop: 8,
    borderWidth: 1, borderColor: '#000000', paddingHorizontal: 8, paddingVertical: 6,
  },
  hint: { fontSize: 12, color: '#505050', marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  primaryBtn: { backgroundColor: '#000000', borderRadius: 4, paddingHorizontal: 16, minHeight: 46, justifyContent: 'center' },
  primaryText: { fontSize: 15, fontWeight: 'bold', color: '#ffffff' },
  secondaryBtn: { borderWidth: 1, borderColor: '#000000', borderRadius: 4, paddingHorizontal: 12, minHeight: 46, justifyContent: 'center' },
  secondaryText: { fontSize: 14, color: '#000000' },
});
