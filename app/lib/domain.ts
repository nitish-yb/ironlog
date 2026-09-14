import type { Backup, BodyMeasurement, Exercise, ExerciseLog, Routine, RoutineExercise, SetLog, WorkoutSession } from "./types";
import { BackupSchema } from "./types";

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function effectiveVolumeWeightKg(_exerciseName: string, enteredWeightKg?: number) {
  return enteredWeightKg ?? 0;
}

const setVolume = (exerciseName: string, set: SetLog) =>
  effectiveVolumeWeightKg(exerciseName, set.weightKg) * (set.repetitions ?? 0);

export function sessionStats(session: WorkoutSession) {
  const completed = session.exerciseLogs.flatMap((e) => e.setLogs).filter((s) => s.completedAt);
  return {
    sets: completed.length,
    reps: completed.reduce((sum, s) => sum + (s.repetitions ?? 0), 0),
    volume: session.exerciseLogs.reduce((sum, exercise) => sum + exercise.setLogs
      .filter((set) => set.completedAt)
      .reduce((exerciseSum, set) => exerciseSum + setVolume(exercise.exerciseNameSnapshot, set), 0), 0),
  };
}

export function estimatedOneRepMax(weightKg?: number, repetitions?: number) {
  if (!weightKg || !repetitions) return 0;
  return Math.round(weightKg * (1 + repetitions / 30) * 10) / 10;
}

export function exerciseProgress(logs: ExerciseLog[]) {
  const sets = logs.flatMap((log) => log.setLogs).filter((set) => set.completedAt);
  const weighted = sets.filter((set) => (set.weightKg ?? 0) > 0);
  const bestWeight = Math.max(0, ...weighted.map((set) => set.weightKg ?? 0));
  const atBestWeight = weighted.filter((set) => set.weightKg === bestWeight);
  const bestRepsAtBestWeight = Math.max(0, ...atBestWeight.map((set) => set.repetitions ?? 0));
  const bestE1RM = Math.max(0, ...weighted.map((set) => estimatedOneRepMax(set.weightKg, set.repetitions)));
  const latest = [...sets].reverse().find(Boolean);
  return { bestWeight, bestRepsAtBestWeight, bestE1RM, latest };
}

export function timerRemaining(timerEndsAt?: string, now = Date.now()) {
  if (!timerEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(timerEndsAt).getTime() - now) / 1000));
}

export function validateBackup(input: unknown): Backup {
  return BackupSchema.parse(input);
}

export function historyCsv(sessions: WorkoutSession[]) {
  const rows = [["date", "routine", "exercise", "set", "type", "weight_kg", "repetitions", "rir", "distance_m", "duration_s"]];
  sessions.filter((s) => s.status === "completed").forEach((session) => {
    session.exerciseLogs.forEach((exercise) => exercise.setLogs.forEach((set) => {
      rows.push([
        session.completedAt ?? session.startedAt,
        session.routineNameSnapshot,
        exercise.exerciseNameSnapshot,
        String(set.setNumber),
        set.setType,
        set.weightKg?.toString() ?? "",
        set.repetitions?.toString() ?? "",
        set.RIR?.toString() ?? "",
        set.distanceMetres?.toString() ?? "",
        set.durationSeconds?.toString() ?? "",
      ]);
    }));
  });
  return rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
}

export function freshSet(setNumber: number, setType: SetLog["setType"] = "working"): SetLog {
  return { id: uid(), setNumber, setType };
}

export function exerciseLogStats(log?: ExerciseLog) {
  const sets = log?.setLogs.filter((set) => set.completedAt) ?? [];
  return {
    sets: sets.length,
    reps: sets.reduce((sum, set) => sum + (set.repetitions ?? 0), 0),
    volume: sets.reduce((sum, set) => sum + setVolume(log?.exerciseNameSnapshot ?? "", set), 0),
    bestWeight: Math.max(0, ...sets.map((set) => set.weightKg ?? 0)),
    bestReps: Math.max(0, ...sets.map((set) => set.repetitions ?? 0)),
    bestDistance: Math.max(0, ...sets.map((set) => set.distanceMetres ?? 0)),
    bestDuration: Math.max(0, ...sets.map((set) => set.durationSeconds ?? 0)),
    bestE1RM: Math.max(0, ...sets.map((set) => estimatedOneRepMax(set.weightKg, set.repetitions))),
  };
}

export function previousExerciseLog(sessions: WorkoutSession[], exerciseId: string, beforeStartedAt?: string) {
  return sessions
    .filter((session) => session.status === "completed" && (!beforeStartedAt || session.startedAt < beforeStartedAt))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .flatMap((session) => session.exerciseLogs)
    .find((log) => log.exerciseId === exerciseId);
}

export function exerciseSetComparison(sessions: WorkoutSession[], exerciseId: string, setIndex: number, weightKg?: number, beforeStartedAt?: string) {
  const ordered = sessions
    .filter((session) => session.status === "completed" && (!beforeStartedAt || session.startedAt < beforeStartedAt))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const lastLog = ordered.flatMap((session) => session.exerciseLogs).find((log) => log.exerciseId === exerciseId);
  const previousSet = lastLog?.setLogs[setIndex];
  const sameWeightSet = weightKg === undefined ? undefined : ordered
    .flatMap((session) => session.exerciseLogs)
    .filter((log) => log.exerciseId === exerciseId)
    .flatMap((log) => log.setLogs)
    .find((set) => set.completedAt && set.weightKg === weightKg && set.repetitions !== undefined);
  return { previousSet, sameWeightSet };
}

export type ProgressionSuggestion = {
  action: "baseline" | "add_weight" | "add_reps" | "hold" | "reduce";
  headline: string;
  explanation: string;
  suggestedWeightKg?: number;
};

export function progressionSuggestion(sessions: WorkoutSession[], exercise: ExerciseLog, routineExercise?: RoutineExercise, beforeStartedAt?: string, equipment?: string): ProgressionSuggestion {
  const history = sessions
    .filter((session) => session.status === "completed" && (!beforeStartedAt || session.startedAt < beforeStartedAt))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .flatMap((session) => session.exerciseLogs)
    .filter((log) => log.exerciseId === exercise.exerciseId)
    .slice(0, 2);
  const latestSets = history[0]?.setLogs.filter((set) => set.completedAt && set.setType !== "warmup") ?? [];
  if (!latestSets.length) return { action: "baseline", headline: "Establish a baseline", explanation: "Complete the working sets today; IronLog will use them for the next suggestion." };

  if (!["weight_reps", "assisted_bodyweight", "bodyweight_reps"].includes(exercise.measurementType)) {
    const latestBest = Math.max(0, ...latestSets.map((set) => set.repetitions ?? set.distanceMetres ?? set.durationSeconds ?? 0));
    return { action: "add_reps", headline: "Beat the last result", explanation: `Your latest best was ${latestBest || "recorded"}. Aim for one controlled repetition or a small performance improvement.` };
  }

  const minimum = routineExercise?.minimumRepetitions ?? 8;
  const maximum = routineExercise?.maximumRepetitions ?? 12;
  const reps = latestSets.map((set) => set.repetitions ?? 0);
  const weights = latestSets.map((set) => set.weightKg ?? 0).filter((weight) => weight > 0);
  const workingWeight = weights.at(-1) ?? weights[0];
  const allAtTop = reps.length > 0 && reps.every((value) => value >= maximum);
  const missedMinimum = reps.filter((value) => value < minimum).length >= Math.ceil(reps.length / 2);
  const lowRir = latestSets.filter((set) => set.RIR !== undefined).some((set) => (set.RIR ?? 0) === 0);

  if (allAtTop && !lowRir && workingWeight) {
    const isDumbbell = equipment?.toLowerCase().includes("dumbbell") || exercise.exerciseNameSnapshot.toLowerCase().includes("dumbbell");
    const increment = 2.5;
    const suggestedWeightKg = workingWeight + increment;
    const loadLabel = isDumbbell ? `${suggestedWeightKg} kg each` : `${suggestedWeightKg} kg`;
    const equipmentExplanation = isDumbbell ? "This is the weight for each dumbbell." : "This is the total implement weight.";
    return { action: "add_weight", headline: `Try ${loadLabel}`, explanation: `You reached ${maximum}+ reps on every working set with reserve. ${equipmentExplanation} Return near ${minimum} reps.`, suggestedWeightKg };
  }
  if (missedMinimum && lowRir && workingWeight) {
    const reduced = Math.max(0, Math.round(workingWeight * 0.95 * 2) / 2);
    return { action: "reduce", headline: `Consider ${reduced} kg`, explanation: `At least half the sets fell below ${minimum} reps and reached 0 RIR. A small reduction can restore the intended rep range.`, suggestedWeightKg: reduced };
  }
  if (lowRir) return { action: "hold", headline: "Hold the load", explanation: `Keep the same weight and build toward ${minimum}–${maximum} reps without taking every set to failure.` };
  return { action: "add_reps", headline: "Add one repetition", explanation: `Keep the latest weight and try to add one total rep while staying inside the ${minimum}–${maximum} target range.` };
}

export type PlateLoading = { perSide: number[]; loadedWeightKg: number; remainderKg: number };

export function calculatePlateLoading(targetWeightKg: number, barbellWeightKg = 20, availablePlates = [25, 20, 15, 10, 5, 2.5, 1.25]): PlateLoading {
  const perSideTarget = Math.max(0, (targetWeightKg - barbellWeightKg) / 2);
  let remaining = Math.round(perSideTarget * 100) / 100;
  const perSide: number[] = [];
  for (const plate of availablePlates) {
    while (remaining + 0.0001 >= plate) { perSide.push(plate); remaining = Math.round((remaining - plate) * 100) / 100; }
  }
  const loadedPerSide = perSide.reduce((sum, plate) => sum + plate, 0);
  const loadedWeightKg = Math.round((barbellWeightKg + loadedPerSide * 2) * 100) / 100;
  return { perSide, loadedWeightKg, remainderKg: Math.round((targetWeightKg - loadedWeightKg) * 100) / 100 };
}

export function deloadRoutine(routine: Routine, position: number): Routine {
  const now = new Date().toISOString();
  return {
    ...structuredClone(routine),
    id: uid(),
    name: `Deload · ${routine.name.replace(/^Deload · /, "")}`,
    description: `${routine.description ? `${routine.description} · ` : ""}Deload: 10–15% less weight, 60–70% of normal working sets, 3–4 RIR, no failure, normal rest.`,
    position,
    createdAt: now,
    updatedAt: now,
    exercises: routine.exercises.map((exercise, exerciseIndex) => {
      const workingCount = exercise.setTemplates.filter((set) => set.type === "working").length;
      const deloadWorkingCount = Math.max(1, Math.round(workingCount * 0.65));
      let includedWorkingSets = 0;
      const setTemplates = exercise.setTemplates
        .filter((set) => set.type === "warmup" || includedWorkingSets++ < deloadWorkingCount)
        .map((set) => ({
          ...set,
          id: uid(),
          targetWeightKg: set.type === "working" && set.targetWeightKg !== undefined
            ? Math.round(set.targetWeightKg * 0.875 * 2) / 2
            : set.targetWeightKg,
        }));
      const deloadNote = "Deload: keep 3–4 RIR, do not train to failure, use your usual technique and keep normal rest periods.";
      return {
        ...exercise,
        id: uid(),
        position: exerciseIndex,
        targetSets: deloadWorkingCount,
        targetRIR: "3–4 RIR",
        notes: exercise.notes ? `${exercise.notes}\n\n${deloadNote}` : deloadNote,
        setTemplates,
      };
    }),
  };
}

const isDeloadSession = (session: WorkoutSession) => session.routineNameSnapshot.toLowerCase().includes("deload");

const trainingWeekKey = (value: string) => {
  const date = new Date(value);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
};

export type DeloadStatus = {
  activeWeeks: number;
  targetWeeks: number;
  weeksRemaining: number;
  due: boolean;
  lastDeloadAt?: string;
};

export function deloadStatus(sessions: WorkoutSession[], targetWeeks = 8): DeloadStatus {
  const completed = sessions
    .filter((session) => session.status === "completed")
    .sort((a, b) => (a.completedAt ?? a.startedAt).localeCompare(b.completedAt ?? b.startedAt));
  const lastDeload = completed.filter(isDeloadSession).at(-1);
  const lastDeloadAt = lastDeload?.completedAt ?? lastDeload?.startedAt;
  const activeWeeks = new Set(
    completed
      .filter((session) => !isDeloadSession(session) && (!lastDeloadAt || (session.completedAt ?? session.startedAt) > lastDeloadAt))
      .map((session) => trainingWeekKey(session.completedAt ?? session.startedAt)),
  ).size;
  return {
    activeWeeks,
    targetWeeks,
    weeksRemaining: Math.max(0, targetWeeks - activeWeeks),
    due: activeWeeks >= targetWeeks,
    lastDeloadAt,
  };
}

export type MeasurementReminder = {
  due: boolean;
  daysRemaining: number;
  daysSince?: number;
  nextDueAt?: string;
};

export function measurementReminder(measurements: BodyMeasurement[], now = new Date()): MeasurementReminder {
  const latest = [...measurements].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
  if (!latest) return { due: true, daysRemaining: 0 };
  const elapsedMs = Math.max(0, now.getTime() - new Date(latest.measuredAt).getTime());
  const daysSince = Math.floor(elapsedMs / 86_400_000);
  const nextDueAt = new Date(new Date(latest.measuredAt).getTime() + 21 * 86_400_000).toISOString();
  return { due: daysSince >= 21, daysRemaining: Math.max(0, 21 - daysSince), daysSince, nextDueAt };
}

export function routineSetCountChanges(session: WorkoutSession, routine?: Routine) {
  if (!routine) return [];
  return session.exerciseLogs.flatMap((log) => {
    const routineExercise = routine.exercises.find((item) => item.exerciseId === log.exerciseId);
    if (!routineExercise || routineExercise.setTemplates.length === log.setLogs.length) return [];
    return [{
      exerciseId: log.exerciseId,
      name: log.exerciseNameSnapshot,
      previous: routineExercise.setTemplates.length,
      current: log.setLogs.length,
    }];
  });
}

export function routineWithWorkoutDefaults(routine: Routine, session: WorkoutSession): Routine {
  const updatedAt = new Date().toISOString();
  return {
    ...routine,
    updatedAt,
    exercises: routine.exercises.map((item) => {
      const log = session.exerciseLogs.find((entry) => entry.exerciseId === item.exerciseId);
      if (!log) return item;
      const setTemplates = log.setLogs.map((set, index) => {
        const existing = item.setTemplates[index];
        return {
          id: existing?.id ?? uid(),
          type: set.setType === "warmup" ? "warmup" as const : "working" as const,
          targetWeightKg: set.weightKg,
          targetWeightPercentage: existing?.targetWeightPercentage,
          targetRepetitions: set.repetitions !== undefined ? String(set.repetitions) : existing?.targetRepetitions ?? `${item.minimumRepetitions}–${item.maximumRepetitions}`,
        };
      });
      const recordedRir = log.setLogs
        .filter((set) => set.setType !== "warmup" && set.RIR !== undefined)
        .map((set) => set.RIR as number);
      const minimumRir = recordedRir.length ? Math.min(...recordedRir) : undefined;
      const maximumRir = recordedRir.length ? Math.max(...recordedRir) : undefined;
      const targetRIR = minimumRir === undefined || maximumRir === undefined
        ? item.targetRIR
        : minimumRir === maximumRir
          ? `${minimumRir} RIR`
          : `${minimumRir}–${maximumRir} RIR`;
      return {
        ...item,
        targetSets: Math.max(1, setTemplates.filter((set) => set.type === "working").length),
        targetRIR,
        setTemplates,
      };
    }),
  };
}

export function workoutWithoutSet(session: WorkoutSession, exerciseLogId: string, setId: string): WorkoutSession {
  return {
    ...session,
    exerciseLogs: session.exerciseLogs.map((exercise) => {
      if (exercise.id !== exerciseLogId || exercise.setLogs.length <= 1) return exercise;
      const remaining = exercise.setLogs.filter((set) => set.id !== setId);
      if (remaining.length === exercise.setLogs.length) return exercise;
      return {
        ...exercise,
        setLogs: remaining.map((set, index) => ({ ...set, setNumber: index + 1 })),
      };
    }),
  };
}

export function previousComparableWorkout(session: WorkoutSession, sessions: WorkoutSession[]) {
  return sessions
    .filter((candidate) => candidate.status === "completed" && candidate.id !== session.id && candidate.routineId === session.routineId && candidate.startedAt < session.startedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

export function workoutComparison(session: WorkoutSession, sessions: WorkoutSession[]) {
  const previous = previousComparableWorkout(session, sessions);
  const currentStats = sessionStats(session);
  const previousStats = previous ? sessionStats(previous) : undefined;
  const exercises = session.exerciseLogs.map((log) => {
    const previousLog = previous?.exerciseLogs.find((item) => item.exerciseId === log.exerciseId);
    const current = exerciseLogStats(log);
    const prior = exerciseLogStats(previousLog);
    return { exerciseId: log.exerciseId, name: log.exerciseNameSnapshot, current, previous: previousLog ? prior : undefined, volumeChange: previousLog ? current.volume - prior.volume : undefined };
  });
  return { previous, currentStats, previousStats, volumeChange: previousStats ? currentStats.volume - previousStats.volume : undefined, exercises };
}

export const localDayKey = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, amount: number) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next; };

export function trainingSummary(sessions: WorkoutSession[], now = new Date()) {
  const completed = sessions.filter((session) => session.status === "completed");
  const dayKeys = [...new Set(completed.map((session) => localDayKey(session.completedAt ?? session.startedAt)))].sort();
  const cutoff = addDays(startOfDay(now), -29);
  const last30Days = dayKeys.filter((key) => new Date(`${key}T00:00:00`) >= cutoff).length;
  const latest = dayKeys.at(-1);
  let currentStreak = 0;
  if (latest) {
    let cursor = new Date(`${latest}T00:00:00`);
    const today = startOfDay(now);
    const difference = Math.round((today.getTime() - cursor.getTime()) / 86400000);
    if (difference <= 1) {
      const set = new Set(dayKeys);
      while (set.has(localDayKey(cursor))) { currentStreak += 1; cursor = addDays(cursor, -1); }
    }
  }
  const totalVolume = completed.reduce((sum, session) => sum + sessionStats(session).volume, 0);
  return { totalWorkouts: completed.length, trainingDays: dayKeys.length, last30Days, currentStreak, totalVolume, dayKeys };
}

export function weeklyVolumeSeries(sessions: WorkoutSession[], now = new Date(), numberOfWeeks = 8) {
  const currentMonday = startOfDay(now);
  const mondayOffset = (currentMonday.getDay() + 6) % 7;
  currentMonday.setDate(currentMonday.getDate() - mondayOffset);
  return Array.from({ length: numberOfWeeks }, (_, index) => {
    const start = addDays(currentMonday, (index - numberOfWeeks + 1) * 7);
    const end = addDays(start, 7);
    const workouts = sessions.filter((session) => session.status === "completed" && new Date(session.completedAt ?? session.startedAt) >= start && new Date(session.completedAt ?? session.startedAt) < end);
    return {
      key: localDayKey(start),
      label: new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(start),
      volume: Math.round(workouts.reduce((sum, session) => sum + sessionStats(session).volume, 0)),
      workouts: workouts.length,
    };
  });
}

export function dailyVolumeSeries(sessions: WorkoutSession[], now = new Date(), numberOfDays = 14) {
  const today = startOfDay(now);
  return Array.from({ length: numberOfDays }, (_, index) => {
    const day = addDays(today, index - numberOfDays + 1);
    const key = localDayKey(day);
    const workouts = sessions.filter((session) => session.status === "completed" && localDayKey(session.completedAt ?? session.startedAt) === key);
    return {
      key,
      label: new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(day),
      volume: Math.round(workouts.reduce((sum, session) => sum + sessionStats(session).volume, 0)),
      workouts: workouts.length,
    };
  });
}

export function sessionVolumeSeries(sessions: WorkoutSession[], limit = 12) {
  return sessions
    .filter((session) => session.status === "completed")
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .slice(-limit)
    .map((session) => ({
      id: session.id,
      label: new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(session.startedAt)),
      routine: session.routineNameSnapshot,
      volume: Math.round(sessionStats(session).volume),
    }));
}

export type PersonalRecord = { exerciseId: string; exerciseName: string; label: string; value: string };

export function personalRecords(session: WorkoutSession, sessions: WorkoutSession[]): PersonalRecord[] {
  const priorLogsByExercise = new Map<string, ExerciseLog[]>();
  sessions.filter((item) => item.status === "completed" && item.id !== session.id && item.startedAt < session.startedAt).forEach((item) => {
    item.exerciseLogs.forEach((log) => priorLogsByExercise.set(log.exerciseId, [...(priorLogsByExercise.get(log.exerciseId) ?? []), log]));
  });

  return session.exerciseLogs.flatMap((log) => {
    const currentSets = log.setLogs.filter((set) => set.completedAt);
    const previousSets = (priorLogsByExercise.get(log.exerciseId) ?? []).flatMap((item) => item.setLogs).filter((set) => set.completedAt);
    if (!currentSets.length || !previousSets.length) return [];
    const record = (label: string, value: string): PersonalRecord[] => [{ exerciseId: log.exerciseId, exerciseName: log.exerciseNameSnapshot, label, value }];

    if (["weight_reps", "assisted_bodyweight"].includes(log.measurementType)) {
      const currentWeight = Math.max(0, ...currentSets.map((set) => set.weightKg ?? 0));
      const previousWeight = Math.max(0, ...previousSets.map((set) => set.weightKg ?? 0));
      if (currentWeight > previousWeight) {
        const reps = Math.max(0, ...currentSets.filter((set) => set.weightKg === currentWeight).map((set) => set.repetitions ?? 0));
        return record("Weight PR", `${currentWeight} kg × ${reps}`);
      }
      const currentE1RM = Math.max(0, ...currentSets.map((set) => estimatedOneRepMax(set.weightKg, set.repetitions)));
      const previousE1RM = Math.max(0, ...previousSets.map((set) => estimatedOneRepMax(set.weightKg, set.repetitions)));
      if (currentE1RM > previousE1RM) return record("Estimated strength PR", `${currentE1RM} kg e1RM`);
      return [];
    }

    if (["reps_only", "bodyweight_reps"].includes(log.measurementType)) {
      const current = Math.max(0, ...currentSets.map((set) => set.repetitions ?? 0));
      const previous = Math.max(0, ...previousSets.map((set) => set.repetitions ?? 0));
      return current > previous ? record("Repetition PR", `${current} reps`) : [];
    }

    if (log.measurementType.includes("distance")) {
      const current = Math.max(0, ...currentSets.map((set) => set.distanceMetres ?? 0));
      const previous = Math.max(0, ...previousSets.map((set) => set.distanceMetres ?? 0));
      return current > previous ? record("Distance PR", `${current} m`) : [];
    }

    if (log.measurementType === "time") {
      const current = Math.max(0, ...currentSets.map((set) => set.durationSeconds ?? 0));
      const previous = Math.max(0, ...previousSets.map((set) => set.durationSeconds ?? 0));
      return current > previous ? record("Duration PR", `${current} sec`) : [];
    }
    return [];
  });
}

export function weeklyMuscleSets(sessions: WorkoutSession[], exercises: Exercise[], now = new Date()) {
  const monday = startOfDay(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const totals = new Map<string, number>();
  sessions.filter((session) => session.status === "completed" && new Date(session.completedAt ?? session.startedAt) >= monday).forEach((session) => {
    session.exerciseLogs.forEach((log) => {
      const muscle = exerciseMap.get(log.exerciseId)?.primaryMuscles[0] || "Other";
      const completedSets = log.setLogs.filter((set) => set.completedAt && set.setType !== "warmup").length;
      totals.set(muscle, (totals.get(muscle) ?? 0) + completedSets);
    });
  });
  return [...totals.entries()].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}

export function exerciseTrendSeries(sessions: WorkoutSession[], exerciseId: string) {
  return sessions
    .filter((session) => session.status === "completed")
    .flatMap((session) => session.exerciseLogs.filter((log) => log.exerciseId === exerciseId).map((log) => {
      const stats = exerciseLogStats(log);
      return { date: session.completedAt ?? session.startedAt, label: new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(session.startedAt)), ...stats };
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
