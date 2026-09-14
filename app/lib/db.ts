import Dexie, { type EntityTable } from "dexie";
import { seedData } from "./seed";
import type { Backup, BodyMeasurement, Exercise, Routine, RoutineVersion, TrainingPreferences, WorkoutSession } from "./types";

export const DEFAULT_TRAINING_PREFERENCES: TrainingPreferences = { progressionSuggestions: false, timerSound: true, timerHaptics: true, defaultBarbellKg: 20 };

class IronLogDatabase extends Dexie {
  exercises!: EntityTable<Exercise, "id">;
  routines!: EntityTable<Routine, "id">;
  sessions!: EntityTable<WorkoutSession, "id">;
  measurements!: EntityTable<BodyMeasurement, "id">;
  routineVersions!: EntityTable<RoutineVersion, "id">;
  meta!: EntityTable<{ key: string; value: string }, "key">;
  constructor() {
    super("ironlog");
    this.version(1).stores({ exercises: "id, name, category, updatedAt", routines: "id, position, name, updatedAt", sessions: "id, routineId, status, startedAt, completedAt", meta: "key" });
    this.version(2).stores({ exercises: "id, name, category, updatedAt", routines: "id, position, name, updatedAt", sessions: "id, routineId, status, startedAt, completedAt", measurements: "id, measuredAt", routineVersions: "id, routineId, createdAt", meta: "key" });
  }
}
export const db = new IronLogDatabase();

export async function initializeDatabase() {
  if (await db.meta.get("seeded-v1")) return;
  const { exercises, routines } = seedData();
  await db.transaction("rw", db.exercises, db.routines, db.meta, async () => {
    await db.exercises.bulkPut(exercises);
    await db.routines.bulkPut(routines);
    await db.meta.put({ key: "seeded-v1", value: new Date().toISOString() });
  });
}
export async function exportBackup(): Promise<Backup> {
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), exercises: await db.exercises.toArray(), routines: await db.routines.toArray(), sessions: await db.sessions.toArray(), measurements: await db.measurements.toArray(), routineVersions: await db.routineVersions.toArray(), preferences: await getTrainingPreferences() };
}
export async function getTrainingPreferences(): Promise<TrainingPreferences> {
  const stored = await db.meta.get("training-preferences-v1");
  if (!stored) return DEFAULT_TRAINING_PREFERENCES;
  try { return { ...DEFAULT_TRAINING_PREFERENCES, ...JSON.parse(stored.value) }; } catch { return DEFAULT_TRAINING_PREFERENCES; }
}
export async function saveTrainingPreferences(preferences: TrainingPreferences) { await db.meta.put({ key: "training-preferences-v1", value: JSON.stringify(preferences) }); }
export async function deleteRoutinePreservingHistory(routineId: string) {
  await db.transaction("rw", db.routines, db.routineVersions, async () => { await db.routines.delete(routineId); await db.routineVersions.where("routineId").equals(routineId).delete(); });
}
export async function importBackup(backup: Backup) {
  await db.transaction("rw", [db.exercises, db.routines, db.sessions, db.measurements, db.routineVersions, db.meta], async () => {
    await Promise.all([db.exercises.clear(), db.routines.clear(), db.sessions.clear(), db.measurements.clear(), db.routineVersions.clear()]);
    await db.exercises.bulkPut(backup.exercises); await db.routines.bulkPut(backup.routines); await db.sessions.bulkPut(backup.sessions);
    await db.measurements.bulkPut(backup.measurements ?? []); await db.routineVersions.bulkPut(backup.routineVersions ?? []);
    await saveTrainingPreferences(backup.preferences ?? DEFAULT_TRAINING_PREFERENCES);
    await db.meta.put({ key: "seeded-v1", value: new Date().toISOString() });
  });
  return false;
}
