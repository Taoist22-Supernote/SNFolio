import React from 'react';
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { sinceLabel, type ResurfaceAtom } from '../domain/atomsResurface';

/**
 * The Resurface ideas from the Atoms plugin, opened from the one-line strip at
 * the top of the Day Planner's right column (CT, 2026-11-10: a full section
 * there crowded the column). Three ideas, each with Open Source, Not Now and
 * Don't Resurface. Fixed height: three cards and a Close, never a scroll.
 */
export function ResurfacePanel({ atoms, gapDays, message, onOpenSource, onNotNow, onDismiss, onClose }: {
  atoms: ResurfaceAtom[];
  /** Atoms' Resurface setting, for the explanation line. */
  gapDays: number;
  message: string;
  onOpenSource: (atom: ResurfaceAtom) => void;
  onNotNow: (atom: ResurfaceAtom) => void;
  onDismiss: (atom: ResurfaceAtom) => void;
  onClose: () => void;
}): React.JSX.Element {
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => subscription.remove();
  }, [onClose]);

  const gap = gapDays === 7 ? 'a week' : gapDays === 30 ? 'a month' : gapDays === 90 ? '3 months' : `${gapDays} days`;
  const now = Date.now();

  return <View style={styles.overlay} accessibilityViewIsModal>
    <View style={styles.dialog}>
      <Text allowFontScaling={false} style={styles.heading}>💡 Resurface</Text>
      <Text allowFontScaling={false} style={styles.text}>
        {atoms.length
          ? `Ideas from Atoms you haven’t opened in ${gap} or more.`
          : 'Nothing left to resurface today.'}
      </Text>
      {message ? <Text allowFontScaling={false} style={styles.message}>{message}</Text> : null}

      {atoms.map(atom => (
        <View key={atom.id} style={styles.card}>
          <Text allowFontScaling={false} style={styles.title} numberOfLines={2}>{atom.title}</Text>
          <Text allowFontScaling={false} style={styles.words} numberOfLines={3}>{atom.words}</Text>
          <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
            {`${atom.source.title} · p. ${atom.source.page + 1} · not opened in ${sinceLabel(atom.lastSeen, now)}`}
          </Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.button} onPress={() => onOpenSource(atom)}>
              <Text allowFontScaling={false} style={styles.buttonText}>Open Source</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => onNotNow(atom)}>
              <Text allowFontScaling={false} style={styles.buttonText}>Not Now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => onDismiss(atom)}>
              <Text allowFontScaling={false} style={styles.buttonText}>Don’t Resurface</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primary} onPress={onClose}>
          <Text allowFontScaling={false} style={styles.primaryText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  dialog: { maxHeight: '94%', backgroundColor: '#fff', borderWidth: 2, borderColor: '#000', padding: 16 },
  heading: { fontSize: 18, fontWeight: 'bold', color: '#000', marginBottom: 6 },
  text: { fontSize: 14, lineHeight: 20, color: '#000', marginBottom: 8 },
  message: { fontSize: 14, fontWeight: 'bold', color: '#000', borderLeftWidth: 4, borderLeftColor: '#000', paddingLeft: 8, marginBottom: 8 },
  card: { borderWidth: 1, borderColor: '#000', padding: 10, marginBottom: 8 },
  title: { fontSize: 15, fontWeight: 'bold', color: '#000' },
  words: { fontSize: 14, lineHeight: 20, color: '#000', marginTop: 4 },
  meta: { fontSize: 12, color: '#404040', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6 },
  button: { minHeight: 42, borderWidth: 1, borderColor: '#000', borderRadius: 4, paddingHorizontal: 12, justifyContent: 'center', marginRight: 8, marginVertical: 2 },
  buttonText: { fontSize: 14, fontWeight: 'bold', color: '#000' },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  primary: { minHeight: 46, backgroundColor: '#000', borderRadius: 4, paddingHorizontal: 16, justifyContent: 'center' },
  primaryText: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
});
