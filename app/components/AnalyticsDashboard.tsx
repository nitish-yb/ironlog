"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Dumbbell, Flame, ImagePlus, Plus, Save, Star, Trash2, TrendingUp, X } from "lucide-react";
import { dailyVolumeSeries, exerciseProgress, exerciseTrendSeries, localDayKey, measurementReminder, sessionStats, sessionVolumeSeries, trainingSummary, uid, weeklyMuscleSets, weeklyVolumeSeries } from "../lib/domain";
import type { BodyMeasurement, Exercise, MeasurementType, WorkoutSession } from "../lib/types";

export type View = "overview" | "exercises" | "calendar" | "measurements";

const compact = (value: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const chart = { accent: "#d1cfca", grid: "#36373d", muted: "#9d9da3", tooltip: "#18191c", tooltipBorder: "#3b3c42" };
const MAX_PHOTO_UPLOAD_BYTES = 1_500_000;

async function prepareProgressPhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo from your camera or photo library.");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This photo format could not be prepared. Try taking a screenshot and upload that instead."));
      image.src = source;
    });
    const attempts = [{ max: 1600, quality: .82 }, { max: 1280, quality: .74 }, { max: 1024, quality: .68 }];
    for (const attempt of attempts) {
      const scale = Math.min(1, attempt.max / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo preparation is unavailable on this device.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", attempt.quality));
      if (blob && blob.size <= MAX_PHOTO_UPLOAD_BYTES) {
        const filename = `${file.name.replace(/\.[^.]+$/, "") || "progress-photo"}.jpg`;
        return new File([blob], filename, { type: "image/jpeg", lastModified: Date.now() });
      }
    }
    throw new Error("The photo is still too large after compression. Try a screenshot or a more tightly cropped photo.");
  } finally { URL.revokeObjectURL(source); }
}

async function uploadProgressPhoto(file: File, photoId: string) {
  const prepared = await prepareProgressPhoto(file);
  const form = new FormData(); form.set("photo", prepared); form.set("photoId", photoId);
  const uploaded = await fetch("/api/photos", { method: "POST", body: form });
  const responseText = await uploaded.text();
  let result: { error?: string; contentType?: string } = {};
  try { result = responseText ? JSON.parse(responseText) as typeof result : {}; } catch { /* Hosting errors can return a non-JSON response. */ }
  if (!uploaded.ok) {
    if (uploaded.status === 413) throw new Error("The photo was too large to upload. Try a screenshot or a more tightly cropped photo.");
    throw new Error(result.error ?? `Photo upload failed (${uploaded.status}). Please try again.`);
  }
  return result.contentType ?? prepared.type;
}

export function AnalyticsDashboard({ initialView = "overview", exercises, sessions, measurements, onSaveMeasurement, onDeleteMeasurement, onOpen }: { initialView?: View; exercises: Exercise[]; sessions: WorkoutSession[]; measurements: BodyMeasurement[]; onSaveMeasurement: (measurement: BodyMeasurement) => void; onDeleteMeasurement: (id: string) => void; onOpen: (exercise: Exercise) => void }) {
  const [view, setView] = useState<View>(initialView);
  const [selectedRoutineTrend, setSelectedRoutineTrend] = useState<string | null>(null);
  const [today] = useState(() => new Date());
  const summary = useMemo(() => trainingSummary(sessions, today), [sessions, today]);
  const weekly = useMemo(() => weeklyVolumeSeries(sessions, today), [sessions, today]);
  const daily = useMemo(() => dailyVolumeSeries(sessions, today), [sessions, today]);
  const recentSessions = useMemo(() => sessions
    .filter((session) => session.status === "completed")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 7), [sessions]);
  const bySession = useMemo(() => sessionVolumeSeries(recentSessions, 7), [recentSessions]);
  const selectedSessionTrend = useMemo(() => selectedRoutineTrend
    ? sessionVolumeSeries(sessions.filter((session) => session.routineNameSnapshot === selectedRoutineTrend), 20)
    : bySession, [sessions, bySession, selectedRoutineTrend]);
  const muscleSets = useMemo(() => weeklyMuscleSets(sessions, exercises, today), [sessions, exercises, today]);
  const logged = useMemo(() => exercises.map((exercise) => ({ exercise, logs: sessions.flatMap((session) => session.exerciseLogs).filter((log) => log.exerciseId === exercise.id) })).filter((item) => item.logs.length), [exercises, sessions]);

  return <>
    <div className="segmented four" aria-label="Progress sections">
      {(["overview", "exercises", "calendar", "measurements"] as const).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item === "overview" ? "Overview" : item === "exercises" ? "Exercises" : item === "calendar" ? "Calendar" : "Body"}</button>)}
    </div>

    {view === "overview" && (!sessions.length ? <div className="empty"><BarChart3 size={30} /><h3>Progress starts after session one</h3><p>Complete a workout to unlock comparisons, charts and your training calendar.</p></div> : <div className="analytics-stack">
      <section className="insight-hero">
        <div><span>TRAINING DAYS</span><strong>{summary.trainingDays}</strong><p>{summary.last30Days} active days in the last 30</p></div>
        <div className="streak-badge"><Flame size={19} /><strong>{summary.currentStreak}</strong><span>day streak</span></div>
      </section>
      <div className="metric-grid">
        <div><span>Workouts</span><strong>{summary.totalWorkouts}</strong><small>all time</small></div>
        <div><span>Total volume</span><strong>{compact(summary.totalVolume)}</strong><small>kilograms</small></div>
        <div><span>30-day pace</span><strong>{summary.last30Days}</strong><small>training days</small></div>
      </div>
      <section className="chart-card">
        <div className="chart-title"><div><span className="eyebrow">LAST 8 WEEKS</span><h2>Weekly volume</h2></div><TrendingUp size={22} /></div>
        <div className="chart-wrap" aria-label="Weekly workout volume chart">
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={weekly} margin={{ top: 10, right: 2, left: -18, bottom: 0 }}><defs><linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chart.accent} stopOpacity={0.38}/><stop offset="100%" stopColor={chart.accent} stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke={chart.grid} vertical={false}/><XAxis dataKey="label" tick={{ fill: chart.muted, fontSize: 9 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: chart.muted, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={compact}/><Tooltip contentStyle={{ background: chart.tooltip, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8, fontSize: 11 }} formatter={(value) => [`${Number(value).toLocaleString()} kg`, "Volume"]}/><Area type="monotone" dataKey="volume" stroke={chart.accent} strokeWidth={2.5} fill="url(#volumeFill)"/></AreaChart></ResponsiveContainer>
        </div>
      </section>
      <section className="chart-card">
        <div className="chart-title"><div><span className="eyebrow">LAST 14 DAYS</span><h2>Daily volume</h2></div><CalendarDays size={22} /></div>
        <div className="chart-wrap" aria-label="Daily workout volume chart">
          <ResponsiveContainer width="100%" height="100%"><LineChart data={daily} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke={chart.grid} vertical={false}/><XAxis dataKey="label" interval={2} tick={{ fill: chart.muted, fontSize: 9 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: chart.muted, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={compact}/><Tooltip contentStyle={{ background: chart.tooltip, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8, fontSize: 11 }} formatter={(value) => [`${Number(value).toLocaleString()} kg`, "Volume"]}/><Line type="monotone" dataKey="volume" stroke={chart.accent} strokeWidth={2.5} dot={{ r: 2.5, fill: chart.accent, strokeWidth: 0 }} activeDot={{ r: 5 }}/></LineChart></ResponsiveContainer>
        </div>
      </section>
      <section className="muscle-sets-card">
        <div className="chart-title"><div><span className="eyebrow">THIS WEEK</span><h2>Working sets by muscle</h2></div><Dumbbell size={22} /></div>
        {muscleSets.length ? <div className="muscle-bars">{muscleSets.slice(0, 8).map((item) => <div key={item.muscle}><span>{item.muscle}</span><div><i style={{ width: `${Math.max(8, (item.sets / muscleSets[0].sets) * 100)}%` }} /></div><strong>{item.sets}</strong></div>)}</div> : <p className="muscle-empty">Complete a working set this week to see your training balance.</p>}
      </section>
      <section className="recent-insights"><div className="section-head compact"><div><span className="eyebrow">{selectedRoutineTrend ? `${selectedSessionTrend.length} COMPLETIONS` : `LAST ${bySession.length} WORKOUTS`}</span><h2>{selectedRoutineTrend ? `${selectedRoutineTrend} volume trend` : "Volume by session"}</h2></div>{selectedRoutineTrend && <button className="trend-reset" onClick={() => setSelectedRoutineTrend(null)}>All sessions</button>}</div>{selectedSessionTrend.length >= 2 || !selectedRoutineTrend ? <div className="session-chart-wrap" aria-label={selectedRoutineTrend ? `${selectedRoutineTrend} volume trend` : "Workout volume by session trend"}><ResponsiveContainer width="100%" height="100%"><LineChart data={selectedSessionTrend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke={chart.grid} vertical={false}/><XAxis dataKey="label" tick={{ fill: chart.muted, fontSize: 9 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: chart.muted, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={compact}/><Tooltip contentStyle={{ background: chart.tooltip, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8, fontSize: 11 }} formatter={(value) => [`${Number(value).toLocaleString()} kg`, "Volume"]} labelFormatter={(_, payload) => payload[0]?.payload?.routine ?? "Workout"}/><Line type="monotone" dataKey="volume" stroke={chart.accent} strokeWidth={2.5} dot={{ r: 3, fill: chart.accent, strokeWidth: 0 }} activeDot={{ r: 5 }}/></LineChart></ResponsiveContainer></div> : <p className="session-trend-empty">Complete this routine once more to unlock its trend.</p>}{recentSessions.map((session) => { const stats = sessionStats(session); return <button className={`insight-row ${selectedRoutineTrend === session.routineNameSnapshot ? "selected" : ""}`} key={session.id} onClick={() => setSelectedRoutineTrend(session.routineNameSnapshot)} aria-label={`Show ${session.routineNameSnapshot} volume trend`}><div><strong>{session.routineNameSnapshot}</strong><span>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(session.startedAt))}</span></div><div><strong>{compact(stats.volume)} kg</strong><span>Tap for routine trend · {stats.sets} sets</span></div></button>; })}</section>
    </div>)}

    {view === "exercises" && <div className="progress-grid">{logged.map(({ exercise, logs }) => { const progress = exerciseProgress(logs); const series = exerciseTrendSeries(sessions, exercise.id); const first = series[0]; const latest = series.at(-1); const e1rmChange = first && latest ? latest.bestE1RM - first.bestE1RM : 0; const isDistance = exercise.measurementType.includes("distance"); const isTime = exercise.measurementType === "time"; const isRepsOnly = exercise.measurementType === "reps_only" || exercise.measurementType === "bodyweight_reps"; const bestSpecific = isDistance ? Math.max(0, ...series.map((point) => point.bestDistance)) : isTime ? Math.max(0, ...series.map((point) => point.bestDuration)) : isRepsOnly ? Math.max(0, ...series.map((point) => point.bestReps)) : progress.bestWeight; const specificLabel = isDistance ? "best m" : isTime ? "best sec" : isRepsOnly ? "best reps" : "best kg"; return <button className="progress-card phase-two" key={exercise.id} onClick={() => onOpen(exercise)}><div><span className="eyebrow">{exercise.primaryMuscles[0] ?? exercise.category}</span><h3>{exercise.name}</h3><small className={e1rmChange > 0 ? "positive" : ""}>{e1rmChange > 0 ? `+${e1rmChange.toFixed(1)} kg estimated strength` : `${series.length} logged sessions`}</small></div><div className="progress-values"><span><strong>{bestSpecific || "—"}</strong> {specificLabel}</span>{!isDistance && !isTime && !isRepsOnly && <span><strong>{progress.bestE1RM || "—"}</strong> e1RM</span>}</div><ChevronRight size={19}/></button>; })}</div>}

    {view === "calendar" && <TrainingCalendar sessions={sessions} initialDate={today} />}
    {view === "measurements" && <BodyMeasurements measurements={measurements} onSave={onSaveMeasurement} onDelete={onDeleteMeasurement} />}
  </>;
}

function BodyMeasurements({ measurements, onSave, onDelete }: { measurements: BodyMeasurement[]; onSave: (measurement: BodyMeasurement) => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [selectedMeasurement, setSelectedMeasurement] = useState<BodyMeasurement | null>(null);
  const [measuredAt, setMeasuredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [bodyWeightKg, setBodyWeightKg] = useState("");
  const [bodyFatPercentage, setBodyFatPercentage] = useState("");
  const [muscleMassKg, setMuscleMassKg] = useState("");
  const [waistCm, setWaistCm] = useState("");
  const [chestCm, setChestCm] = useState("");
  const [armCm, setArmCm] = useState("");
  const [thighCm, setThighCm] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [saving, setSaving] = useState(false);
  const [chartMetric, setChartMetric] = useState<"bodyWeightKg" | "bodyFatPercentage" | "muscleMassKg">("bodyWeightKg");
  const reminder = measurementReminder(measurements);
  const metricOptions = [
    { key: "bodyWeightKg" as const, label: "Weight", title: "Body-weight trend", unit: "kg" },
    { key: "bodyFatPercentage" as const, label: "Body fat", title: "Body-fat trend", unit: "%" },
    { key: "muscleMassKg" as const, label: "Muscle", title: "Muscle-mass trend", unit: "kg" },
  ];
  const selectedMetric = metricOptions.find((option) => option.key === chartMetric)!;
  const chartData = [...measurements].reverse().filter((item) => item[chartMetric] !== undefined).map((item) => ({ label: new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(item.measuredAt)), value: item[chartMetric] }));
  const numberValue = (value: string) => value ? Number(value) : undefined;
  const reset = () => { setEditing(false); setBodyWeightKg(""); setBodyFatPercentage(""); setMuscleMassKg(""); setWaistCm(""); setChestCm(""); setArmCm(""); setThighCm(""); setNotes(""); setPhoto(null); setPhotoError(""); };
  const canSave = [bodyWeightKg, bodyFatPercentage, muscleMassKg, waistCm, chestCm, armCm, thighCm].some(Boolean);
  const saveMeasurement = async () => {
    setSaving(true); setPhotoError("");
    try {
      let photoId: string | undefined;
      let photoContentType: string | undefined;
      if (photo) {
        photoId = uid();
        photoContentType = await uploadProgressPhoto(photo, photoId);
      }
      onSave({ id: uid(), measuredAt: new Date(`${measuredAt}T12:00:00`).toISOString(), photoId, photoContentType, bodyWeightKg: numberValue(bodyWeightKg), bodyFatPercentage: numberValue(bodyFatPercentage), muscleMassKg: numberValue(muscleMassKg), waistCm: numberValue(waistCm), chestCm: numberValue(chestCm), armCm: numberValue(armCm), thighCm: numberValue(thighCm), notes });
      reset();
    } catch (error) { setPhotoError(error instanceof Error ? error.message : "Measurement could not be saved."); }
    finally { setSaving(false); }
  };
  return <div className="measurement-stack">
    <section className="measurement-hero"><div><span className="eyebrow">EVERY 3 WEEKS</span><h2>{reminder.due ? "Measurement check-in due" : `Next check-in in ${reminder.daysRemaining} days`}</h2><p>Track body fat, total muscle mass, weight or circumferences. Everything is included in your encrypted backup.</p></div><button className="btn primary" onClick={() => setEditing((value) => !value)}><Plus size={16} /> Add</button></section>
    {editing && <section className="measurement-form"><label>Date<input type="date" value={measuredAt} onChange={(event) => setMeasuredAt(event.target.value)} /></label><div className="measurement-fields"><label>Body weight (kg)<input inputMode="decimal" type="number" step="0.1" value={bodyWeightKg} onChange={(event) => setBodyWeightKg(event.target.value)} /></label><label>Body fat (%)<input inputMode="decimal" type="number" min="0" max="100" step="0.1" value={bodyFatPercentage} onChange={(event) => setBodyFatPercentage(event.target.value)} /></label><label>Total muscle mass (kg)<input inputMode="decimal" type="number" min="0" step="0.1" value={muscleMassKg} onChange={(event) => setMuscleMassKg(event.target.value)} /></label><label>Waist (cm)<input inputMode="decimal" type="number" step="0.1" value={waistCm} onChange={(event) => setWaistCm(event.target.value)} /></label><label>Chest (cm)<input inputMode="decimal" type="number" step="0.1" value={chestCm} onChange={(event) => setChestCm(event.target.value)} /></label><label>Arm (cm)<input inputMode="decimal" type="number" step="0.1" value={armCm} onChange={(event) => setArmCm(event.target.value)} /></label><label>Thigh (cm)<input inputMode="decimal" type="number" step="0.1" value={thighCm} onChange={(event) => setThighCm(event.target.value)} /></label></div><label>Progress photo (optional)<span className="photo-picker"><ImagePlus size={18}/><span>{photo ? photo.name : "Choose from camera or photo library"}</span><input type="file" accept="image/*" onChange={(event) => { setPhoto(event.target.files?.[0] ?? null); setPhotoError(""); }} /></span></label><label>Notes<textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{photoError && <p className="photo-error">{photoError}</p>}<div className="measurement-actions"><button className="btn ghost" disabled={saving} onClick={reset}>Cancel</button><button className="btn primary" disabled={!canSave || saving} onClick={saveMeasurement}><Save size={16} /> {saving ? "Saving…" : "Save"}</button></div></section>}
    <section className="chart-card"><div className="chart-title"><div><span className="eyebrow">BODY COMPOSITION</span><h2>{selectedMetric.title}</h2></div><TrendingUp size={22} /></div><div className="mini-tabs">{metricOptions.map((option) => <button key={option.key} className={chartMetric === option.key ? "active" : ""} onClick={() => setChartMetric(option.key)}>{option.label}</button>)}</div>{chartData.length >= 2 ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 10, right: 14, left: -16, bottom: 0 }}><CartesianGrid stroke={chart.grid} vertical={false}/><XAxis dataKey="label" tick={{ fill: chart.muted, fontSize: 9 }} axisLine={false} tickLine={false}/><YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fill: chart.muted, fontSize: 9 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: chart.tooltip, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8, fontSize: 11 }} formatter={(value) => [`${value} ${selectedMetric.unit}`, selectedMetric.label]}/><Line type="monotone" dataKey="value" name={selectedMetric.label} stroke={chart.accent} strokeWidth={2.5} dot={{ r: 3, fill: chart.accent, strokeWidth: 0 }}/></LineChart></ResponsiveContainer></div> : <p className="muscle-empty">Add this measurement twice to unlock its trend graph.</p>}</section>
    <section className="measurement-list">{measurements.length ? measurements.map((item) => <div className="measurement-row interactive" role="button" tabIndex={0} key={item.id} onClick={() => setSelectedMeasurement(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedMeasurement(item); } }}>{item.photoId && <img className="measurement-photo" src={`/api/photos?id=${encodeURIComponent(item.photoId)}`} alt={`Progress from ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.measuredAt))}`} loading="lazy" />}<div><strong>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.measuredAt))}</strong><span>{[item.bodyWeightKg && `${item.bodyWeightKg} kg`, item.bodyFatPercentage !== undefined && `Body fat ${item.bodyFatPercentage}%`, item.muscleMassKg && `Muscle ${item.muscleMassKg} kg`, item.waistCm && `Waist ${item.waistCm}`, item.chestCm && `Chest ${item.chestCm}`, item.armCm && `Arm ${item.armCm}`, item.thighCm && `Thigh ${item.thighCm}`].filter(Boolean).join(" · ")}</span>{item.notes && <small>{item.notes}</small>}</div><ChevronRight size={19}/></div>) : <div className="empty compact"><Dumbbell size={25}/><h3>No measurements yet</h3><p>Add a baseline now; IronLog will remind you again in three weeks.</p></div>}</section>
    {selectedMeasurement && <MeasurementDetail measurement={selectedMeasurement} onClose={() => setSelectedMeasurement(null)} onSave={(updated) => { onSave(updated); setSelectedMeasurement(null); }} onDelete={(id) => { onDelete(id); setSelectedMeasurement(null); }} />}
  </div>;
}

function MeasurementDetail({ measurement, onClose, onSave, onDelete }: { measurement: BodyMeasurement; onClose: () => void; onSave: (measurement: BodyMeasurement) => void; onDelete: (id: string) => void }) {
  const [draft, setDraft] = useState<BodyMeasurement>(() => structuredClone(measurement));
  const [replacementPhoto, setReplacementPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const photoUrl = measurement.photoId ? `/api/photos?id=${encodeURIComponent(measurement.photoId)}` : "";
  const setNumber = (key: "bodyWeightKg" | "bodyFatPercentage" | "muscleMassKg" | "waistCm" | "chestCm" | "armCm" | "thighCm", value: string) => setDraft({ ...draft, [key]: value === "" ? undefined : Number(value) });
  const save = async () => {
    setSaving(true); setError("");
    try {
      let photoId = measurement.photoId;
      let photoContentType = measurement.photoContentType;
      if (replacementPhoto) {
        photoId = photoId ?? uid();
        photoContentType = await uploadProgressPhoto(replacementPhoto, photoId);
      } else if (removePhoto && photoId) {
        const deleted = await fetch(`/api/photos?id=${encodeURIComponent(photoId)}`, { method: "DELETE" });
        const result = await deleted.json() as { error?: string };
        if (!deleted.ok) throw new Error(result.error ?? "Photo could not be removed.");
        photoId = undefined; photoContentType = undefined;
      }
      onSave({ ...draft, photoId, photoContentType });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Measurement could not be saved."); }
    finally { setSaving(false); }
  };
  const removeEntry = async () => {
    if (!window.confirm("Delete this measurement and its progress photo? This cannot be undone.")) return;
    setSaving(true); setError("");
    try {
      if (measurement.photoId) {
        const deleted = await fetch(`/api/photos?id=${encodeURIComponent(measurement.photoId)}`, { method: "DELETE" });
        const result = await deleted.json() as { error?: string };
        if (!deleted.ok) throw new Error(result.error ?? "Photo could not be deleted.");
      }
      onDelete(measurement.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Measurement could not be deleted."); setSaving(false); }
  };
  return <div className="measurement-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="measurement-detail" role="dialog" aria-modal="true" aria-label="Body measurement details">
      <header><div><span className="eyebrow">BODY CHECK-IN</span><h2>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(new Date(draft.measuredAt))}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close measurement"><X size={18}/></button></header>
      {photoUrl && !removePhoto && <button className="measurement-detail-photo" onClick={() => setPhotoOpen(true)} aria-label="Open progress photo full screen"><img src={photoUrl} alt="Progress photo"/><span>Tap to view full screen</span></button>}
      <div className="measurement-detail-fields"><label>Date<input type="date" value={draft.measuredAt.slice(0, 10)} onChange={(event) => setDraft({ ...draft, measuredAt: new Date(`${event.target.value}T12:00:00`).toISOString() })}/></label><label>Body weight (kg)<input inputMode="decimal" type="number" step="0.1" value={draft.bodyWeightKg ?? ""} onChange={(event) => setNumber("bodyWeightKg", event.target.value)}/></label><label>Body fat (%)<input inputMode="decimal" type="number" min="0" max="100" step="0.1" value={draft.bodyFatPercentage ?? ""} onChange={(event) => setNumber("bodyFatPercentage", event.target.value)}/></label><label>Muscle mass (kg)<input inputMode="decimal" type="number" min="0" step="0.1" value={draft.muscleMassKg ?? ""} onChange={(event) => setNumber("muscleMassKg", event.target.value)}/></label><label>Waist (cm)<input inputMode="decimal" type="number" step="0.1" value={draft.waistCm ?? ""} onChange={(event) => setNumber("waistCm", event.target.value)}/></label><label>Chest (cm)<input inputMode="decimal" type="number" step="0.1" value={draft.chestCm ?? ""} onChange={(event) => setNumber("chestCm", event.target.value)}/></label><label>Arm (cm)<input inputMode="decimal" type="number" step="0.1" value={draft.armCm ?? ""} onChange={(event) => setNumber("armCm", event.target.value)}/></label><label>Thigh (cm)<input inputMode="decimal" type="number" step="0.1" value={draft.thighCm ?? ""} onChange={(event) => setNumber("thighCm", event.target.value)}/></label></div>
      <label className="measurement-detail-notes">Notes<textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })}/></label>
      <div className="measurement-photo-actions"><label className="photo-picker"><ImagePlus size={18}/><span>{replacementPhoto ? replacementPhoto.name : measurement.photoId ? "Replace progress photo" : "Add progress photo"}</span><input type="file" accept="image/*" onChange={(event) => { setReplacementPhoto(event.target.files?.[0] ?? null); setRemovePhoto(false); setError(""); }}/></label>{measurement.photoId && !replacementPhoto && <button className="btn ghost danger-text" onClick={() => setRemovePhoto((value) => !value)}>{removePhoto ? "Keep photo" : "Remove photo"}</button>}</div>
      {removePhoto && <p className="measurement-remove-note">The photo will be removed when you save.</p>}{error && <p className="photo-error">{error}</p>}
      <footer><button className="btn ghost danger-text" disabled={saving} onClick={() => void removeEntry()}><Trash2 size={16}/> Delete entry</button><div className="spacer"/><button className="btn ghost" disabled={saving} onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving} onClick={() => void save()}><Save size={16}/> {saving ? "Saving…" : "Save changes"}</button></footer>
    </section>
    {photoOpen && photoUrl && <div className="measurement-lightbox" role="dialog" aria-modal="true" aria-label="Progress photo"><button onClick={() => setPhotoOpen(false)} aria-label="Close full-screen photo"><X size={24}/></button><img src={photoUrl} alt="Full-screen progress photo" onClick={() => setPhotoOpen(false)}/></div>}
  </div>;
}

function TrainingCalendar({ sessions, initialDate }: { sessions: WorkoutSession[]; initialDate: Date }) {
  const [month, setMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const [selected, setSelected] = useState(() => localDayKey(initialDate));
  const sessionsByDay = useMemo(() => {
    const map = new Map<string, WorkoutSession[]>();
    sessions.forEach((session) => { const key = localDayKey(session.completedAt ?? session.startedAt); map.set(key, [...(map.get(key) ?? []), session]); });
    return map;
  }, [sessions]);
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - mondayOffset + 1));
  }, [month]);
  const selectedSessions = sessionsByDay.get(selected) ?? [];

  return <div className="calendar-stack">
    <section className="calendar-card">
      <div className="calendar-head"><button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={19}/></button><div><CalendarDays size={17}/><strong>{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month)}</strong></div><button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={19}/></button></div>
      <div className="weekday-row">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="calendar-grid">{cells.map((date) => { const key = localDayKey(date); const trained = sessionsByDay.has(key); const inMonth = date.getMonth() === month.getMonth(); return <button key={key} className={`${inMonth ? "" : "outside"} ${trained ? "trained" : ""} ${selected === key ? "selected" : ""}`} onClick={() => setSelected(key)}><span>{date.getDate()}</span>{trained && <Star size={11} fill="currentColor"/>}</button>; })}</div>
      <div className="calendar-legend"><Star size={12} fill="currentColor"/><span>Workout completed</span></div>
    </section>
    <section className="selected-day"><span className="eyebrow">{new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${selected}T12:00:00`))}</span>{selectedSessions.length ? selectedSessions.map((session) => { const stats = sessionStats(session); return <div className="day-workout" key={session.id}><div><strong>{session.routineNameSnapshot}</strong><span>{stats.sets} sets · {stats.reps} reps</span></div><strong>{compact(stats.volume)} kg</strong></div>; }) : <p>No workout logged on this day.</p>}</section>
  </div>;
}

export function ExerciseTrendChart({ sessions, exerciseId, measurementType }: { sessions: WorkoutSession[]; exerciseId: string; measurementType: MeasurementType }) {
  const metricOptions = measurementType.includes("distance")
    ? [{ key: "bestDistance", label: "Best distance" }, { key: "bestDuration", label: "Time" }]
    : measurementType === "time"
      ? [{ key: "bestDuration", label: "Best duration" }]
      : measurementType === "reps_only" || measurementType === "bodyweight_reps"
        ? [{ key: "bestReps", label: "Best reps" }, { key: "reps", label: "Total reps" }]
        : [{ key: "bestE1RM", label: "Estimated 1RM" }, { key: "volume", label: "Exercise volume" }, { key: "bestWeight", label: "Best weight" }];
  const [metric, setMetric] = useState(() => metricOptions[0].key);
  const series = useMemo(() => exerciseTrendSeries(sessions, exerciseId), [sessions, exerciseId]);
  if (series.length < 2) return <div className="chart-empty"><TrendingUp size={22}/><span>Complete this exercise again to unlock its trend graph.</span></div>;
  return <section className="exercise-chart"><div className="mini-tabs">{metricOptions.map((option) => <button key={option.key} className={metric === option.key ? "active" : ""} onClick={() => setMetric(option.key)}>{option.label}</button>)}</div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={series} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke={chart.grid} vertical={false}/><XAxis dataKey="label" tick={{ fill: chart.muted, fontSize: 9 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: chart.muted, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={compact}/><Tooltip contentStyle={{ background: chart.tooltip, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8, fontSize: 11 }}/><Line type="monotone" dataKey={metric} stroke={chart.accent} strokeWidth={2.5} dot={{ r: 3, fill: chart.accent, strokeWidth: 0 }} activeDot={{ r: 5 }}/></LineChart></ResponsiveContainer></div></section>;
}
