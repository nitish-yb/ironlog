import type { Exercise, MeasurementType, Routine, RoutineExercise, SetTemplate } from "./types";

const SEEDED_AT = "2026-09-14T00:00:00.000Z";
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const newId = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type ExerciseSpec = {
  name: string; category: string; muscles: string[]; equipment: string;
  measurementType?: MeasurementType; instructions: string; rest: number;
};
type RoutineMovement = { name: string; sets: number; reps: [number, number]; rir?: string; warmup?: boolean; notes?: string };

const catalogue: ExerciseSpec[] = [
  { name: "Barbell bench press", category: "Strength", muscles: ["Chest", "Triceps"], equipment: "Barbell", instructions: "Keep the shoulder blades stable and lower the bar with control.", rest: 180 },
  { name: "Incline dumbbell press", category: "Strength", muscles: ["Chest", "Triceps"], equipment: "Dumbbell", instructions: "Use a comfortable incline and a controlled range of motion.", rest: 120 },
  { name: "Cable chest fly", category: "Strength", muscles: ["Chest"], equipment: "Cable", instructions: "Keep a soft elbow bend and bring the hands together under control.", rest: 75 },
  { name: "Overhead press", category: "Strength", muscles: ["Shoulders", "Triceps"], equipment: "Barbell", instructions: "Brace the trunk and press without leaning excessively backward.", rest: 150 },
  { name: "Dumbbell lateral raise", category: "Strength", muscles: ["Shoulders"], equipment: "Dumbbell", instructions: "Raise with control and avoid swinging.", rest: 75 },
  { name: "Cable triceps pushdown", category: "Strength", muscles: ["Triceps"], equipment: "Cable", instructions: "Keep the upper arms still while extending the elbows.", rest: 75 },
  { name: "Pull-up", category: "Strength", muscles: ["Back", "Biceps"], equipment: "Bodyweight", measurementType: "bodyweight_reps", instructions: "Start from a controlled hang and pull without kicking.", rest: 180 },
  { name: "Lat pulldown", category: "Strength", muscles: ["Back", "Biceps"], equipment: "Cable", instructions: "Drive the elbows down and avoid excessive backward lean.", rest: 120 },
  { name: "Barbell row", category: "Strength", muscles: ["Back", "Biceps"], equipment: "Barbell", instructions: "Keep the torso stable and pull toward the lower ribs.", rest: 150 },
  { name: "Chest-supported dumbbell row", category: "Strength", muscles: ["Back"], equipment: "Dumbbell", instructions: "Keep the chest supported and pause briefly at the top.", rest: 120 },
  { name: "Face pull", category: "Strength", muscles: ["Rear delts", "Upper back"], equipment: "Cable", instructions: "Pull toward the face with elbows high and controlled.", rest: 75 },
  { name: "Dumbbell curl", category: "Strength", muscles: ["Biceps"], equipment: "Dumbbell", instructions: "Keep the upper arm still and avoid using momentum.", rest: 75 },
  { name: "Back squat", category: "Strength", muscles: ["Quadriceps", "Glutes"], equipment: "Barbell", instructions: "Brace before each repetition and use a controlled depth.", rest: 180 },
  { name: "Romanian deadlift", category: "Strength", muscles: ["Hamstrings", "Glutes"], equipment: "Barbell", instructions: "Hinge at the hips while maintaining a neutral spine.", rest: 150 },
  { name: "Bulgarian split squat", category: "Strength", muscles: ["Quadriceps", "Glutes"], equipment: "Dumbbell", instructions: "Use a stable stance and keep the front foot planted.", rest: 120 },
  { name: "Hip thrust", category: "Strength", muscles: ["Glutes"], equipment: "Barbell", instructions: "Finish with the hips extended without over-arching the back.", rest: 120 },
  { name: "Leg curl", category: "Strength", muscles: ["Hamstrings"], equipment: "Machine", instructions: "Curl smoothly and control the return.", rest: 90 },
  { name: "Standing calf raise", category: "Strength", muscles: ["Calves"], equipment: "Machine", instructions: "Pause at the top and use a full comfortable stretch.", rest: 75 },
  { name: "Deadlift", category: "Strength", muscles: ["Back", "Glutes", "Hamstrings"], equipment: "Barbell", instructions: "Brace before lifting and keep the bar close to the body.", rest: 180 },
  { name: "Goblet squat", category: "Strength", muscles: ["Quadriceps", "Glutes"], equipment: "Dumbbell", instructions: "Keep the load close and squat with a stable torso.", rest: 90 },
  { name: "Push-up", category: "Strength", muscles: ["Chest", "Triceps"], equipment: "Bodyweight", measurementType: "bodyweight_reps", instructions: "Maintain a straight line from shoulders to ankles.", rest: 90 },
  { name: "Plank", category: "Core", muscles: ["Core"], equipment: "Bodyweight", measurementType: "time", instructions: "Brace while maintaining a neutral spine.", rest: 60 },
  { name: "Farmer carry", category: "Carry", muscles: ["Full body"], equipment: "Dumbbell", measurementType: "distance", instructions: "Walk tall with controlled steps and an even grip.", rest: 90 },
  { name: "Running interval", category: "Conditioning", muscles: ["Full body"], equipment: "Other", measurementType: "time_distance", instructions: "Record both distance and duration.", rest: 120 },
];

const routineSpecs: { id: string; name: string; description: string; movements: RoutineMovement[] }[] = [
  { id: "routine-sample-push", name: "Sample Push", description: "Editable chest, shoulder and triceps template.", movements: [
    { name: "Barbell bench press", sets: 3, reps: [6, 10], warmup: true }, { name: "Incline dumbbell press", sets: 3, reps: [8, 12] },
    { name: "Dumbbell lateral raise", sets: 3, reps: [12, 20] }, { name: "Cable triceps pushdown", sets: 3, reps: [10, 15] },
  ] },
  { id: "routine-sample-pull", name: "Sample Pull", description: "Editable back and biceps template.", movements: [
    { name: "Pull-up", sets: 3, reps: [5, 10] }, { name: "Barbell row", sets: 3, reps: [6, 10] },
    { name: "Chest-supported dumbbell row", sets: 3, reps: [8, 12] }, { name: "Face pull", sets: 2, reps: [12, 20] },
    { name: "Dumbbell curl", sets: 3, reps: [8, 12] },
  ] },
  { id: "routine-sample-legs", name: "Sample Legs", description: "Editable lower-body template.", movements: [
    { name: "Back squat", sets: 3, reps: [5, 8], warmup: true }, { name: "Romanian deadlift", sets: 3, reps: [6, 10] },
    { name: "Bulgarian split squat", sets: 2, reps: [8, 12] }, { name: "Leg curl", sets: 3, reps: [10, 15] },
    { name: "Standing calf raise", sets: 3, reps: [10, 15] },
  ] },
  { id: "routine-sample-full-body", name: "Sample Full Body", description: "Editable general training template.", movements: [
    { name: "Goblet squat", sets: 3, reps: [8, 12] }, { name: "Barbell bench press", sets: 3, reps: [6, 10], warmup: true },
    { name: "Lat pulldown", sets: 3, reps: [8, 12] }, { name: "Romanian deadlift", sets: 3, reps: [8, 12] },
    { name: "Plank", sets: 3, reps: [30, 60] },
  ] },
];

const exerciseId = (name: string) => `exercise-${slug(name)}`;
function templates(movement: RoutineMovement): SetTemplate[] {
  const warmups: SetTemplate[] = movement.warmup ? [
    { id: newId(), type: "warmup", targetWeightPercentage: 0, targetRepetitions: "10–15" },
    { id: newId(), type: "warmup", targetWeightPercentage: 50, targetRepetitions: "6–8" },
    { id: newId(), type: "warmup", targetWeightPercentage: 70, targetRepetitions: "3–5" },
  ] : [];
  return [...warmups, ...Array.from({ length: movement.sets }, (): SetTemplate => ({ id: newId(), type: "working", targetRepetitions: `${movement.reps[0]}–${movement.reps[1]}` }))];
}
function routineExercise(movement: RoutineMovement, position: number): RoutineExercise {
  const exercise = catalogue.find((item) => item.name === movement.name)!;
  return {
    id: newId(), exerciseId: exerciseId(exercise.name), exerciseNameSnapshot: exercise.name,
    measurementType: exercise.measurementType ?? "weight_reps", position, targetSets: movement.sets,
    minimumRepetitions: movement.reps[0], maximumRepetitions: movement.reps[1], targetRIR: movement.rir ?? "1–3 RIR",
    restSeconds: exercise.rest, notes: movement.notes ?? "", setTemplates: templates(movement),
  };
}

export function seedData(): { exercises: Exercise[]; routines: Routine[] } {
  const exercises: Exercise[] = catalogue.map((item) => ({
    id: exerciseId(item.name), name: item.name, category: item.category, primaryMuscles: item.muscles,
    secondaryMuscles: [], equipment: item.equipment, measurementType: item.measurementType ?? "weight_reps",
    instructions: item.instructions, defaultRestSeconds: item.rest, createdAt: SEEDED_AT, updatedAt: SEEDED_AT,
  }));
  const routines: Routine[] = routineSpecs.map((routine, position) => ({
    id: routine.id, name: routine.name, description: routine.description, position,
    exercises: routine.movements.map(routineExercise), createdAt: SEEDED_AT, updatedAt: SEEDED_AT,
  }));
  return { exercises, routines };
}
