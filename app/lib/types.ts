import { z } from "zod";

export const measurementTypes = [
  "weight_reps",
  "bodyweight_reps",
  "assisted_bodyweight",
  "time",
  "distance",
  "time_distance",
  "reps_only",
] as const;

export const setTypes = ["warmup", "working", "failure", "drop"] as const;

export const SetTemplateSchema = z.object({
  id: z.string(),
  type: z.enum(["warmup", "working"]),
  targetWeightKg: z.number().min(0).optional(),
  targetWeightPercentage: z.number().optional(),
  targetRepetitions: z.string(),
});

export const ExerciseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: z.string(),
  primaryMuscles: z.array(z.string()),
  secondaryMuscles: z.array(z.string()),
  equipment: z.string(),
  measurementType: z.enum(measurementTypes),
  instructions: z.string(),
  defaultRestSeconds: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const RoutineExerciseSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  exerciseNameSnapshot: z.string(),
  measurementType: z.enum(measurementTypes),
  position: z.number().int(),
  targetSets: z.number().int().positive(),
  minimumRepetitions: z.number().int().min(0),
  maximumRepetitions: z.number().int().min(0),
  targetRIR: z.string(),
  restSeconds: z.number().int().min(0),
  notes: z.string(),
  setTemplates: z.array(SetTemplateSchema),
});

export const RoutineSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  position: z.number().int(),
  exercises: z.array(RoutineExerciseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const SetLogSchema = z.object({
  id: z.string(),
  setNumber: z.number().int().positive(),
  setType: z.enum(setTypes),
  weightKg: z.number().min(0).optional(),
  repetitions: z.number().int().min(0).optional(),
  RIR: z.number().min(0).max(10).optional(),
  distanceMetres: z.number().min(0).optional(),
  durationSeconds: z.number().min(0).optional(),
  completedAt: z.string().optional(),
});

export const ExerciseLogSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  exerciseNameSnapshot: z.string(),
  measurementType: z.enum(measurementTypes),
  position: z.number().int(),
  notes: z.string(),
  restSeconds: z.number().int().min(0),
  setLogs: z.array(SetLogSchema),
});

export const WorkoutSessionSchema = z.object({
  id: z.string(),
  routineId: z.string(),
  routineNameSnapshot: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(["active", "paused", "completed"]),
  workoutNotes: z.string(),
  timerEndsAt: z.string().optional(),
  exerciseLogs: z.array(ExerciseLogSchema),
});

export const BodyMeasurementSchema = z.object({
  id: z.string(),
  measuredAt: z.string(),
  photoId: z.string().optional(),
  photoContentType: z.string().optional(),
  bodyWeightKg: z.number().positive().optional(),
  bodyFatPercentage: z.number().min(0).max(100).optional(),
  muscleMassKg: z.number().positive().optional(),
  waistCm: z.number().positive().optional(),
  chestCm: z.number().positive().optional(),
  armCm: z.number().positive().optional(),
  thighCm: z.number().positive().optional(),
  notes: z.string(),
});

export const RoutineVersionSchema = z.object({
  id: z.string(),
  routineId: z.string(),
  routineName: z.string(),
  createdAt: z.string(),
  reason: z.string(),
  snapshot: RoutineSchema,
});

export const TrainingPreferencesSchema = z.object({
  progressionSuggestions: z.boolean(),
  timerSound: z.boolean(),
  timerHaptics: z.boolean(),
  defaultBarbellKg: z.number().positive(),
});

export const BackupSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  exercises: z.array(ExerciseSchema),
  routines: z.array(RoutineSchema),
  sessions: z.array(WorkoutSessionSchema),
  measurements: z.array(BodyMeasurementSchema).optional().default([]),
  routineVersions: z.array(RoutineVersionSchema).optional().default([]),
  preferences: TrainingPreferencesSchema.optional().default({
    progressionSuggestions: false,
    timerSound: true,
    timerHaptics: true,
    defaultBarbellKg: 20,
  }),
});

export type MeasurementType = (typeof measurementTypes)[number];
export type SetType = (typeof setTypes)[number];
export type SetTemplate = z.infer<typeof SetTemplateSchema>;
export type Exercise = z.infer<typeof ExerciseSchema>;
export type RoutineExercise = z.infer<typeof RoutineExerciseSchema>;
export type Routine = z.infer<typeof RoutineSchema>;
export type SetLog = z.infer<typeof SetLogSchema>;
export type ExerciseLog = z.infer<typeof ExerciseLogSchema>;
export type WorkoutSession = z.infer<typeof WorkoutSessionSchema>;
export type BodyMeasurement = z.infer<typeof BodyMeasurementSchema>;
export type RoutineVersion = z.infer<typeof RoutineVersionSchema>;
export type TrainingPreferences = z.infer<typeof TrainingPreferencesSchema>;
export type Backup = z.infer<typeof BackupSchema>;

export const measurementLabels: Record<MeasurementType, string> = {
  weight_reps: "Weight + reps",
  bodyweight_reps: "Body weight + reps",
  assisted_bodyweight: "Assistance + reps",
  time: "Time",
  distance: "Distance",
  time_distance: "Time + distance",
  reps_only: "Repetitions",
};
