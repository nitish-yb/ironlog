import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { db, deleteRoutinePreservingHistory, initializeDatabase } from "../app/lib/db";
import { seedData } from "../app/lib/seed";
import type { WorkoutSession } from "../app/lib/types";

const completed: WorkoutSession = {
  id: "history-kept", routineId: "routine-sample-push", routineNameSnapshot: "Sample Push",
  startedAt: "2026-09-01T10:00:00Z", completedAt: "2026-09-01T11:00:00Z",
  status: "completed", workoutNotes: "", exerciseLogs: [],
};

describe("database safety", () => {
  afterEach(async () => { await db.delete(); });

  it("installs generic routines and a reusable exercise catalogue", async () => {
    await db.open();
    await initializeDatabase();
    expect(await db.routines.count()).toBe(4);
    expect(await db.exercises.count()).toBeGreaterThan(20);
    expect((await db.routines.toArray()).flatMap((routine) => routine.exercises).every((exercise) => exercise.setTemplates.every((set) => set.targetWeightKg === undefined))).toBe(true);
  });

  it("does not overwrite an existing local database", async () => {
    await db.open();
    const custom = { ...seedData().routines[0], id: "custom", name: "My routine" };
    await db.routines.put(custom);
    await db.meta.put({ key: "seeded-v1", value: "already-seeded" });
    await initializeDatabase();
    expect(await db.routines.toArray()).toEqual([custom]);
  });

  it("deletes a routine while retaining completed workout history", async () => {
    await db.open();
    const routine = seedData().routines[0];
    await db.routines.put(routine);
    await db.sessions.put(completed);
    await deleteRoutinePreservingHistory(routine.id);
    expect(await db.routines.get(routine.id)).toBeUndefined();
    expect(await db.sessions.get(completed.id)).toEqual(completed);
  });
});
