import { isPdfPath, LinkedFileMarker } from './LinkedFileMarker';
import { HandwritingTextInput, HandwritingTextInputHandle } from './HandwritingTextInput';
import { DatePickerModal } from './DatePickerModal';
import React, { useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Area, CalendarTask, Project, TaskPriority } from '../domain/types';
import { statusGlyph, taskRowLabel, taskStatus } from '../domain/taskModel';
import { canPostpone, postponeOptions } from '../domain/taskPostpone';
import {
  canHaveChildren,
  canMoveSubtask,
  displayParentId,
  expandRows,
  indexByUid,
  MoveDirection,
  subtaskProgress,
  withoutNestedChildren,
} from '../domain/subtasks';
import {
  TASK_GROUPINGS,
  TASK_SCOPES,
  TaskGrouping,
  TaskScope,
  countGrouped,
  filterByArea,
  activeProjects,
  filterByProject,
  filterByScope,
  groupTasks,
  groupingLabel,
  projectProgress,
  projectsInArea,
  scopeLabel,
} from '../domain/taskListView';

/** A subtask as described before it exists. */
export interface SubtaskDraft {
  title: string;
  dueDate?: Date;
  priority?: TaskPriority;
}

interface TaskListViewProps {
  tasks: CalendarTask[];
  areas: Area[];
  /** Area membership by task uid; it lives outside the task itself. */
  areaOf: (uid: string) => string | undefined;
  projects: Project[];
  projectOf: (uid: string) => string | undefined;
  onToggle: (task: CalendarTask) => void;
  onEdit: (task: CalendarTask) => void;
  notePathFor: (uid: string) => string | undefined;
  onLinkNote?: (task: CalendarTask) => void;
  onNoteAction: (task: CalendarTask, existingPath?: string) => void;
  /** Move a task's deadline to a date already chosen. */
  onPostpone?: (task: CalendarTask, to: Date) => void;
  /** Hang a new subtask off a top-level task. */
  onAddSubtask?: (parent: CalendarTask, draft: SubtaskDraft) => void;
  /** Move a subtask within its parent's sequence. */
  onReorderSubtask?: (task: CalendarTask, direction: MoveDirection) => void;
  weekStartsOn?: number;
  /** Hand the task to the app's date picker for an arbitrary date. */
  onPickPostponeDate?: (task: CalendarTask) => void;
}

/**
 * Every task in one place, which is where status and priority finally become
 * useful — until now they were a glyph on rows scattered across the Day View
 * and the month strip.
 *
 * Driven entirely by discrete taps. This display ghosts badly on frequent
 * redraws, so there is no search-as-you-type: you pick a scope and a grouping,
 * and the list repaints once.
 */
export function TaskListView({
  tasks,
  areas,
  areaOf,
  projects,
  projectOf,
  onToggle,
  onEdit,
  notePathFor,
  onNoteAction,
  onLinkNote,
  onPostpone,
  onPickPostponeDate,
  onAddSubtask,
  onReorderSubtask,
  weekStartsOn = 0,
}: TaskListViewProps): React.JSX.Element {
  const [scope, setScope] = useState<TaskScope>('open');
  /** The task whose deadline is being moved, while the chooser is open. */
  const [postponing, setPostponing] = useState<CalendarTask | null>(null);
  /** The task gaining a subtask, while its name is being typed. */
  const [namingSubtaskFor, setNamingSubtaskFor] = useState<CalendarTask | null>(null);
  const [subtaskDraft, setSubtaskDraft] = useState<string>('');
  const [subtaskDue, setSubtaskDue] = useState<Date | null>(null);
  const [subtaskPriority, setSubtaskPriority] = useState<TaskPriority | undefined>(undefined);
  const [pickingSubtaskDate, setPickingSubtaskDate] = useState<boolean>(false);
  const subtaskInputRef = useRef<HandwritingTextInputHandle | null>(null);
  /** Parents whose subtasks are showing. Collapsed is the default: a parent
   *  with eight steps would otherwise bury everything below it. */
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [grouping, setGrouping] = useState<TaskGrouping>('due');
  const [areaId, setAreaId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  const lookup = {
    areaOf,
    nameOf: (id: string) => areas.find(a => a.id === id)?.name || 'Area',
  };
  const projectLookup = {
    projectOf,
    nameOf: (id: string) => projects.find(p => p.id === id)?.name || 'Project',
  };

  const scoped = filterByProject(
    filterByArea(filterByScope(tasks, scope), areaId, lookup),
    projectId,
    projectLookup
  );

  // Subtasks follow their parent, not their own date, so they are taken out
  // before grouping; expandRows puts them back under the parent they belong
  // to, wherever that row lands.
  const byUid = indexByUid(tasks);
  const groups = groupTasks(
    withoutNestedChildren(tasks, scoped),
    grouping,
    new Date(),
    lookup,
    projectLookup
  );
  const total = countGrouped(groups);

  /**
   * Filtering to one area makes grouping by area pointless — every row would
   * land in a single heading — so the grouping steps aside.
   */
  const chooseArea = (next: string | null) => {
    setAreaId(next);
    if (next && grouping === 'area') setGrouping('due');
    // A project filter from another area would silently show nothing.
    if (projectId && next && !projects.some(p => p.id === projectId && p.areaId === next)) {
      setProjectId(null);
    }
  };

  const chooseProject = (next: string | null) => {
    setProjectId(next);
    if (next && grouping === 'project') setGrouping('due');
  };

  /**
   * Only the projects belonging to the selected area.
   *
   * This is the hierarchy made visible: pick ENG 102 and you are offered its
   * projects, not every project you have. Without it, Areas and Projects are
   * two parallel lists and choosing between them is arbitrary.
   */
  const offeredProjects = projectsInArea(activeProjects(projects), areaId);

  /**
   * Says which filter emptied the list.
   *
   * "Nothing here" is true but unhelpful — a project with no area disappears
   * the moment an area is selected, and the list going quiet gives no clue
   * that a filter did it.
   */
  const emptyReason = (() => {
    if (projectId) {
      const name = projects.find(p => p.id === projectId)?.name;
      return `No ${scopeLabel(scope).toLowerCase()} tasks in ${name || 'this project'}.`;
    }
    if (areaId) {
      const name = areas.find(a => a.id === areaId)?.name;
      return `No ${scopeLabel(scope).toLowerCase()} tasks in ${name || 'this area'}.`;
    }
    return `Nothing ${scopeLabel(scope).toLowerCase()}.`;
  })();

  return (
    <View style={styles.root}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={styles.headerTitle}>
              ☑ All Tasks ({total})
            </Text>
          </View>

          <Text allowFontScaling={false} style={styles.filterLabel}>
            Show
          </Text>
          <View style={styles.chipRow}>
            {TASK_SCOPES.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, scope === s && styles.chipActive]}
                onPress={() => setScope(s)}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.chipText, scope === s && styles.chipTextActive]}
                >
                  {scopeLabel(s)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text allowFontScaling={false} style={styles.filterLabel}>
            Group by
          </Text>
          <View style={styles.chipRow}>
            {TASK_GROUPINGS.map(g => (
              <TouchableOpacity
                key={g}
                style={[styles.chip, grouping === g && styles.chipActive]}
                onPress={() => setGrouping(g)}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.chipText, grouping === g && styles.chipTextActive]}
                >
                  {groupingLabel(g)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {areas.length > 0 && (
            <>
              <Text allowFontScaling={false} style={styles.filterLabel}>
                Area
              </Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, areaId === null && styles.chipActive]}
                  onPress={() => chooseArea(null)}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.chipText, areaId === null && styles.chipTextActive]}
                  >
                    All
                  </Text>
                </TouchableOpacity>

                {areas
                  .filter(a => !a.archived)
                  .map(a => (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.chip, areaId === a.id && styles.chipActive]}
                      onPress={() => chooseArea(a.id)}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.chipText, areaId === a.id && styles.chipTextActive]}
                      >
                        {a.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </>
          )}

          {offeredProjects.length > 0 && (
            <>
              <Text allowFontScaling={false} style={styles.filterLabel}>
                Project
              </Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, projectId === null && styles.chipActive]}
                  onPress={() => chooseProject(null)}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.chipText, projectId === null && styles.chipTextActive]}
                  >
                    All
                  </Text>
                </TouchableOpacity>

                {offeredProjects.map(p => {
                  const progress = projectProgress(tasks, p.id, projectLookup);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.chip, projectId === p.id && styles.chipActive]}
                      onPress={() => chooseProject(p.id)}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.chipText, projectId === p.id && styles.chipTextActive]}
                      >
                        {p.name} {progress.done}/{progress.total}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {groups.length === 0 ? (
              <Text allowFontScaling={false} style={styles.empty}>
                {emptyReason}
              </Text>
            ) : (
              groups.map(group => (
                <View key={group.key}>
                  {group.label ? (
                    <Text allowFontScaling={false} style={styles.groupHeading}>
                      {group.label} ({group.tasks.length})
                    </Text>
                  ) : null}

                  {expandRows(tasks, group.tasks, expandedParents).map(({ task, depth }) => {
                    const notePath = notePathFor(task.uid);
                    // Counted across every task, not just the ones this filter
                    // shows: with Open selected, a parent whose completed
                    // subtask is hidden would otherwise read 0/1 and deny that
                    // the finished one exists.
                    const progress = depth === 0 ? subtaskProgress(tasks, task.uid) : undefined;
                    const expanded = expandedParents.has(task.uid);
                    const parentUid = depth === 1 ? displayParentId(task, byUid) : undefined;
                    return (
                    <View key={task.uid} style={[styles.row, depth === 1 && styles.rowNested]}>
                      <TouchableOpacity onPress={() => onToggle(task)} style={styles.check}>
                        <Text allowFontScaling={false} style={styles.checkText}>
                          {statusGlyph(taskStatus(task))}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.rowBody} onPress={() => onEdit(task)}>
                        <Text
                          allowFontScaling={false}
                          numberOfLines={1}
                          style={[styles.rowText, task.completed && styles.rowTextDone]}
                        >
                          <LinkedFileMarker item={task} />{taskRowLabel(task, true)}
                        </Text>
                      </TouchableOpacity>

                      {/* The count is the control: a number alone told you
                          subtasks existed without giving you any way to see
                          them. */}
                      {progress && (
                        <TouchableOpacity
                          style={styles.progressButton}
                          onPress={() => setExpandedParents(current => {
                            const next = new Set(current);
                            if (next.has(task.uid)) next.delete(task.uid);
                            else next.add(task.uid);
                            return next;
                          })}
                          accessibilityLabel={`${expanded ? 'Hide' : 'Show'} subtasks of ${task.title}`}
                        >
                          <Text allowFontScaling={false} style={styles.progressText}>
                            {expanded ? '▾' : '▸'} {progress.label}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* Only where another level can exist: a subtask cannot
                          take subtasks, and a promoted orphan is still one. */}
                      {onAddSubtask && canHaveChildren(task, byUid) && (
                        <TouchableOpacity
                          style={styles.noteButton}
                          onPress={() => {
                            setNamingSubtaskFor(task);
                            setSubtaskDraft('');
                            setSubtaskDue(null);
                            setSubtaskPriority(undefined);
                          }}
                          accessibilityLabel={`Add a subtask to ${task.title}`}
                        >
                          <Text allowFontScaling={false} style={styles.noteButtonText}>＋ Sub</Text>
                        </TouchableOpacity>
                      )}

                      {/* Steps have an order of their own, so they can be
                          arranged. Only the direction that can act is drawn:
                          a dimmed arrow at the end of a list is still a tap
                          that does nothing. */}
                      {onReorderSubtask && parentUid && canMoveSubtask(tasks, parentUid, task.uid, 'up') && (
                        <TouchableOpacity
                          style={styles.moveButton}
                          onPress={() => onReorderSubtask(task, 'up')}
                          accessibilityLabel={`Move ${task.title} up`}
                        >
                          <Text allowFontScaling={false} style={styles.moveButtonText}>▲</Text>
                        </TouchableOpacity>
                      )}
                      {onReorderSubtask && parentUid && canMoveSubtask(tasks, parentUid, task.uid, 'down') && (
                        <TouchableOpacity
                          style={styles.moveButton}
                          onPress={() => onReorderSubtask(task, 'down')}
                          accessibilityLabel={`Move ${task.title} down`}
                        >
                          <Text allowFontScaling={false} style={styles.moveButtonText}>▼</Text>
                        </TouchableOpacity>
                      )}

                      {/* Pushing a deadline out was five presses through the
                          edit form, which is why it never got used. Offered
                          only where it means something: a dated, unfinished
                          task. */}
                      {onPostpone && canPostpone(task) && (
                        <TouchableOpacity
                          style={styles.noteButton}
                          onPress={() => setPostponing(task)}
                          accessibilityLabel={`Postpone ${task.title}`}
                        >
                          <Text allowFontScaling={false} style={styles.noteButtonText}>⏭ Later</Text>
                        </TouchableOpacity>
                      )}

                      {!notePath && onLinkNote && (
                        <TouchableOpacity style={styles.noteButton} onPress={() => onLinkNote(task)}>
                          <Text allowFontScaling={false} style={styles.noteButtonText}>Link Note / PDF</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.noteButton}
                        onPress={() => onNoteAction(task, notePath)}
                        accessibilityLabel={notePath ? `Open note for ${task.title}` : `Create note for ${task.title}`}
                      >
                        <Text allowFontScaling={false} style={styles.noteButtonText}>
                          {notePath ? (isPdfPath(notePath) ? '📄 Open PDF' : '📂 Open Note') : '📝 Create Note'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>

      {/* Each option says where it lands, so a tap is never a guess about
          what "next week" meant from an overdue date. */}
      {/* Named before it exists, like a new note: a subtask called "Untitled"
          that you rename afterwards is two steps and one regret. */}
      <Modal visible={namingSubtaskFor !== null} transparent animationType="fade">
        <TouchableOpacity
          style={styles.postponeOverlay}
          activeOpacity={1}
          onPress={() => setNamingSubtaskFor(null)}
        >
          <View style={styles.postponeSheet}>
            <Text allowFontScaling={false} style={styles.postponeTitle} numberOfLines={2}>
              Subtask of "{namingSubtaskFor?.title}"
            </Text>
            <HandwritingTextInput
              ref={input => { subtaskInputRef.current = input; }}
              style={styles.subtaskInput}
              value={subtaskDraft}
              onChangeText={setSubtaskDraft}
              placeholder="What needs doing"
              autoCorrect={false}
            />
            {/* Both optional. A step often has no date of its own, and
                saying so beats a date you have to go back and clear. */}
            <TouchableOpacity
              style={styles.postponeOption}
              onPress={() => setPickingSubtaskDate(true)}
            >
              <Text allowFontScaling={false} style={styles.postponeOptionText}>Due</Text>
              <Text allowFontScaling={false} style={styles.postponeOptionDate}>
                {subtaskDue
                  ? subtaskDue.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                  : 'No date'}
              </Text>
            </TouchableOpacity>
            {subtaskDue && (
              <TouchableOpacity style={styles.postponeCancel} onPress={() => setSubtaskDue(null)}>
                <Text allowFontScaling={false} style={styles.postponeCancelText}>Clear the date</Text>
              </TouchableOpacity>
            )}

            <Text allowFontScaling={false} style={styles.filterLabel}>Priority</Text>
            <View style={styles.chipRow}>
              {([
                [undefined, 'None'],
                [2, 'Low'],
                [3, 'Medium'],
                [4, 'High'],
              ] as Array<[TaskPriority | undefined, string]>).map(([value, label]) => (
                <TouchableOpacity
                  key={label}
                  style={[styles.chip, subtaskPriority === value && styles.chipActive]}
                  onPress={() => setSubtaskPriority(value)}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.chipText, subtaskPriority === value && styles.chipTextActive]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.postponeOption}
              onPress={() => {
                // Read at press time: handwriting commits on blur, so state
                // still holds the previous value when the button is tapped.
                const typed = (subtaskInputRef.current?.getValue() ?? subtaskDraft).trim();
                const parent = namingSubtaskFor;
                if (!typed || !parent) return;
                setNamingSubtaskFor(null);
                setSubtaskDraft('');
                if (onAddSubtask) {
                  onAddSubtask(parent, {
                    title: typed,
                    dueDate: subtaskDue ?? undefined,
                    priority: subtaskPriority,
                  });
                }
              }}
            >
              <Text allowFontScaling={false} style={styles.postponeOptionText}>Add it</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.postponeCancel} onPress={() => setNamingSubtaskFor(null)}>
              <Text allowFontScaling={false} style={styles.postponeCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <DatePickerModal
        visible={pickingSubtaskDate}
        value={subtaskDue ?? new Date()}
        weekStartsOn={weekStartsOn}
        onSelect={date => { setSubtaskDue(date); setPickingSubtaskDate(false); }}
        onClose={() => setPickingSubtaskDate(false)}
      />

      <Modal visible={postponing !== null} transparent animationType="fade">
        <TouchableOpacity
          style={styles.postponeOverlay}
          activeOpacity={1}
          onPress={() => setPostponing(null)}
        >
          <View style={styles.postponeSheet}>
            <Text allowFontScaling={false} style={styles.postponeTitle} numberOfLines={2}>
              Move "{postponing?.title}"
            </Text>
            {postponing?.dueDate && (
              <Text allowFontScaling={false} style={styles.postponeCurrent}>
                Due {new Date(postponing.dueDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
            )}

            {(postponing ? postponeOptions(postponing) : []).map(option => (
              <TouchableOpacity
                key={option.id}
                style={styles.postponeOption}
                onPress={() => {
                  const task = postponing;
                  setPostponing(null);
                  if (task && onPostpone) onPostpone(task, option.date);
                }}
              >
                <Text allowFontScaling={false} style={styles.postponeOptionText}>
                  {option.label}
                </Text>
                <Text allowFontScaling={false} style={styles.postponeOptionDate}>
                  {option.dateLabel}
                </Text>
              </TouchableOpacity>
            ))}

            {onPickPostponeDate && (
              <TouchableOpacity
                style={styles.postponeOption}
                onPress={() => {
                  const task = postponing;
                  setPostponing(null);
                  if (task) onPickPostponeDate(task);
                }}
              >
                <Text allowFontScaling={false} style={styles.postponeOptionText}>
                  Pick a date...
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.postponeCancel} onPress={() => setPostponing(null)}>
              <Text allowFontScaling={false} style={styles.postponeCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills its pane like Month and Day View. The dimmed overlay and the boxed
  // 88%-wide sheet are what made this read as something stacked on top of the
  // app rather than part of it.
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    paddingBottom: 6,
    marginBottom: 6,
  },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#000000' },
  manageBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
  },
  manageText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  filterLabel: { fontSize: 11, fontWeight: 'bold', color: '#505050', marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  chip: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginRight: 5,
    marginTop: 4,
    backgroundColor: '#ffffff',
  },
  chipActive: { backgroundColor: '#000000' },
  chipText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  chipTextActive: { color: '#ffffff' },
  list: { marginTop: 6 },
  groupHeading: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
    backgroundColor: '#e8e8e8',
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginTop: 8,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#d0d0d0',
    paddingVertical: 7,
  },
  check: { paddingHorizontal: 6, paddingVertical: 2 },
  checkText: { fontSize: 16, color: '#000000' },
  rowBody: { flex: 1, paddingRight: 4 },
  rowText: { fontSize: 13, color: '#000000' },
  rowTextDone: { textDecorationLine: 'line-through', color: '#606060' },
  noteButton: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginLeft: 4,
  },
  noteButtonText: { fontSize: 11, fontWeight: 'bold', color: '#000000' },
  empty: { fontSize: 13, color: '#505050', textAlign: 'center', paddingVertical: 20 },
  postponeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postponeSheet: {
    width: '70%',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 8,
    padding: 12,
  },
  postponeTitle: { fontSize: 14, fontWeight: 'bold', color: '#000000' },
  postponeCurrent: { fontSize: 11, color: '#505050', marginTop: 2, marginBottom: 6 },
  postponeOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 10,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    marginTop: 6,
  },
  postponeOptionText: { fontSize: 13, fontWeight: 'bold', color: '#000000' },
  // Indented, with a rule down the left so a subtask reads as belonging to
  // the row above it rather than as a short title.
  rowNested: { paddingLeft: 26, borderLeftWidth: 2, borderLeftColor: '#909090' },
  progressText: { fontSize: 11, fontWeight: 'bold', color: '#303030' },
  moveButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 7,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    marginRight: 4,
  },
  moveButtonText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  progressButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    marginRight: 4,
  },
  subtaskInput: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 8,
    minHeight: 44,
    fontSize: 13,
    color: '#000000',
    marginTop: 8,
  },
  postponeOptionDate: { fontSize: 12, color: '#303030' },
  postponeCancel: {
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  postponeCancelText: { fontSize: 12, fontWeight: 'bold', color: '#505050' },
});
