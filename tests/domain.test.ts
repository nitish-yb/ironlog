import { describe, expect, it } from "vitest";
import { calculatePlateLoading, dailyVolumeSeries, deloadRoutine, deloadStatus, effectiveVolumeWeightKg, estimatedOneRepMax, exerciseProgress, exerciseSetComparison, exerciseTrendSeries, historyCsv, measurementReminder, personalRecords, progressionSuggestion, routineSetCountChanges, routineWithWorkoutDefaults, sessionStats, sessionVolumeSeries, timerRemaining, trainingSummary, validateBackup, weeklyMuscleSets, weeklyVolumeSeries, workoutComparison, workoutWithoutSet } from "../app/lib/domain";
import type { BodyMeasurement, Exercise, ExerciseLog, Routine, WorkoutSession } from "../app/lib/types";
import { seedData } from "../app/lib/seed";

const log: ExerciseLog = {
  id: "log", exerciseId: "bench", exerciseNameSnapshot: "Bench", measurementType: "weight_reps", position: 0, notes: "", restSeconds: 180,
  setLogs: [
    { id: "s1", setNumber: 1, setType: "working", weightKg: 80, repetitions: 8, RIR: 2, completedAt: "2026-08-23T10:00:00Z" },
    { id: "s2", setNumber: 2, setType: "working", weightKg: 85, repetitions: 5, RIR: 1, completedAt: "2026-08-23T10:04:00Z" },
  ],
};
const session: WorkoutSession = { id: "w1", routineId: "r1", routineNameSnapshot: "Chest", startedAt: "2026-08-23T09:55:00Z", completedAt: "2026-08-23T10:30:00Z", status: "completed", workoutNotes: "", exerciseLogs: [log] };
const laterLog: ExerciseLog = { ...log, id: "log-2", setLogs: [
  { id: "s3", setNumber: 1, setType: "working", weightKg: 80, repetitions: 10, RIR: 2, completedAt: "2026-08-24T10:00:00Z" },
  { id: "s4", setNumber: 2, setType: "working", weightKg: 85, repetitions: 6, RIR: 1, completedAt: "2026-08-24T10:04:00Z" },
] };
const laterSession: WorkoutSession = { ...session, id: "w2", startedAt: "2026-08-24T09:55:00Z", completedAt: "2026-08-24T10:30:00Z", exerciseLogs: [laterLog] };
const routine: Routine = {
  id: "r1", name: "Chest", description: "", position: 0, createdAt: "2026-08-20T00:00:00Z", updatedAt: "2026-08-20T00:00:00Z",
  exercises: [{
    id: "routine-bench", exerciseId: "bench", exerciseNameSnapshot: "Bench", measurementType: "weight_reps", position: 0,
    targetSets: 1, minimumRepetitions: 6, maximumRepetitions: 10, targetRIR: "1–2 RIR", restSeconds: 180, notes: "Keep shoulder blades set.",
    setTemplates: [{ id: "template-1", type: "working", targetRepetitions: "6–10" }],
  }],
};
const benchExercise: Exercise = { id: "bench", name: "Bench", category: "Strength", primaryMuscles: ["Chest"], secondaryMuscles: [], equipment: "Barbell", measurementType: "weight_reps", instructions: "", defaultRestSeconds: 180, createdAt: "2026-08-20T00:00:00Z", updatedAt: "2026-08-20T00:00:00Z" };

describe("workout domain", () => {
  it("calculates matching plates on each side of a barbell", () => {
    expect(calculatePlateLoading(80, 20)).toEqual({ perSide: [25, 5], loadedWeightKg: 80, remainderKg: 0 });
    expect(calculatePlateLoading(82.5, 20)).toEqual({ perSide: [25, 5, 1.25], loadedWeightKg: 82.5, remainderKg: 0 });
  });

  it("creates a lighter deload copy without changing the source", () => {
    const source = seedData().routines.find((item) => item.id === "routine-sample-push")!;
    source.exercises[0].setTemplates.filter((set) => set.type === "working").forEach((set) => { set.targetWeightKg = 100; });
    const sourceWorkingSets = source.exercises[0].setTemplates.filter((set) => set.type === "working").length;
    const deload = deloadRoutine(source, 99);
    expect(deload.id).not.toBe(source.id);
    expect(deload.name).toContain("Deload");
    expect(deload.exercises[0].setTemplates.filter((set) => set.type === "working")).toHaveLength(Math.max(1, sourceWorkingSets - 1));
    expect(deload.exercises[0].targetRIR).toBe("3–4 RIR");
    expect(deload.exercises[0].notes).toContain("do not train to failure");
    expect(deload.exercises[0].setTemplates.find((set) => set.type === "working")?.targetWeightKg).toBe(87.5);
    expect(source.exercises[0].setTemplates.filter((set) => set.type === "working")).toHaveLength(sourceWorkingSets);
  });

  it("suggests a deload after eight active weeks without resetting for missed workouts", () => {
    const weeks = [0, 7, 14, 28, 35, 42, 49, 56].map((days, index) => ({
      ...session,
      id: `week-${index}`,
      startedAt: new Date(Date.UTC(2026, 0, 5 + days, 9)).toISOString(),
      completedAt: new Date(Date.UTC(2026, 0, 5 + days, 10)).toISOString(),
    }));
    expect(deloadStatus(weeks)).toMatchObject({ activeWeeks: 8, due: true, weeksRemaining: 0 });
  });

  it("reminds for measurements every three weeks", () => {
    const measurement: BodyMeasurement = { id: "m1", measuredAt: "2026-08-01T12:00:00Z", bodyFatPercentage: 18, muscleMassKg: 54, notes: "" };
    expect(measurementReminder([measurement], new Date("2026-08-21T12:00:00Z"))).toMatchObject({ due: false, daysRemaining: 1 });
    expect(measurementReminder([measurement], new Date("2026-08-22T12:00:00Z"))).toMatchObject({ due: true, daysRemaining: 0 });
  });

  it("explains when the completed rep range supports adding load", () => {
    const topRangeLog: ExerciseLog = { ...log, setLogs: log.setLogs.map((set) => ({ ...set, repetitions: 10, RIR: 2 })) };
    const topRangeSession: WorkoutSession = { ...session, exerciseLogs: [topRangeLog] };
    const suggestion = progressionSuggestion([topRangeSession], { ...log, setLogs: [] }, routine.exercises[0], "2026-08-24T10:00:00Z");
    expect(suggestion.action).toBe("add_weight");
    expect(suggestion.explanation).toContain("10+");
  });

  it("uses equipment metadata for dumbbell progression", () => {
    const topRangeLog: ExerciseLog = { ...log, exerciseNameSnapshot: "Dumbbell Bulgarian split squat", setLogs: log.setLogs.map((set) => ({ ...set, weightKg: 20, repetitions: 10, RIR: 2 })) };
    const topRangeSession: WorkoutSession = { ...session, exerciseLogs: [topRangeLog] };
    const suggestion = progressionSuggestion([topRangeSession], { ...topRangeLog, setLogs: [] }, routine.exercises[0], "2026-08-24T10:00:00Z", "Dumbbell");
    expect(suggestion).toMatchObject({ action: "add_weight", suggestedWeightKg: 22.5 });
    expect(suggestion.headline).toContain("each");
    expect(effectiveVolumeWeightKg("Dumbbell curl", 10)).toBe(10);
  });

  it("calculates session totals", () => expect(sessionStats(session)).toEqual({ sets: 2, reps: 13, volume: 1065 }));
  it("calculates Epley estimated 1RM", () => expect(estimatedOneRepMax(90, 10)).toBe(120));
  it("finds best exercise performance", () => expect(exerciseProgress([log])).toMatchObject({ bestWeight: 85, bestRepsAtBestWeight: 5 }));
  it("recalculates a timer from its completion timestamp", () => expect(timerRemaining("2026-08-23T10:01:30Z", new Date("2026-08-23T10:00:00Z").getTime())).toBe(90));
  it("exports completed history as CSV", () => expect(historyCsv([session])).toContain('"85","5","1"'));
  it("rejects an incompatible backup without data loss", () => expect(() => validateBackup({ schemaVersion: 99 })).toThrow());
  it("finds previous set and most recent reps at the exact same weight", () => {
    const comparison = exerciseSetComparison([session], "bench", 1, 85, laterSession.startedAt);
    expect(comparison.previousSet?.repetitions).toBe(5);
    expect(comparison.sameWeightSet?.repetitions).toBe(5);
  });
  it("compares workout volume with the previous workout of the same routine", () => {
    const report = workoutComparison(laterSession, [laterSession, session]);
    expect(report.previous?.id).toBe("w1");
    expect(report.volumeChange).toBe(245);
  });
  it("calculates training days and a current streak", () => {
    const summary = trainingSummary([session, laterSession], new Date("2026-08-24T12:00:00Z"));
    expect(summary).toMatchObject({ totalWorkouts: 2, trainingDays: 2, currentStreak: 2, last30Days: 2 });
  });
  it("creates weekly volume and per-exercise trend series", () => {
    expect(weeklyVolumeSeries([session, laterSession], new Date("2026-08-24T12:00:00Z"), 2).at(-1)?.workouts).toBe(1);
    expect(exerciseTrendSeries([laterSession, session], "bench").map((point) => point.bestE1RM)).toEqual([101.3, 106.7]);
  });
  it("creates daily and per-session volume trend series", () => {
    expect(dailyVolumeSeries([session, laterSession], new Date("2026-08-24T12:00:00Z"), 2).map((point) => point.volume)).toEqual([1065, 1310]);
    expect(sessionVolumeSeries([laterSession, session]).map((point) => point.id)).toEqual(["w1", "w2"]);
  });
  it("detects a strength personal record only after a prior benchmark", () => {
    expect(personalRecords(session, [])).toEqual([]);
    expect(personalRecords(laterSession, [session])).toEqual([{ exerciseId: "bench", exerciseName: "Bench", label: "Estimated strength PR", value: "106.7 kg e1RM" }]);
  });
  it("totals completed non-warmup sets by muscle for the current week", () => {
    expect(weeklyMuscleSets([session], [benchExercise], new Date("2026-08-23T12:00:00Z"))).toEqual([{ muscle: "Chest", sets: 2 }]);
  });
  it("detects changed set counts and updates routine weight defaults", () => {
    expect(routineSetCountChanges(session, routine)).toEqual([{ exerciseId: "bench", name: "Bench", previous: 1, current: 2 }]);
    const updated = routineWithWorkoutDefaults(routine, session);
    expect(updated.exercises[0].targetSets).toBe(2);
    expect(updated.exercises[0].setTemplates.map((set) => [set.targetWeightKg, set.targetRepetitions])).toEqual([[80, "8"], [85, "5"]]);
    expect(updated.exercises[0].targetRIR).toBe("1–2 RIR");
    expect(updated.exercises[0].notes).toBe("Keep shoulder blades set.");
  });
  it("keeps decimal weights and decimal RIR when workout values become routine defaults", () => {
    const decimalSession: WorkoutSession = {
      ...session,
      exerciseLogs: [{
        ...log,
        setLogs: [
          { ...log.setLogs[0], weightKg: 72.5, repetitions: 9, RIR: 1.5 },
          { ...log.setLogs[1], weightKg: 75.25, repetitions: 7, RIR: 0.5 },
        ],
      }],
    };
    const updated = routineWithWorkoutDefaults(routine, decimalSession);
    expect(updated.exercises[0].setTemplates.map((set) => [set.targetWeightKg, set.targetRepetitions])).toEqual([[72.5, "9"], [75.25, "7"]]);
    expect(updated.exercises[0].targetRIR).toBe("0.5–1.5 RIR");
  });
  it("deletes any selected workout set and renumbers the remaining sets", () => {
    const updated = workoutWithoutSet(session, log.id, "s1");
    expect(updated.exerciseLogs[0].setLogs).toHaveLength(1);
    expect(updated.exerciseLogs[0].setLogs[0]).toMatchObject({ id: "s2", setNumber: 1 });
    expect(workoutWithoutSet(updated, log.id, "s2")).toEqual(updated);
  });
});
