"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity, ArrowDown, ArrowLeft, ArrowUp, BarChart3, Check, ChevronRight, CirclePause,
  CirclePlay, Clock3, Cloud, CloudOff, Copy, Calculator, Database, Download, Dumbbell, History,
  ExternalLink, Gauge, HelpCircle, Minus, Pencil, Play, Plus, RefreshCw, RotateCcw, Save, Settings2, ShieldCheck, Sparkles,
  Square, Trash2, TrendingDown, TrendingUp, Trophy, Upload, X,
} from "lucide-react";
import { DEFAULT_TRAINING_PREFERENCES, db, deleteRoutinePreservingHistory, exportBackup, getTrainingPreferences, importBackup, initializeDatabase, saveTrainingPreferences } from "../lib/db";
import { cloudSyncIsDue, markLocalDataChanged, syncCloudBackup } from "../lib/cloud-sync";
import { calculatePlateLoading, deloadRoutine, deloadStatus, exerciseProgress, exerciseSetComparison, freshSet, historyCsv, measurementReminder, personalRecords, previousExerciseLog, progressionSuggestion, routineSetCountChanges, routineWithWorkoutDefaults, sessionStats, timerRemaining, uid, validateBackup, workoutComparison, workoutWithoutSet, type DeloadStatus, type MeasurementReminder, type PersonalRecord } from "../lib/domain";
import { athleticDemoUrl, athleticGuideFor, type AthleticGuide } from "../lib/athletic-guides";
import { measurementLabels, measurementTypes, setTypes, type BodyMeasurement, type Exercise, type ExerciseLog, type MeasurementType, type Routine, type RoutineVersion, type SetLog, type TrainingPreferences, type WorkoutSession } from "../lib/types";

const AnalyticsDashboard = dynamic(() => import("./AnalyticsDashboard").then((module) => module.AnalyticsDashboard), { ssr: false, loading: () => <div className="loading-inline">Loading insights…</div> });
const ExerciseTrendChart = dynamic(() => import("./AnalyticsDashboard").then((module) => module.ExerciseTrendChart), { ssr: false, loading: () => <div className="chart-empty">Loading trend…</div> });

type Tab = "routines" | "history" | "progress" | "data";
type ProgressView = "overview" | "exercises" | "calendar" | "measurements";
type ConfirmState = { title: string; body: string; action: () => void | Promise<void> } | null;
type SyncStatus = "starting" | "syncing" | "synced" | "offline" | "error";
type RoutineUpdateState = { session: WorkoutSession; routine: Routine; changes: ReturnType<typeof routineSetCountChanges> } | null;
type PrCelebrationState = { session: WorkoutSession; records: PersonalRecord[] } | null;

const secondsLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const elapsedSeconds = (startedAt: string, now: number) => Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
const timeLabel = (value: string) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
const num = (value: string) => value === "" ? undefined : Number(value);
const previousSetLabel = (set?: SetLog) => {
  if (!set) return "—";
  if (set.weightKg !== undefined && set.repetitions !== undefined) return `${set.weightKg} × ${set.repetitions}`;
  if (set.repetitions !== undefined) return `${set.repetitions} reps`;
  if (set.distanceMetres !== undefined && set.durationSeconds !== undefined) return `${set.distanceMetres} m × ${set.durationSeconds} sec`;
  if (set.distanceMetres !== undefined) return `${set.distanceMetres} m`;
  if (set.durationSeconds !== undefined) return `${set.durationSeconds} sec`;
  return "—";
};
const playTimerChime = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.34);
    oscillator.addEventListener("ended", () => context.close());
  } catch { /* Audio can be blocked until the first user gesture. */ }
};

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.currentTarget === e.target && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={21} /></button></div>
      {children}
    </section>
  </div>;
}

function Empty({ icon: Icon, title, body }: { icon: typeof Dumbbell; title: string; body: string }) {
  return <div className="empty"><Icon size={30} /><h3>{title}</h3><p>{body}</p></div>;
}

function SetTypePill({ type }: { type: SetLog["setType"] }) {
  return <span className={`set-pill ${type}`}>{type === "warmup" ? "W" : type === "working" ? "S" : type === "failure" ? "F" : "D"}</span>;
}

function DecimalInput({ value, onValueChange, ariaLabel, placeholder = "—", disabled = false, autoFocus = false, min = 0, max }: {
  value?: number;
  onValueChange: (value: number | undefined) => void;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value === undefined ? "" : String(value));
  }, [value]);

  function updateDraft(raw: string) {
    const normalized = raw.replace(",", ".");
    if (!/^\d*(?:\.\d*)?$/.test(normalized)) return;
    setDraft(raw);
    if (normalized === "") {
      onValueChange(undefined);
      return;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed) && parsed >= min && (max === undefined || parsed <= max)) onValueChange(parsed);
  }

  function finishEditing() {
    focused.current = false;
    const normalized = draft.replace(",", ".");
    const parsed = Number(normalized);
    if (normalized !== "" && Number.isFinite(parsed) && parsed >= min && (max === undefined || parsed <= max)) {
      setDraft(String(parsed));
      onValueChange(parsed);
    } else {
      setDraft(value === undefined ? "" : String(value));
    }
  }

  return <input
    type="text"
    inputMode="decimal"
    pattern="[0-9]*[.,]?[0-9]*"
    aria-label={ariaLabel}
    placeholder={placeholder}
    disabled={disabled}
    autoFocus={autoFocus}
    value={draft}
    onFocus={() => { focused.current = true; }}
    onChange={(event) => updateDraft(event.target.value)}
    onBlur={finishEditing}
  />;
}

export default function TrackerApp() {
  const [tab, setTab] = useState<Tab>("routines");
  const [progressInitialView, setProgressInitialView] = useState<ProgressView>("overview");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [routineVersions, setRoutineVersions] = useState<RoutineVersion[]>([]);
  const [preferences, setPreferences] = useState<TrainingPreferences>(DEFAULT_TRAINING_PREFERENCES);
  const [active, setActive] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [routineEditor, setRoutineEditor] = useState<Routine | null>(null);
  const [routineDetail, setRoutineDetail] = useState<Routine | null>(null);
  const [newExerciseFor, setNewExerciseFor] = useState<Routine | null>(null);
  const [historyDetail, setHistoryDetail] = useState<WorkoutSession | null>(null);
  const [exerciseDetail, setExerciseDetail] = useState<Exercise | null>(null);
  const [replaceLog, setReplaceLog] = useState<ExerciseLog | null>(null);
  const [timerNow, setTimerNow] = useState(Date.now());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("starting");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState("");
  const [routineUpdate, setRoutineUpdate] = useState<RoutineUpdateState>(null);
  const [athleticGuide, setAthleticGuide] = useState<AthleticGuide | null>(null);
  const [prCelebration, setPrCelebration] = useState<PrCelebrationState>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const previousTimerRemaining = useRef(0);

  const refresh = useCallback(async () => {
    const [nextRoutines, nextExercises, nextSessions, nextMeasurements, nextVersions, nextPreferences] = await Promise.all([
      db.routines.orderBy("position").toArray(), db.exercises.orderBy("name").toArray(), db.sessions.reverse().sortBy("startedAt"),
      db.measurements.reverse().sortBy("measuredAt"), db.routineVersions.reverse().sortBy("createdAt"), getTrainingPreferences(),
    ]);
    setRoutines(nextRoutines);
    setExercises(nextExercises);
    setSessions(nextSessions);
    setMeasurements(nextMeasurements);
    setRoutineVersions(nextVersions);
    setPreferences(nextPreferences);
  }, []);

  const runCloudSync = useCallback(async (manual = false) => {
    setSyncStatus("syncing");
    setSyncError("");
    try {
      const result = await syncCloudBackup();
      setLastSyncedAt(result.syncedAt);
      setSyncStatus("synced");
      await refresh();
      if (manual) setNotice(result.action === "restored" ? "Latest cloud data restored." : result.action === "merged" ? "Changes from both devices were merged." : "Cloud backup is up to date.");
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cloud sync is unavailable.";
      setSyncError(message);
      setSyncStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
      if (manual) setNotice(message);
      return null;
    }
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        await initializeDatabase();
        await refresh();
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) void runCloudSync(false);
    };
    void boot();
    return () => { cancelled = true; };
  }, [refresh, runCloudSync]);
  useEffect(() => { const id = window.setInterval(() => setTimerNow(Date.now()), 500); return () => window.clearInterval(id); }, []);
  useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(""), 2600); return () => clearTimeout(id); }, [notice]);
  useEffect(() => {
    let debounce: number | undefined;
    const syncSoon = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => runCloudSync(false), 5000);
    };
    const syncIfDue = () => {
      if (document.visibilityState !== "visible") return;
      cloudSyncIsDue().then((due) => { if (due) runCloudSync(false); });
    };
    const onVisibility = () => { setTimerNow(Date.now()); syncIfDue(); };
    window.addEventListener("ironlog:data-changed", syncSoon);
    window.addEventListener("online", syncIfDue);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(syncIfDue, 3 * 60 * 60 * 1000);
    return () => {
      window.clearTimeout(debounce);
      window.clearInterval(interval);
      window.removeEventListener("ironlog:data-changed", syncSoon);
      window.removeEventListener("online", syncIfDue);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [runCloudSync]);

  const completed = useMemo(() => sessions.filter((session) => session.status === "completed"), [sessions]);
  const deload = useMemo(() => deloadStatus(completed), [completed]);
  const measurementCheck = useMemo(() => measurementReminder(measurements), [measurements]);
  const pendingActive = useMemo(() => sessions.find((session) => session.status === "active" || session.status === "paused"), [sessions]);
  const timerSession = active ?? pendingActive;
  const remaining = timerRemaining(timerSession?.timerEndsAt, timerNow);
  useEffect(() => {
    if (previousTimerRemaining.current > 0 && remaining === 0) {
      if (preferences.timerSound) playTimerChime();
      if (preferences.timerHaptics && navigator.vibrate) navigator.vibrate([80, 50, 120]);
    }
    previousTimerRemaining.current = remaining;
  }, [remaining, preferences.timerHaptics, preferences.timerSound]);

  async function storeRoutineVersion(routine: Routine, reason: string) {
    await db.routineVersions.put({ id: uid(), routineId: routine.id, routineName: routine.name, createdAt: new Date().toISOString(), reason, snapshot: structuredClone(routine) });
  }

  function confirmDiscardWorkout(session: WorkoutSession) {
    setConfirm({
      title: "Discard workout?",
      body: "This active session and every logged set will be permanently deleted.",
      action: async () => {
        await db.sessions.delete(session.id);
        await markLocalDataChanged();
        if (active?.id === session.id) setActive(null);
        await refresh();
      },
    });
  }

  async function persistSession(session: WorkoutSession) {
    setActive(session);
    await db.sessions.put(session);
    await markLocalDataChanged();
    setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
  }

  async function startWorkout(routine: Routine) {
    if (active || sessions.some((session) => session.status === "active" || session.status === "paused")) { setNotice("Resume or discard your active workout first."); return; }
    const session: WorkoutSession = {
      id: uid(), routineId: routine.id, routineNameSnapshot: routine.name, startedAt: new Date().toISOString(),
      status: "active", workoutNotes: "",
      exerciseLogs: [...routine.exercises].sort((a, b) => a.position - b.position).map((item, position) => ({
        id: uid(), exerciseId: item.exerciseId, exerciseNameSnapshot: item.exerciseNameSnapshot,
        measurementType: item.measurementType, position, notes: item.notes, restSeconds: item.restSeconds,
        setLogs: item.setTemplates.map((template, index) => ({
          id: uid(),
          setNumber: index + 1,
          setType: template.type,
          weightKg: template.targetWeightKg,
          repetitions: /^\d+$/.test(template.targetRepetitions.trim()) ? Number(template.targetRepetitions) : undefined,
        })),
      })),
    };
    await persistSession(session);
  }

  async function updateSet(exerciseId: string, setId: string, patch: Partial<SetLog>, autoRest = false) {
    if (!active) return;
    const exercise = active.exerciseLogs.find((item) => item.id === exerciseId);
    const next: WorkoutSession = {
      ...active,
      timerEndsAt: autoRest ? new Date(Date.now() + (exercise?.restSeconds ?? 90) * 1000).toISOString() : active.timerEndsAt,
      exerciseLogs: active.exerciseLogs.map((item) => item.id !== exerciseId ? item : ({
        ...item, setLogs: item.setLogs.map((set) => set.id !== setId ? set : ({ ...set, ...patch })),
      })),
    };
    if (autoRest && preferences.timerHaptics && navigator.vibrate) navigator.vibrate(20);
    await persistSession(next);
  }

  async function finishWorkout() {
    if (!active) return;
    const next = { ...active, status: "completed" as const, completedAt: new Date().toISOString(), timerEndsAt: undefined };
    const records = personalRecords(next, completed);
    await db.sessions.put(next);
    await markLocalDataChanged();
    const routine = routines.find((item) => item.id === next.routineId);
    const changes = routineSetCountChanges(next, routine);
    setActive(null);
    await refresh();
    setTab("history");
    setPrCelebration(records.length ? { session: next, records } : null);
    if (routine && changes.length) setRoutineUpdate({ session: next, routine, changes });
    else if (!records.length) setHistoryDetail(next);
    setNotice("Workout saved successfully.");
  }

  function keepSavedRoutine() {
    if (!routineUpdate) return;
    const session = routineUpdate.session;
    setRoutineUpdate(null);
    if (!prCelebration) setHistoryDetail(session);
  }

  async function updateRoutineFromWorkout() {
    if (!routineUpdate) return;
    const { routine, session } = routineUpdate;
    await storeRoutineVersion(routine, "Before workout update");
    await db.routines.put(routineWithWorkoutDefaults(routine, session));
    await markLocalDataChanged();
    setRoutineUpdate(null);
    await refresh();
    if (!prCelebration) setHistoryDetail(session);
    setNotice("Routine updated with today’s weights, reps and RIR.");
  }

  async function saveHistoryEdits(session: WorkoutSession) {
    const routine = routines.find((item) => item.id === session.routineId);
    await db.transaction("rw", db.sessions, db.routines, db.routineVersions, async () => {
      await db.sessions.put(session);
      if (routine) {
        await storeRoutineVersion(routine, "Before history edits became routine defaults");
        await db.routines.put(routineWithWorkoutDefaults(routine, session));
      }
    });
    await markLocalDataChanged();
    setHistoryDetail(session);
    await refresh();
    setNotice(routine ? "History saved and routine defaults updated." : "History corrected.");
  }

  async function saveRoutine(routine: Routine) {
    const next = { ...routine, updatedAt: new Date().toISOString(), exercises: routine.exercises.map((item, index) => ({ ...item, position: index })) };
    const existing = routines.find((item) => item.id === routine.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(next)) await storeRoutineVersion(existing, "Before manual edit");
    await db.routines.put(next); await markLocalDataChanged(); setRoutineEditor(null); await refresh(); setNotice("Routine saved.");
  }

  async function createDeload(routine: Routine) {
    const next = deloadRoutine(routine, routines.length);
    await db.routines.put(next); await markLocalDataChanged(); await refresh(); setRoutineDetail(next); setNotice("Deload routine created.");
  }

  async function createDeloadWeek() {
    const sourceRoutines = routines.filter((routine) => !routine.name.toLowerCase().startsWith("deload ·"));
    for (const [index, routine] of sourceRoutines.entries()) {
      const generated = deloadRoutine(routine, routines.length + index);
      const existing = routines.find((candidate) => candidate.name === generated.name);
      if (existing) {
        await storeRoutineVersion(existing, "Before deload refresh");
        await db.routines.put({ ...generated, id: existing.id, position: existing.position, createdAt: existing.createdAt });
      } else {
        await db.routines.put(generated);
      }
    }
    await markLocalDataChanged();
    await refresh();
    setNotice("Deload week created with lighter loads and fewer sets.");
  }

  async function restoreRoutineVersion(version: RoutineVersion) {
    const current = routines.find((item) => item.id === version.routineId);
    if (current) await storeRoutineVersion(current, "Before version restore");
    await db.routines.put({ ...structuredClone(version.snapshot), updatedAt: new Date().toISOString() });
    await markLocalDataChanged(); await refresh(); setRoutineDetail({ ...structuredClone(version.snapshot), updatedAt: new Date().toISOString() }); setNotice("Routine version restored.");
  }

  async function updatePreferences(next: TrainingPreferences) {
    setPreferences(next); await saveTrainingPreferences(next); await markLocalDataChanged();
  }

  async function saveMeasurement(measurement: BodyMeasurement) {
    await db.measurements.put(measurement); await markLocalDataChanged(); await refresh(); setNotice("Measurement saved.");
  }

  async function deleteMeasurement(id: string) {
    await db.measurements.delete(id); await markLocalDataChanged(); await refresh(); setNotice("Measurement deleted.");
  }

  async function createRoutine() {
    const now = new Date().toISOString();
    const routine: Routine = { id: uid(), name: "New routine", description: "", position: routines.length, exercises: [], createdAt: now, updatedAt: now };
    await db.routines.put(routine); await markLocalDataChanged(); await refresh(); setRoutineEditor(routine);
  }

  async function duplicateRoutine(routine: Routine) {
    const now = new Date().toISOString();
    const copy: Routine = { ...structuredClone(routine), id: uid(), name: `${routine.name} copy`, position: routines.length, createdAt: now, updatedAt: now, exercises: routine.exercises.map((e) => ({ ...e, id: uid(), setTemplates: e.setTemplates.map((s) => ({ ...s, id: uid() })) })) };
    await db.routines.put(copy); await markLocalDataChanged(); await refresh(); setNotice("Routine duplicated.");
  }

  function requestRoutineDelete(routine: Routine) {
    const activeForRoutine = sessions.find((session) => (session.status === "active" || session.status === "paused") && session.routineId === routine.id);
    if (activeForRoutine) {
      setNotice("Finish or discard the active workout before deleting its routine.");
      return;
    }
    setConfirm({
      title: `Delete ${routine.name}?`,
      body: "Only this saved routine will be removed. Every completed workout, logged set and progress record will remain in History.",
      action: async () => {
        await deleteRoutinePreservingHistory(routine.id);
        await markLocalDataChanged();
        setRoutineDetail(null);
        await refresh();
        setNotice("Routine deleted. Workout history was kept.");
      },
    });
  }

  async function exportJson() {
    const backup = await exportBackup(); download(`ironlog-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), "application/json");
  }
  function download(name: string, body: string, type: string) {
    const url = URL.createObjectURL(new Blob([body], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }
  async function onImport(file?: File) {
    if (!file) return;
    try { const backup = validateBackup(JSON.parse(await file.text())); await importBackup(backup); await markLocalDataChanged(); await refresh(); setNotice("Backup imported and queued for cloud sync."); }
    catch (error) { setNotice(error instanceof Error ? `Import failed: ${error.message.slice(0, 90)}` : "Import failed: invalid backup."); }
    if (importRef.current) importRef.current.value = "";
  }

  if (loading) return <main className="loading"><Dumbbell className="pulse" size={34} /><p>Loading your training…</p></main>;
  if (active) return <>
    <ActiveWorkout session={active} historicalSessions={completed} routine={routines.find((item) => item.id === active.routineId)} exerciseCatalog={exercises} preferences={preferences} now={timerNow} remaining={remaining} onBack={() => setActive(null)} onPersist={persistSession} onSet={updateSet} onFinish={() => setConfirm({ title: "Finish workout?", body: "Completed sets will be saved to your history and compared with your last workout.", action: finishWorkout })} onDiscard={() => confirmDiscardWorkout(active)} onReplace={setReplaceLog} onHelp={setAthleticGuide} />
    {confirm && <Modal title={confirm.title} onClose={() => setConfirm(null)}><p className="modal-copy">{confirm.body}</p><div className="modal-actions"><button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button><button className="btn danger" onClick={async () => { const action = confirm.action; setConfirm(null); await action(); }}>Confirm</button></div></Modal>}
    {replaceLog && <ReplaceExercise log={replaceLog} exercises={exercises} routine={routines.find((r) => r.id === active.routineId)} onClose={() => setReplaceLog(null)} onReplace={async (exercise, updateSavedRoutine) => {
      const nextSession = { ...active, exerciseLogs: active.exerciseLogs.map((log) => log.id === replaceLog.id ? { ...log, exerciseId: exercise.id, exerciseNameSnapshot: exercise.name, measurementType: exercise.measurementType, restSeconds: exercise.defaultRestSeconds } : log) };
      await persistSession(nextSession);
      if (updateSavedRoutine) {
        const routine = routines.find((r) => r.id === active.routineId);
        if (routine) { await storeRoutineVersion(routine, "Before exercise replacement"); await db.routines.put({ ...routine, updatedAt: new Date().toISOString(), exercises: routine.exercises.map((item) => item.exerciseId === replaceLog.exerciseId ? { ...item, exerciseId: exercise.id, exerciseNameSnapshot: exercise.name, measurementType: exercise.measurementType, restSeconds: exercise.defaultRestSeconds } : item) }); await markLocalDataChanged(); }
      }
      setReplaceLog(null); setNotice("Exercise replaced.");
    }} />}
    {athleticGuide && <AthleticGuideModal guide={athleticGuide} onClose={() => setAthleticGuide(null)} />}
  </>;

  return <main className={`app-shell ${pendingActive ? "has-active-island" : ""}`}>
    <header className="topbar">
      <div><span className="eyebrow">LOCAL TRAINING LOG</span><h1>{tab === "routines" ? "Train" : tab === "history" ? "History" : tab === "progress" ? "Progress" : "Your data"}</h1></div>
      <span className={`device-chip ${syncStatus}`}><span /> {syncStatus === "syncing" || syncStatus === "starting" ? "Syncing…" : syncStatus === "synced" ? "Cloud synced" : syncStatus === "offline" ? "Offline · saved here" : "Sync needs attention"}</span>
    </header>

    <div className="content">
      {tab === "routines" && <RoutinesScreen routines={routines} completed={completed} deload={deload} measurementCheck={measurementCheck} onCreateDeloadWeek={createDeloadWeek} onOpenMeasurements={() => { setProgressInitialView("measurements"); setTab("progress"); }} onOpen={setRoutineDetail} onStart={startWorkout} onEdit={setRoutineEditor} onDuplicate={duplicateRoutine} onDelete={requestRoutineDelete} onCreate={createRoutine} />}
      {tab === "history" && <HistoryScreen sessions={completed} onOpen={setHistoryDetail} />}
      {tab === "progress" && <AnalyticsDashboard initialView={progressInitialView} exercises={exercises} sessions={completed} measurements={measurements} onSaveMeasurement={saveMeasurement} onDeleteMeasurement={deleteMeasurement} onOpen={setExerciseDetail} />}
      {tab === "data" && <DataScreen syncStatus={syncStatus} lastSyncedAt={lastSyncedAt} syncError={syncError} preferences={preferences} onPreferences={updatePreferences} onSync={() => runCloudSync(true)} onJson={exportJson} onCsv={() => download("ironlog-history.csv", historyCsv(completed), "text/csv")} onImport={() => importRef.current?.click()} />}
    </div>

    {pendingActive && <ActiveWorkoutIsland session={pendingActive} now={timerNow} remaining={timerRemaining(pendingActive.timerEndsAt, timerNow)} onResume={() => setActive(pendingActive)} onDiscard={() => confirmDiscardWorkout(pendingActive)} />}

    <nav className="bottom-nav" aria-label="Main navigation">
      {([{ key: "routines", label: "Train", icon: Dumbbell }, { key: "history", label: "History", icon: History }, { key: "progress", label: "Progress", icon: BarChart3 }, { key: "data", label: "Data", icon: Database }] as const).map(({ key, label, icon: Icon }) => <button key={key} className={tab === key ? "active" : ""} onClick={() => { if (key === "progress") setProgressInitialView("overview"); setTab(key); }}><Icon size={21} /><span>{label}</span></button>)}
    </nav>

    <input ref={importRef} hidden type="file" accept="application/json" onChange={(e) => onImport(e.target.files?.[0])} />
    {notice && <div className="toast" role="status">{notice}</div>}
    {confirm && <Modal title={confirm.title} onClose={() => setConfirm(null)}><p className="modal-copy">{confirm.body}</p><div className="modal-actions"><button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button><button className="btn danger" onClick={async () => { const action = confirm.action; setConfirm(null); await action(); }}>Confirm</button></div></Modal>}
    {routineUpdate && <Modal title="Update saved routine?" onClose={keepSavedRoutine}>
      <p className="modal-copy">You changed the number of sets during this workout. Would you like to use today’s set count and entered weights as the defaults next time?</p>
      <div className="routine-change-list">{routineUpdate.changes.map((change) => <div key={change.exerciseId}><span>{change.name}</span><strong>{change.previous} → {change.current} sets</strong></div>)}</div>
      <p className="muted-copy">Your completed workout is already saved. Choosing “Keep routine” changes nothing in the saved routine.</p>
      <div className="modal-actions sticky"><button className="btn ghost" onClick={keepSavedRoutine}>Keep routine</button><button className="btn primary" onClick={updateRoutineFromWorkout}><Save size={17} /> Update routine</button></div>
    </Modal>}
    {routineDetail && <RoutineDetail routine={routineDetail} versions={routineVersions.filter((version) => version.routineId === routineDetail.id)} onClose={() => setRoutineDetail(null)} onHelp={setAthleticGuide} onDeload={() => createDeload(routineDetail)} onDelete={() => requestRoutineDelete(routineDetail)} onRestore={restoreRoutineVersion} onStart={() => { const routine = routineDetail; setRoutineDetail(null); startWorkout(routine); }} onEdit={() => { const routine = routineDetail; setRoutineDetail(null); setRoutineEditor(routine); }} />}
    {routineEditor && <RoutineEditor routine={routineEditor} exercises={exercises} onChange={setRoutineEditor} onClose={() => setRoutineEditor(null)} onSave={saveRoutine} onAddCustom={() => setNewExerciseFor(routineEditor)} />}
    {newExerciseFor && <ExerciseCreator routine={newExerciseFor} onClose={() => setNewExerciseFor(null)} onCreated={async (exercise, routine) => { await db.exercises.put(exercise); await markLocalDataChanged(); setNewExerciseFor(null); setRoutineEditor(routine); await refresh(); }} />}
    {historyDetail && <HistoryDetail session={historyDetail} sessions={completed} onClose={() => setHistoryDetail(null)} onSave={saveHistoryEdits} onDelete={() => setConfirm({ title: "Delete completed workout?", body: "This history entry cannot be recovered.", action: async () => { await db.sessions.delete(historyDetail.id); await markLocalDataChanged(); setHistoryDetail(null); await refresh(); } })} />}
    {exerciseDetail && <ExerciseHistory exercise={exerciseDetail} sessions={completed} onClose={() => setExerciseDetail(null)} />}
    {athleticGuide && <AthleticGuideModal guide={athleticGuide} onClose={() => setAthleticGuide(null)} />}
    {prCelebration && !routineUpdate && <PersonalRecordCelebration records={prCelebration.records} onClose={() => { const session = prCelebration.session; setPrCelebration(null); setHistoryDetail(session); }} />}
  </main>;
}

function RoutinesScreen({ routines, completed, deload, measurementCheck, onCreateDeloadWeek, onOpenMeasurements, onOpen, onStart, onEdit, onDuplicate, onDelete, onCreate }: { routines: Routine[]; completed: WorkoutSession[]; deload: DeloadStatus; measurementCheck: MeasurementReminder; onCreateDeloadWeek: () => void; onOpenMeasurements: () => void; onOpen: (r: Routine) => void; onStart: (r: Routine) => void; onEdit: (r: Routine) => void; onDuplicate: (r: Routine) => void; onDelete: (r: Routine) => void; onCreate: () => void }) {
  return <>
    <section className="summary-card"><div><span>READY WHEN YOU ARE</span><strong>{routines.length} routines</strong><p>{completed.length ? `${completed.length} sessions completed` : "Your six-day programme is loaded"}</p></div><Activity size={34} /></section>
    <section className={`routine-tools reminder-card ${deload.due ? "due" : ""}`}><div><Gauge size={18} /><span><strong>{deload.due ? "Deload week recommended" : `Deload tracker · ${deload.activeWeeks}/${deload.targetWeeks} active weeks`}</strong><small>{deload.due ? "You have trained across 8 active weeks. Create a lighter week, then complete it when recovery fits your schedule." : `${deload.weeksRemaining} active ${deload.weeksRemaining === 1 ? "week" : "weeks"} until the suggestion. Missing a workout never resets this tracker.`}</small></span></div><button className="btn ghost" onClick={onCreateDeloadWeek}>{deload.due ? "Create deload week" : "Prepare deload"}</button></section>
    {measurementCheck.due && <section className="routine-tools reminder-card due"><div><Activity size={18} /><span><strong>{measurementCheck.daysSince === undefined ? "Add your baseline measurements" : "3-week measurement check-in due"}</strong><small>Log body fat, total muscle mass, body weight or circumference measurements. These are included in secure sync.</small></span></div><button className="btn ghost" onClick={onOpenMeasurements}>Log measurements</button></section>}
    <div className="section-head"><div><span className="eyebrow">YOUR PROGRAMME</span><h2>Choose today’s session</h2></div><button className="icon-btn accent" onClick={onCreate} aria-label="Create routine"><Plus size={22} /></button></div>
    <div className="routine-grid">
      {routines.map((routine, index) => <article className="routine-card" key={routine.id} role="button" tabIndex={0} aria-label={`View ${routine.name}`} onClick={() => onOpen(routine)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(routine); } }}>
        <div className="routine-index">{String(index + 1).padStart(2, "0")}</div>
        <div className="routine-body"><h3>{routine.name}</h3><p>{routine.description || "Custom training session"}</p><div className="meta-row"><span>{routine.exercises.length} exercises</span><span>~{Math.max(20, routine.exercises.reduce((sum, e) => sum + e.targetSets * 3, 0))} min</span></div></div>
        <div className="routine-actions"><button className="btn primary" onClick={(event) => { event.stopPropagation(); onStart(routine); }}>Start <ChevronRight size={18} /></button><button className="icon-btn" onClick={(event) => { event.stopPropagation(); onEdit(routine); }} aria-label={`Edit ${routine.name}`}><Pencil size={18} /></button><button className="icon-btn" onClick={(event) => { event.stopPropagation(); onDuplicate(routine); }} aria-label={`Duplicate ${routine.name}`}><Copy size={18} /></button><button className="icon-btn danger-icon" onClick={(event) => { event.stopPropagation(); onDelete(routine); }} aria-label={`Delete ${routine.name}`}><Trash2 size={18} /></button></div>
      </article>)}
    </div>
  </>;
}

function ActiveWorkoutIsland({ session, now, remaining, onResume, onDiscard }: { session: WorkoutSession; now: number; remaining: number; onResume: () => void; onDiscard: () => void }) {
  const elapsedLabel = secondsLabel(elapsedSeconds(session.startedAt, now));
  return <aside className="active-island" aria-label="Workout in progress">
    <button className="active-island-main" onClick={onResume}>
      <span className="active-island-play"><CirclePlay size={20} /></span>
      <span className="active-island-copy"><small>{remaining > 0 ? `REST · ${secondsLabel(remaining)}` : session.status === "paused" ? "PAUSED" : "WORKOUT IN PROGRESS"}</small><strong>{session.routineNameSnapshot}</strong><span>Started {timeLabel(session.startedAt)} · {elapsedLabel}</span></span>
      <ChevronRight size={19} />
    </button>
    <button className="active-island-discard" onClick={onDiscard} aria-label="Discard ongoing workout"><Trash2 size={18} /></button>
  </aside>;
}

function RoutineDetail({ routine, versions, onClose, onStart, onEdit, onDelete, onDeload, onRestore, onHelp }: { routine: Routine; versions: RoutineVersion[]; onClose: () => void; onStart: () => void; onEdit: () => void; onDelete: () => void; onDeload: () => void; onRestore: (version: RoutineVersion) => void; onHelp: (guide: AthleticGuide) => void }) {
  const exercises = [...routine.exercises].sort((a, b) => a.position - b.position);
  return <Modal title={routine.name} onClose={onClose}>
    <div className="routine-preview-intro"><p>{routine.description || "Custom training session"}</p><div><span>{exercises.length} exercises</span><span>{exercises.reduce((sum, item) => sum + item.setTemplates.length, 0)} total sets</span></div></div>
    <div className="routine-preview-list">{exercises.map((exercise, index) => <article className="routine-preview-exercise" key={exercise.id}>
      <div className="routine-preview-head"><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{exercise.exerciseNameSnapshot}</h3><p>{exercise.setTemplates.every((set) => set.type === "warmup") ? "Warm-up only" : `${exercise.targetSets} working sets`} · {exercise.minimumRepetitions}–{exercise.maximumRepetitions} reps · {exercise.restSeconds}s rest</p></div>{athleticGuideFor(exercise.exerciseNameSnapshot) && <button className="how-to-button" onClick={() => onHelp(athleticGuideFor(exercise.exerciseNameSnapshot)!)}><HelpCircle size={15} /> How to</button>}</div>
      <div className="routine-preview-sets">{exercise.setTemplates.map((set, setIndex) => {
        const workingSetNumber = exercise.setTemplates.slice(0, setIndex + 1).filter((candidate) => candidate.type === "working").length;
        return <span className={set.type} key={set.id}><b>{set.type === "warmup" ? "W" : workingSetNumber}</b>{set.targetWeightKg !== undefined ? `${set.targetWeightKg} kg` : "—"} × {set.targetRepetitions || "—"}</span>;
      })}</div>
      {exercise.notes && <p className="routine-preview-notes">{exercise.notes}</p>}
    </article>)}</div>
    <section className="routine-tools"><div><Gauge size={18} /><span><strong>Need a lighter week?</strong><small>Creates 10–15% lighter loads, 60–70% of working sets, 3–4 RIR, no failure and normal rest.</small></span></div><button className="btn ghost" onClick={onDeload}>Create deload</button></section>
    {versions.length > 0 && <section className="version-history"><div className="version-history-title"><RotateCcw size={17} /><span><strong>Routine versions</strong><small>Automatic recovery points</small></span></div>{versions.slice(0, 3).map((version) => <div className="version-history-row" key={version.id}><span><strong>{dateLabel(version.createdAt)} · {timeLabel(version.createdAt)}</strong><small>{version.reason}</small></span><button className="text-btn" onClick={() => onRestore(version)}>Restore</button></div>)}</section>}
    <div className="modal-actions sticky"><button className="btn ghost danger-text" onClick={onDelete}><Trash2 size={17} /> Delete</button><div className="spacer" /><button className="btn ghost" onClick={onEdit}><Pencil size={17} /> Edit</button><button className="btn primary" onClick={onStart}><CirclePlay size={17} /> Start workout</button></div>
  </Modal>;
}

function AthleticGuideModal({ guide, onClose }: { guide: AthleticGuide; onClose: () => void }) {
  const [column, row] = guide.frame;
  const [columns, rows] = guide.grid;
  return <Modal title={guide.exerciseName} onClose={onClose}>
    <div className="technique-visual" style={{ aspectRatio: (1.5 * rows) / columns }} aria-label={`Visual demonstration of ${guide.exerciseName}`}>
      <img src={guide.image} alt={`${guide.exerciseName} start and finish positions`} style={{ width: `${columns * 100}%`, height: `${rows * 100}%`, left: `-${column * 100}%`, top: `-${row * 100}%` }} />
      <span><Play size={14} fill="currentColor" /> START → FINISH</span>
    </div>
    <div className="technique-content">
      <div className="technique-heading"><span>3-STEP GUIDE</span><strong>Move with control first</strong></div>
      <ol>{guide.steps.map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span></li>)}</ol>
      <div className="technique-safety"><ShieldCheck size={18} /><div><strong>Safety check</strong><p>{guide.safety}</p></div></div>
      <div className="technique-links"><a className="btn primary" href={athleticDemoUrl(guide)} target="_blank" rel="noreferrer"><Play size={16} /> Watch short demo</a><a className="btn ghost" href={guide.sourceUrl} target="_blank" rel="noreferrer">Technique reference <ExternalLink size={14} /></a></div>
    </div>
  </Modal>;
}

function PersonalRecordCelebration({ records, onClose }: { records: PersonalRecord[]; onClose: () => void }) {
  return <Modal title="New personal records" onClose={onClose}>
    <div className="pr-celebration"><div className="pr-trophy"><Sparkles size={20} /><Trophy size={44} /><Sparkles size={17} /></div><span>WORKOUT COMPLETE</span><h3>{records.length} new {records.length === 1 ? "record" : "records"}</h3><p>Your completed workout is saved. These are improvements over your earlier logged sessions.</p></div>
    <div className="pr-list">{records.map((record) => <div key={`${record.exerciseId}-${record.label}`}><Trophy size={18} /><span><strong>{record.exerciseName}</strong><small>{record.label}</small></span><b>{record.value}</b></div>)}</div>
    <div className="modal-actions sticky"><button className="btn primary wide" onClick={onClose}>View workout report <ChevronRight size={17} /></button></div>
  </Modal>;
}

function RoutineEditor({ routine, exercises, onChange, onClose, onSave, onAddCustom }: { routine: Routine; exercises: Exercise[]; onChange: (r: Routine) => void; onClose: () => void; onSave: (r: Routine) => void; onAddCustom: () => void }) {
  const addExisting = (exerciseId: string) => {
    const exercise = exercises.find((item) => item.id === exerciseId); if (!exercise) return;
    onChange({ ...routine, exercises: [...routine.exercises, { id: uid(), exerciseId: exercise.id, exerciseNameSnapshot: exercise.name, measurementType: exercise.measurementType, position: routine.exercises.length, targetSets: 3, minimumRepetitions: 8, maximumRepetitions: 12, targetRIR: "1–2 RIR", restSeconds: exercise.defaultRestSeconds, notes: exercise.instructions, setTemplates: Array.from({ length: 3 }, () => ({ id: uid(), type: "working", targetRepetitions: "8–12" })) }] });
  };
  return <Modal title="Edit routine" onClose={onClose}>
    <div className="form-grid"><label>Name<input value={routine.name} onChange={(e) => onChange({ ...routine, name: e.target.value })} /></label><label>Description<textarea rows={2} value={routine.description} onChange={(e) => onChange({ ...routine, description: e.target.value })} /></label></div>
    <div className="editor-list">
      {routine.exercises.map((item, index) => <div className="editor-exercise" key={item.id}>
        <div className="editor-title"><SetTypePill type={item.setTemplates[0]?.type ?? "working"} /><strong>{item.exerciseNameSnapshot}</strong><div className="spacer" /><button className="mini" disabled={index === 0} onClick={() => { const list = [...routine.exercises]; [list[index - 1], list[index]] = [list[index], list[index - 1]]; onChange({ ...routine, exercises: list }); }}><ArrowUp size={15} /></button><button className="mini" disabled={index === routine.exercises.length - 1} onClick={() => { const list = [...routine.exercises]; [list[index + 1], list[index]] = [list[index], list[index + 1]]; onChange({ ...routine, exercises: list }); }}><ArrowDown size={15} /></button><button className="mini danger-icon" onClick={() => onChange({ ...routine, exercises: routine.exercises.filter((e) => e.id !== item.id) })}><Trash2 size={15} /></button></div>
        <div className="compact-fields">
          <label>Sets<input type="number" min="1" value={item.targetSets} onChange={(e) => {
            const count = Math.max(1, Number(e.target.value));
            const nextExercises = routine.exercises.map((x) => x.id !== item.id ? x : ({
              ...x,
              targetSets: count,
              setTemplates: Array.from({ length: count }, (_, i) => x.setTemplates[i] ?? { id: uid(), type: "working" as const, targetRepetitions: `${x.minimumRepetitions}–${x.maximumRepetitions}` }),
            }));
            onChange({ ...routine, exercises: nextExercises });
          }} /></label>
          <label>Min reps<input type="number" value={item.minimumRepetitions} onChange={(e) => onChange({ ...routine, exercises: routine.exercises.map((x) => x.id === item.id ? { ...x, minimumRepetitions: Number(e.target.value) } : x) })} /></label>
          <label>Max reps<input type="number" value={item.maximumRepetitions} onChange={(e) => onChange({ ...routine, exercises: routine.exercises.map((x) => x.id === item.id ? { ...x, maximumRepetitions: Number(e.target.value) } : x) })} /></label>
          <label>Rest (sec)<input type="number" value={item.restSeconds} onChange={(e) => onChange({ ...routine, exercises: routine.exercises.map((x) => x.id === item.id ? { ...x, restSeconds: Number(e.target.value) } : x) })} /></label>
        </div>
        <label className="full-label">Permanent notes<input value={item.notes} onChange={(e) => onChange({ ...routine, exercises: routine.exercises.map((x) => x.id === item.id ? { ...x, notes: e.target.value } : x) })} /></label>
        <div className="routine-set-list"><span>Set defaults</span><div>{item.setTemplates.map((template, setIndex) => <div className="routine-set-row" key={template.id}>
          <button className={template.type} onClick={() => onChange({ ...routine, exercises: routine.exercises.map((x) => x.id !== item.id ? x : ({ ...x, setTemplates: x.setTemplates.map((set) => set.id === template.id ? { ...set, type: set.type === "warmup" ? "working" : "warmup" } : set) })) })}>{setIndex + 1} · {template.type === "warmup" ? "Warm-up" : "Working"}</button>
          {["weight_reps", "assisted_bodyweight", "bodyweight_reps"].includes(item.measurementType) && <label>Weight kg<DecimalInput value={template.targetWeightKg} onValueChange={(value) => onChange({ ...routine, exercises: routine.exercises.map((x) => x.id !== item.id ? x : ({ ...x, setTemplates: x.setTemplates.map((set) => set.id === template.id ? { ...set, targetWeightKg: value } : set) })) })} /></label>}
          <label>Target reps<input value={template.targetRepetitions} onChange={(e) => onChange({ ...routine, exercises: routine.exercises.map((x) => x.id !== item.id ? x : ({ ...x, setTemplates: x.setTemplates.map((set) => set.id === template.id ? { ...set, targetRepetitions: e.target.value } : set) })) })} /></label>
        </div>)}</div></div>
      </div>)}
    </div>
    <div className="add-row"><select defaultValue="" onChange={(e) => { addExisting(e.target.value); e.currentTarget.value = ""; }}><option value="" disabled>Add existing exercise…</option>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select><button className="btn ghost" onClick={onAddCustom}><Plus size={17} /> Custom</button></div>
    <div className="modal-actions sticky"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!routine.name.trim()} onClick={() => onSave(routine)}><Save size={17} /> Save</button></div>
  </Modal>;
}

function ExerciseCreator({ routine, onClose, onCreated }: { routine: Routine; onClose: () => void; onCreated: (e: Exercise, r: Routine) => void }) {
  const [name, setName] = useState(""); const [type, setType] = useState<MeasurementType>("weight_reps"); const [sets, setSets] = useState(3); const [minReps, setMin] = useState(8); const [maxReps, setMax] = useState(12); const [rest, setRest] = useState(90); const [notes, setNotes] = useState("");
  return <Modal title="Custom exercise" onClose={onClose}><div className="form-grid"><label>Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label><label>Measurement<select value={type} onChange={(e) => setType(e.target.value as MeasurementType)}>{measurementTypes.map((item) => <option key={item} value={item}>{measurementLabels[item]}</option>)}</select></label><div className="compact-fields"><label>Sets<input type="number" value={sets} min="1" onChange={(e) => setSets(Number(e.target.value))} /></label><label>Min reps<input type="number" value={minReps} onChange={(e) => setMin(Number(e.target.value))} /></label><label>Max reps<input type="number" value={maxReps} onChange={(e) => setMax(Number(e.target.value))} /></label><label>Rest (sec)<input type="number" value={rest} onChange={(e) => setRest(Number(e.target.value))} /></label></div><label>Notes<textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label></div><div className="modal-actions"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!name.trim()} onClick={() => { const now = new Date().toISOString(); const exercise: Exercise = { id: uid(), name: name.trim(), category: "Custom", primaryMuscles: [], secondaryMuscles: [], equipment: "Other", measurementType: type, instructions: notes, defaultRestSeconds: rest, createdAt: now, updatedAt: now }; const routineExercise = { id: uid(), exerciseId: exercise.id, exerciseNameSnapshot: exercise.name, measurementType: type, position: routine.exercises.length, targetSets: sets, minimumRepetitions: minReps, maximumRepetitions: maxReps, targetRIR: "1–2 RIR", restSeconds: rest, notes, setTemplates: Array.from({ length: sets }, () => ({ id: uid(), type: "working" as const, targetRepetitions: `${minReps}–${maxReps}` })) }; onCreated(exercise, { ...routine, exercises: [...routine.exercises, routineExercise] }); }}>Add exercise</button></div></Modal>;
}

function ActiveWorkout({ session, historicalSessions, routine, exerciseCatalog, preferences, now, remaining, onBack, onPersist, onSet, onFinish, onDiscard, onReplace, onHelp }: { session: WorkoutSession; historicalSessions: WorkoutSession[]; routine?: Routine; exerciseCatalog: Exercise[]; preferences: TrainingPreferences; now: number; remaining: number; onBack: () => void; onPersist: (s: WorkoutSession) => void; onSet: (e: string, s: string, p: Partial<SetLog>, rest?: boolean) => void; onFinish: () => void; onDiscard: () => void; onReplace: (log: ExerciseLog) => void; onHelp: (guide: AthleticGuide) => void }) {
  const elapsed = secondsLabel(elapsedSeconds(session.startedAt, now));
  const [plateTarget, setPlateTarget] = useState<{ name: string; weightKg: number } | null>(null);
  const [revealedSetId, setRevealedSetId] = useState<string | null>(null);
  const swipeStart = useRef<{ setId: string; x: number; y: number } | null>(null);

  function finishSetSwipe(setId: string, x: number, y: number, canDelete: boolean) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.setId !== setId) return;
    const deltaX = x - start.x;
    const deltaY = y - start.y;
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
    if (deltaX < 0 && canDelete) setRevealedSetId(setId);
    if (deltaX > 0) setRevealedSetId(null);
  }

  function deleteSet(exerciseLogId: string, setId: string) {
    setRevealedSetId(null);
    onPersist(workoutWithoutSet(session, exerciseLogId, setId));
  }

  return <main className="workout-shell">
    <header className="workout-head"><button className="icon-btn" onClick={onBack} aria-label="Minimize workout"><ArrowLeft size={21} /></button><div><span className="eyebrow">ACTIVE WORKOUT · {elapsed}</span><h1>{session.routineNameSnapshot}</h1></div><button className="btn finish" onClick={onFinish}>Finish</button></header>
    {remaining > 0 && <div className="timer-bar"><div><Clock3 size={20} /><span>Rest</span><strong>{secondsLabel(remaining)}</strong></div><div><button onClick={() => onPersist({ ...session, timerEndsAt: new Date(new Date(session.timerEndsAt!).getTime() - 15000).toISOString() })}>−15</button><button onClick={() => onPersist({ ...session, timerEndsAt: undefined })}>Dismiss</button><button onClick={() => onPersist({ ...session, timerEndsAt: new Date(new Date(session.timerEndsAt!).getTime() + 15000).toISOString() })}>+15</button></div></div>}
    <div className="workout-tools"><button className="btn ghost" onClick={() => onPersist({ ...session, status: session.status === "paused" ? "active" : "paused" })}>{session.status === "paused" ? <CirclePlay size={17} /> : <CirclePause size={17} />}{session.status === "paused" ? "Resume" : "Pause"}</button><button className="btn ghost danger-text" onClick={onDiscard}><Trash2 size={17} /> Discard</button></div>
    {session.status === "paused" && <div className="paused-banner"><CirclePause size={24} /><div><strong>Workout paused</strong><span>Your entries are saved on this device.</span></div></div>}
    <section className="exercise-stack">
      {session.exerciseLogs.map((exercise, eIndex) => { const previous = previousExerciseLog(historicalSessions, exercise.exerciseId, session.startedAt); const routineExercise = routine?.exercises.find((item) => item.exerciseId === exercise.exerciseId); const catalogExercise = exerciseCatalog.find((item) => item.id === exercise.exerciseId); const suggestion = preferences.progressionSuggestions ? progressionSuggestion(historicalSessions, exercise, routineExercise, session.startedAt, catalogExercise?.equipment) : null; const supportsPlates = catalogExercise?.equipment.toLowerCase().includes("barbell") || exercise.exerciseNameSnapshot.toLowerCase().includes("barbell"); return <article className="exercise-card" key={exercise.id}>
        <div className="exercise-head"><div><span className="eyebrow">{String(eIndex + 1).padStart(2, "0")} · {measurementLabels[exercise.measurementType]}</span><h2>{exercise.exerciseNameSnapshot}</h2><p>{exercise.notes}</p></div><div className="exercise-head-actions">{supportsPlates && <button className="icon-btn" onClick={() => setPlateTarget({ name: exercise.exerciseNameSnapshot, weightKg: exercise.setLogs.find((set) => (set.weightKg ?? 0) > 0)?.weightKg ?? preferences.defaultBarbellKg })} aria-label={`Plate calculator for ${exercise.exerciseNameSnapshot}`}><Calculator size={18} /></button>}{athleticGuideFor(exercise.exerciseNameSnapshot) && <button className="icon-btn help-icon" onClick={() => onHelp(athleticGuideFor(exercise.exerciseNameSnapshot)!)} aria-label={`How to perform ${exercise.exerciseNameSnapshot}`}><HelpCircle size={18} /></button>}<button className="icon-btn" onClick={() => onReplace(exercise)} aria-label="Replace exercise"><RefreshCw size={18} /></button></div></div>
        {suggestion && <div className={`progression-tip ${suggestion.action}`}><Sparkles size={17} /><span><small>TRANSPARENT PROGRESSION</small><strong>{suggestion.headline}</strong><p>{suggestion.explanation}</p></span>{suggestion.suggestedWeightKg !== undefined && <button onClick={() => {
          const nextLogs = session.exerciseLogs.map((log) => log.id !== exercise.id ? log : ({
            ...log,
            setLogs: log.setLogs.map((set) => set.setType === "warmup" || set.completedAt ? set : ({ ...set, weightKg: suggestion.suggestedWeightKg })),
          }));
          onPersist({ ...session, exerciseLogs: nextLogs });
        }}>Apply</button>}</div>}
        <div className="set-header"><span>Set</span><span>Previous</span><span>{exercise.measurementType.includes("weight") || exercise.measurementType === "bodyweight_reps" ? "kg" : exercise.measurementType.includes("distance") ? "metres" : exercise.measurementType === "time" ? "sec" : "—"}</span><span>{exercise.measurementType.includes("reps") || exercise.measurementType === "reps_only" ? "Reps" : exercise.measurementType === "time_distance" ? "Sec" : "—"}</span><span>{exercise.measurementType.includes("reps") || exercise.measurementType === "reps_only" ? "RIR" : ""}</span><span /></div>
        <div className="set-list">{exercise.setLogs.map((set, index) => { const comparison = exerciseSetComparison(historicalSessions, exercise.exerciseId, index, set.weightKg, session.startedAt); const prev = comparison.previousSet ?? previous?.setLogs[index]; const sameWeight = comparison.sameWeightSet; const shownPrevious = prev ?? sameWeight; const needsWeight = ["weight_reps", "assisted_bodyweight", "bodyweight_reps"].includes(exercise.measurementType); const needsDistance = ["distance", "time_distance"].includes(exercise.measurementType); const needsTime = ["time", "time_distance"].includes(exercise.measurementType); const needsReps = ["weight_reps", "assisted_bodyweight", "bodyweight_reps", "reps_only"].includes(exercise.measurementType); const canDelete = exercise.setLogs.length > 1; return <div className={`swipe-set-row ${revealedSetId === set.id ? "revealed" : ""}`} key={set.id} onTouchStart={(event) => { const touch = event.touches[0]; swipeStart.current = { setId: set.id, x: touch.clientX, y: touch.clientY }; }} onTouchEnd={(event) => { const touch = event.changedTouches[0]; finishSetSwipe(set.id, touch.clientX, touch.clientY, canDelete); }}>
          <div className={`set-row ${set.completedAt ? "done" : ""}`}>
          <button className="set-type-button" aria-label={`Change set type from ${set.setType}`} onClick={() => { const next = setTypes[(setTypes.indexOf(set.setType) + 1) % setTypes.length]; onSet(exercise.id, set.id, { setType: next }); }}><SetTypePill type={set.setType} /></button>
          <span className="previous">{shownPrevious ? <><strong>{previousSetLabel(shownPrevious)}</strong><small>{prev ? `last workout · set ${index + 1}` : `last time at ${set.weightKg ?? shownPrevious.weightKg} kg`}</small></> : "—"}</span>
          <DecimalInput disabled={!needsWeight && !needsDistance && !needsTime} ariaLabel={`${exercise.exerciseNameSnapshot} set ${index + 1} ${needsDistance ? "distance" : needsTime && !needsWeight ? "duration" : needsWeight ? "weight" : "unused"}`} value={needsDistance ? set.distanceMetres : needsTime && !needsWeight ? set.durationSeconds : needsWeight ? set.weightKg : undefined} onValueChange={(value) => onSet(exercise.id, set.id, needsDistance ? { distanceMetres: value } : needsTime && !needsWeight ? { durationSeconds: value } : { weightKg: value })} />
          <input disabled={!needsReps && !(needsTime && needsDistance)} inputMode="numeric" aria-label={`${exercise.exerciseNameSnapshot} set ${index + 1} ${needsReps ? "repetitions" : needsTime && needsDistance ? "duration" : "unused"}`} placeholder="—" value={(needsReps ? set.repetitions : needsTime && needsDistance ? set.durationSeconds : undefined) ?? ""} onChange={(e) => onSet(exercise.id, set.id, needsReps ? { repetitions: num(e.target.value) } : { durationSeconds: num(e.target.value) })} />
          {needsReps ? <DecimalInput ariaLabel={`${exercise.exerciseNameSnapshot} set ${index + 1} RIR`} value={set.RIR} max={10} onValueChange={(value) => onSet(exercise.id, set.id, { RIR: value })} /> : <span />}
          <button className={`complete-set ${set.completedAt ? "checked" : ""}`} aria-label={set.completedAt ? "Mark set incomplete" : "Complete set"} onClick={() => onSet(exercise.id, set.id, { completedAt: set.completedAt ? undefined : new Date().toISOString() }, !set.completedAt)}>{set.completedAt ? <Check size={19} /> : <Square size={19} />}</button>
          </div>
          <button className="swipe-delete-set" disabled={!canDelete} onClick={() => deleteSet(exercise.id, set.id)}><Trash2 size={16} /> Delete</button>
        </div>; })}</div>
        <div className="exercise-footer"><button className="text-btn" onClick={() => onPersist({ ...session, exerciseLogs: session.exerciseLogs.map((x) => x.id === exercise.id ? { ...x, setLogs: [...x.setLogs, freshSet(x.setLogs.length + 1)] } : x) })}><Plus size={16} /> Add set</button>{exercise.setLogs.length > 1 && <button className="text-btn muted" onClick={() => onPersist({ ...session, exerciseLogs: session.exerciseLogs.map((x) => x.id === exercise.id ? { ...x, setLogs: x.setLogs.slice(0, -1) } : x) })}>Remove last</button>}<span>{exercise.restSeconds}s rest</span></div>
        <textarea className="notes-input" rows={1} placeholder="Exercise notes…" value={exercise.notes} onChange={(e) => onPersist({ ...session, exerciseLogs: session.exerciseLogs.map((x) => x.id === exercise.id ? { ...x, notes: e.target.value } : x) })} />
      </article>; })}
    </section>
    <label className="workout-notes">Workout notes<textarea rows={3} placeholder="How did today feel?" value={session.workoutNotes} onChange={(e) => onPersist({ ...session, workoutNotes: e.target.value })} /></label>
    <button className="btn primary wide" onClick={onFinish}>Finish workout <Check size={18} /></button>
    {plateTarget && <PlateCalculatorModal exerciseName={plateTarget.name} initialTarget={plateTarget.weightKg} initialBarbell={preferences.defaultBarbellKg} onClose={() => setPlateTarget(null)} />}
  </main>;
}

function PlateCalculatorModal({ exerciseName, initialTarget, initialBarbell, onClose }: { exerciseName: string; initialTarget: number; initialBarbell: number; onClose: () => void }) {
  const [target, setTarget] = useState(Math.max(initialTarget, initialBarbell));
  const [barbell, setBarbell] = useState(initialBarbell);
  const loading = calculatePlateLoading(target, barbell);
  return <Modal title="Plate calculator" onClose={onClose}>
    <p className="modal-copy">{exerciseName}</p>
    <div className="plate-inputs"><label>Target total (kg)<DecimalInput autoFocus value={target} onValueChange={(value) => setTarget(value ?? 0)} /></label><label>Barbell (kg)<select value={barbell} onChange={(event) => setBarbell(Number(event.target.value))}><option value={20}>20 kg</option><option value={15}>15 kg</option><option value={10}>10 kg</option></select></label></div>
    <section className="plate-result"><span>LOAD EACH SIDE</span><div>{loading.perSide.length ? loading.perSide.map((plate, index) => <b key={`${plate}-${index}`}>{plate}</b>) : <strong>Bar only</strong>}</div><p>Total loaded: <strong>{loading.loadedWeightKg} kg</strong>{loading.remainderKg !== 0 && <> · closest available is {Math.abs(loading.remainderKg)} kg {loading.remainderKg > 0 ? "under" : "over"}</>}</p></section>
    <p className="muted-copy">Calculated with available plates: 25, 20, 15, 10, 5, 2.5 and 1.25 kg.</p>
    <div className="modal-actions sticky"><button className="btn primary wide" onClick={onClose}>Done</button></div>
  </Modal>;
}

function HistoryScreen({ sessions, onOpen }: { sessions: WorkoutSession[]; onOpen: (s: WorkoutSession) => void }) {
  return sessions.length ? <div className="history-list">{sessions.map((session) => { const stats = sessionStats(session); return <button className="history-card" key={session.id} onClick={() => onOpen(session)}><div className="date-block"><strong>{new Date(session.completedAt ?? session.startedAt).getDate()}</strong><span>{new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(session.startedAt))}</span></div><div><span className="eyebrow">{timeLabel(session.startedAt)}</span><h3>{session.routineNameSnapshot}</h3><p>{stats.sets} sets · {stats.reps} reps · {Math.round(stats.volume).toLocaleString()} kg volume</p></div><ChevronRight size={20} /></button>; })}</div> : <Empty icon={History} title="No completed workouts" body="Finish your first session and it will appear here." />;
}

function HistoryDetail({ session, sessions, onClose, onSave, onDelete }: { session: WorkoutSession; sessions: WorkoutSession[]; onClose: () => void; onSave: (s: WorkoutSession) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(structuredClone(session));
  const stats = sessionStats(draft);
  const report = workoutComparison(draft, sessions);
  const change = report.volumeChange;
  return <Modal title={draft.routineNameSnapshot} onClose={onClose}>
    <div className="detail-date">{dateLabel(draft.completedAt ?? draft.startedAt)} · {timeLabel(draft.startedAt)}</div>
    <div className="stat-grid"><div><strong>{stats.sets}</strong><span>sets</span></div><div><strong>{stats.reps}</strong><span>reps</span></div><div><strong>{Math.round(stats.volume).toLocaleString()}</strong><span>kg volume</span></div></div>
    <section className={`workout-report ${change === undefined ? "neutral" : change > 0 ? "positive" : change < 0 ? "negative" : "neutral"}`}>
      <div>{change === undefined ? <Minus size={22}/> : change > 0 ? <TrendingUp size={22}/> : change < 0 ? <TrendingDown size={22}/> : <Minus size={22}/>}<div><span>WORKOUT-OVER-WORKOUT</span><strong>{change === undefined ? "First comparable workout" : change === 0 ? "Same total volume" : `${change > 0 ? "+" : ""}${Math.round(change).toLocaleString()} kg volume`}</strong><p>{report.previous ? `Compared with ${dateLabel(report.previous.completedAt ?? report.previous.startedAt)}` : "Complete this routine again to see a direct comparison."}</p></div></div>
      {report.previous && <div className="report-exercises">{report.exercises.map((item) => <div key={item.exerciseId}><span>{item.name}</span><strong className={item.volumeChange && item.volumeChange > 0 ? "up" : item.volumeChange && item.volumeChange < 0 ? "down" : ""}>{item.volumeChange === undefined ? "new" : `${item.volumeChange > 0 ? "+" : ""}${Math.round(item.volumeChange).toLocaleString()} kg`}</strong></div>)}</div>}
    </section>
    {draft.exerciseLogs.map((exercise) => { const prior = report.previous?.exerciseLogs.find((item) => item.exerciseId === exercise.exerciseId); return <div className="history-exercise" key={exercise.id}><div className="history-exercise-head"><h3>{exercise.exerciseNameSnapshot}</h3>{prior && <span>vs last workout</span>}</div>{exercise.setLogs.map((set, index) => { const priorSet = prior?.setLogs[index]; const repDelta = set.repetitions !== undefined && priorSet?.repetitions !== undefined ? set.repetitions - priorSet.repetitions : undefined; return <div className="history-set phase-two" key={set.id}><SetTypePill type={set.setType} /><span>Set {index + 1}{priorSet && <small className={repDelta && repDelta > 0 ? "up" : repDelta && repDelta < 0 ? "down" : ""}>{priorSet.weightKg ?? "—"}×{priorSet.repetitions ?? "—"}{repDelta ? ` (${repDelta > 0 ? "+" : ""}${repDelta}r)` : ""}</small>}</span><DecimalInput ariaLabel="Weight kg" placeholder="kg" value={set.weightKg} onValueChange={(value) => setDraft({ ...draft, exerciseLogs: draft.exerciseLogs.map((x) => x.id === exercise.id ? { ...x, setLogs: x.setLogs.map((s) => s.id === set.id ? { ...s, weightKg: value } : s) } : x) })} /><input aria-label="Repetitions" type="number" inputMode="numeric" value={set.repetitions ?? ""} placeholder="reps" onChange={(e) => setDraft({ ...draft, exerciseLogs: draft.exerciseLogs.map((x) => x.id === exercise.id ? { ...x, setLogs: x.setLogs.map((s) => s.id === set.id ? { ...s, repetitions: num(e.target.value) } : s) } : x) })} /><DecimalInput ariaLabel="RIR" placeholder="RIR" value={set.RIR} max={10} onValueChange={(value) => setDraft({ ...draft, exerciseLogs: draft.exerciseLogs.map((x) => x.id === exercise.id ? { ...x, setLogs: x.setLogs.map((s) => s.id === set.id ? { ...s, RIR: value } : s) } : x) })} /></div>; })}</div>; })}
    <p className="muted-copy">Save edits also makes these weights, reps and RIR the defaults for your next workout.</p>
    <div className="modal-actions sticky"><button className="btn ghost danger-text" onClick={onDelete}><Trash2 size={17} /> Delete</button><div className="spacer" /><button className="btn primary" onClick={() => onSave(draft)}><Save size={17} /> Save edits</button></div>
  </Modal>;
}

function ExerciseHistory({ exercise, sessions, onClose }: { exercise: Exercise; sessions: WorkoutSession[]; onClose: () => void }) {
  const entries = sessions.flatMap((session) => session.exerciseLogs.filter((log) => log.exerciseId === exercise.id).map((log) => ({ session, log }))).sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt)); const p = exerciseProgress(entries.map((e) => e.log));
  return <Modal title={exercise.name} onClose={onClose}><div className="stat-grid"><div><strong>{p.bestWeight || "—"}</strong><span>best kg</span></div><div><strong>{p.bestRepsAtBestWeight || "—"}</strong><span>reps @ best</span></div><div><strong>{p.bestE1RM || "—"}</strong><span>best e1RM</span></div></div><ExerciseTrendChart sessions={sessions} exerciseId={exercise.id} measurementType={exercise.measurementType}/><div className="timeline">{entries.map(({ session, log }) => <div className="timeline-item" key={log.id}><span className="dot" /><div><strong>{dateLabel(session.completedAt ?? session.startedAt)}</strong><p>{log.setLogs.filter((s) => s.completedAt).map((s) => `${s.weightKg ? `${s.weightKg} kg × ` : ""}${s.repetitions ?? s.distanceMetres ?? s.durationSeconds ?? "—"}`).join(" · ")}</p></div></div>)}</div></Modal>;
}

function DataScreen({ syncStatus, lastSyncedAt, syncError, preferences, onPreferences, onSync, onJson, onCsv, onImport }: { syncStatus: SyncStatus; lastSyncedAt: string | null; syncError: string; preferences: TrainingPreferences; onPreferences: (preferences: TrainingPreferences) => void; onSync: () => void; onJson: () => void; onCsv: () => void; onImport: () => void }) {
  const lastSyncLabel = lastSyncedAt ? `${dateLabel(lastSyncedAt)} · ${timeLabel(lastSyncedAt)}` : "Waiting for first secure sync";
  return <>
    <section className={`cloud-sync-card ${syncStatus}`}>
      <div className="sync-icon">{syncStatus === "offline" ? <CloudOff size={27} /> : <Cloud size={27} />}</div>
      <div className="sync-copy"><span>SECURE CLOUD BACKUP</span><h2>{syncStatus === "syncing" || syncStatus === "starting" ? "Syncing your data…" : syncStatus === "synced" ? "Your data is protected" : syncStatus === "offline" ? "Saved locally while offline" : "Cloud sync needs attention"}</h2><p>{syncError || "Changes sync automatically, with a three-hour safety check and automatic restore on a new device."}</p><small>{lastSyncLabel}</small></div>
      <button className="btn ghost sync-button" disabled={syncStatus === "syncing" || syncStatus === "starting"} onClick={onSync}><RefreshCw size={16} /> Sync now</button>
    </section>
    <section className="privacy-card"><ShieldCheck size={30} /><div><h2>Private to your account</h2><p>Your device keeps a local copy for fast gym logging. The cloud snapshot is encrypted and can only be read through your signed-in IronLog account.</p></div></section>
    <section className="preferences-card"><div className="preferences-title"><Settings2 size={22} /><div><span className="eyebrow">TRAINING PREFERENCES</span><h2>Workout assistance</h2></div></div>
      <label className="preference-row"><span><strong>Progression suggestions</strong><small>Shows an explainable load or rep suggestion from your logged performance.</small></span><input type="checkbox" checked={preferences.progressionSuggestions} onChange={(event) => onPreferences({ ...preferences, progressionSuggestions: event.target.checked })} /></label>
      <label className="preference-row"><span><strong>Rest-timer sound</strong><small>Plays a short chime when the timer reaches 0:00 while IronLog is open.</small></span><input type="checkbox" checked={preferences.timerSound} onChange={(event) => onPreferences({ ...preferences, timerSound: event.target.checked })} /></label>
      <label className="preference-row"><span><strong>Timer haptics</strong><small>Uses vibration when supported by the phone and browser.</small></span><input type="checkbox" checked={preferences.timerHaptics} onChange={(event) => onPreferences({ ...preferences, timerHaptics: event.target.checked })} /></label>
      <label className="barbell-row"><span><strong>Default barbell</strong><small>Used by the plate calculator.</small></span><select value={preferences.defaultBarbellKg} onChange={(event) => onPreferences({ ...preferences, defaultBarbellKg: Number(event.target.value) })}><option value={20}>20 kg</option><option value={15}>15 kg</option><option value={10}>10 kg</option></select></label>
    </section>
    <section className="version-note"><span>APP VERSION</span><strong>IronLog v21</strong><p>Released 12 Sep 2026 · First created 23 Aug 2026</p></section>
    <div className="data-grid"><button className="data-action" onClick={onJson}><Download /><div><strong>Export recovery backup</strong><span>Optional JSON copy · routines, history and settings</span></div><ChevronRight /></button><button className="data-action" onClick={onImport}><Upload /><div><strong>Import recovery backup</strong><span>Only needed for a manual recovery or old export</span></div><ChevronRight /></button><button className="data-action" onClick={onCsv}><Download /><div><strong>Export history CSV</strong><span>Open workout records in any spreadsheet</span></div><ChevronRight /></button></div>
    <section className="schema-note"><span>SYNC &amp; SCHEMA</span><strong>3h</strong><p>IronLog also syncs shortly after changes and whenever the app is reopened. On a new iPhone, sign into the same account and your latest data appears automatically.</p></section>
    <section className="backlog"><span className="eyebrow">FUTURE NATIVE APP</span><h2>Native-only enhancements</h2><ul><li>Apple Health workout and measurement sync</li><li>Apple Watch workout logging</li><li>Dynamic Island and reliable background notifications</li></ul></section>
  </>;
}

function ReplaceExercise({ log, exercises, routine, onClose, onReplace }: { log: ExerciseLog; exercises: Exercise[]; routine?: Routine; onClose: () => void; onReplace: (exercise: Exercise, updateRoutine: boolean) => void }) {
  const [selected, setSelected] = useState(""); const [updateRoutine, setUpdateRoutine] = useState(false);
  return <Modal title="Replace exercise" onClose={onClose}><p className="modal-copy">Replace <strong>{log.exerciseNameSnapshot}</strong> for this workout. Your saved routine stays unchanged unless selected below.</p><label className="full-label">New exercise<select value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Choose an exercise…</option>{exercises.filter((e) => e.id !== log.exerciseId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={updateRoutine} onChange={(e) => setUpdateRoutine(e.target.checked)} /> Also update {routine?.name ?? "the saved routine"}</label><div className="modal-actions"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!selected} onClick={() => { const exercise = exercises.find((item) => item.id === selected); if (exercise) onReplace(exercise, updateRoutine); }}>Replace</button></div></Modal>;
}
