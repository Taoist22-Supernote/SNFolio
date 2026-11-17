import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { HandwritingTextInput, HandwritingTextInputHandle } from './HandwritingTextInput';
import { formatDuration } from '../domain/timeOfDay';
import { PlannedStep, planSteps, shiftStepDay, STEP_TEMPLATES } from '../domain/stepPlans';
import { CalendarTask } from '../domain/types';

interface StepPlanModalProps {
  /** The assignment being planned. It has a due date: the form only offers this then. */
  task: CalendarTask & { dueDate: Date };
  /** Today, from the caller, so a plan made at 11 PM still starts today. */
  today: Date;
  /** The steps as seen and adjusted here, in order. */
  onAdd: (task: CalendarTask, steps: PlannedStep[]) => void;
  onClose: () => void;
}

const dayLabel = (day: Date) =>
  day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * Choose a step list for an assignment, then see and adjust the plan before
 * anything is added (CT, 2026-11-17). Each step becomes a subtask due on its
 * day, with a session in that day's first free slot.
 */
export function StepPlanModal({ task, today, onAdd, onClose }: StepPlanModalProps): React.JSX.Element {
  const [templateId, setTemplateId] = React.useState<string | null>(null);
  const [steps, setSteps] = React.useState<PlannedStep[]>([]);
  // Handwriting commits on blur, so titles are read from the inputs on Add.
  const inputs = React.useRef<(HandwritingTextInputHandle | null)[]>([]);

  const choose = (id: string) => {
    const template = STEP_TEMPLATES.find(t => t.id === id);
    if (!template) {return;}
    setTemplateId(id);
    setSteps(planSteps(template, today, task.dueDate));
    inputs.current = [];
  };

  /** Titles as typed so far, so moving or dropping a row keeps what was written. */
  const withTypedTitles = (): PlannedStep[] =>
    steps.map((step, index) => ({ ...step, title: inputs.current[index]?.getValue() ?? step.title }));

  const shift = (index: number, by: number) => {
    setSteps(withTypedTitles().map((step, i) =>
      i === index ? { ...step, day: shiftStepDay(step.day, by, today, task.dueDate) } : step));
  };
  const drop = (index: number) => {
    const kept = withTypedTitles().filter((_, i) => i !== index);
    inputs.current = [];
    setSteps(kept);
  };
  const add = () => {
    const ready = withTypedTitles()
      .map(step => ({ ...step, title: step.title.trim() }))
      .filter(step => step.title);
    if (ready.length) {onAdd(task, ready);}
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={styles.title}>Plan from steps</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
              <Text allowFontScaling={false} style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text allowFontScaling={false} style={styles.taskTitle} numberOfLines={2}>
            {task.title} · due {dayLabel(task.dueDate)}
          </Text>

          <Text allowFontScaling={false} style={styles.label}>Steps for</Text>
          <View style={styles.chipRow}>
            {STEP_TEMPLATES.map(template => (
              <TouchableOpacity
                key={template.id}
                style={[styles.chip, templateId === template.id && styles.chipSelected]}
                onPress={() => choose(template.id)}
                accessibilityLabel={`Use the ${template.name} steps`}
              >
                <Text allowFontScaling={false} style={[styles.chipText, templateId === template.id && styles.chipTextSelected]}>
                  {template.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {templateId === null ? (
            <Text allowFontScaling={false} style={styles.hint}>
              Choose a list to see the plan. Nothing is added until you press Add.
            </Text>
          ) : (
            <>
              <Text allowFontScaling={false} style={styles.hint}>
                Spread from today to the day before it is due. Each step gets that day and a session in its first free slot. Rename, move or drop any step first.
              </Text>
              <ScrollView style={styles.list}>
                {steps.map((step, index) => (
                  <View key={`${templateId}-${index}-${steps.length}`} style={styles.row}>
                    <HandwritingTextInput
                      ref={input => { inputs.current[index] = input; }}
                      style={styles.titleInput}
                      value={step.title}
                      autoCorrect={false}
                    />
                    <View style={styles.rowMeta}>
                      <TouchableOpacity style={styles.smallBtn} onPress={() => shift(index, -1)} accessibilityLabel={`${step.title} a day earlier`}>
                        <Text allowFontScaling={false} style={styles.smallBtnText}>‹</Text>
                      </TouchableOpacity>
                      <Text allowFontScaling={false} style={styles.dayText}>{dayLabel(step.day)}</Text>
                      <TouchableOpacity style={styles.smallBtn} onPress={() => shift(index, 1)} accessibilityLabel={`${step.title} a day later`}>
                        <Text allowFontScaling={false} style={styles.smallBtnText}>›</Text>
                      </TouchableOpacity>
                      <Text allowFontScaling={false} style={styles.minutesText}>{formatDuration(step.minutes)}</Text>
                      <TouchableOpacity style={styles.smallBtn} onPress={() => drop(index)} accessibilityLabel={`Drop ${step.title}`}>
                        <Text allowFontScaling={false} style={styles.smallBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
              <Text allowFontScaling={false} style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
            {templateId !== null && steps.length > 0 && (
              <TouchableOpacity style={styles.primaryBtn} onPress={add} accessibilityLabel={`Add ${steps.length} steps`}>
                <Text allowFontScaling={false} style={styles.primaryText}>
                  Add {steps.length} step{steps.length === 1 ? '' : 's'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  content: { backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#000000', borderRadius: 8, padding: 14, width: 460, maxWidth: '94%', maxHeight: '92%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: 'bold', color: '#000000' },
  closeBtn: { minWidth: 44, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 17, color: '#000000' },
  taskTitle: { fontSize: 15, fontWeight: 'bold', color: '#000000', marginTop: 2 },
  label: { fontSize: 13, fontWeight: 'bold', color: '#000000', marginTop: 12, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: '#000000', borderRadius: 4, minHeight: 40, paddingHorizontal: 10, marginRight: 6, marginBottom: 6, alignItems: 'center', justifyContent: 'center' },
  chipSelected: { backgroundColor: '#000000' },
  chipText: { fontSize: 14, color: '#000000' },
  chipTextSelected: { color: '#ffffff', fontWeight: 'bold' },
  hint: { fontSize: 12, color: '#505050', marginTop: 4 },
  list: { marginTop: 8, flexGrow: 0 },
  row: { borderTopWidth: 1, borderColor: '#b0b0b0', paddingVertical: 6 },
  titleInput: { borderWidth: 1, borderColor: '#000000', borderRadius: 4, minHeight: 40, paddingHorizontal: 8, fontSize: 15, color: '#000000' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  smallBtn: { borderWidth: 1, borderColor: '#000000', borderRadius: 4, minWidth: 40, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { fontSize: 16, fontWeight: 'bold', color: '#000000' },
  dayText: { fontSize: 14, color: '#000000', minWidth: 110, textAlign: 'center' },
  minutesText: { fontSize: 13, color: '#505050', flex: 1, textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  primaryBtn: { backgroundColor: '#000000', borderRadius: 4, paddingHorizontal: 16, minHeight: 46, justifyContent: 'center' },
  primaryText: { fontSize: 15, fontWeight: 'bold', color: '#ffffff' },
  secondaryBtn: { borderWidth: 1, borderColor: '#000000', borderRadius: 4, paddingHorizontal: 12, minHeight: 46, justifyContent: 'center' },
  secondaryText: { fontSize: 14, color: '#000000' },
});
