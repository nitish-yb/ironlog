import { db, exportBackup, importBackup } from "./db";
import { validateBackup } from "./domain";
import type { Backup } from "./types";

const LAST_SYNC_AT = "cloud-last-sync-at";
const LAST_SYNC_REVISION = "cloud-last-sync-revision";
const LAST_LOCAL_CHANGE_AT = "cloud-last-local-change-at";
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

type RemoteSnapshot = {
  backup: Backup | null;
  revision: number;
  updatedAt: string | null;
};

export type CloudSyncResult = {
  action: "uploaded" | "restored" | "merged" | "current";
  revision: number;
  syncedAt: string;
};

export async function markLocalDataChanged() {
  const changedAt = new Date().toISOString();
  await db.meta.put({ key: LAST_LOCAL_CHANGE_AT, value: changedAt });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("ironlog:data-changed"));
}

export async function cloudSyncIsDue() {
  const [lastSync, lastChange] = await Promise.all([
    db.meta.get(LAST_SYNC_AT),
    db.meta.get(LAST_LOCAL_CHANGE_AT),
  ]);
  if (!lastSync) return true;
  if (lastChange && lastChange.value > lastSync.value) return true;
  return Date.now() - new Date(lastSync.value).getTime() >= THREE_HOURS_MS;
}

async function readRemote(): Promise<RemoteSnapshot> {
  const response = await fetch("/api/sync", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const body = await response.json() as RemoteSnapshot & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Cloud sync is unavailable.");
  return {
    backup: body.backup ? validateBackup(body.backup) : null,
    revision: body.revision,
    updatedAt: body.updatedAt,
  };
}

async function upload(backup: Backup, expectedRevision: number) {
  const response = await fetch("/api/sync", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      backup,
      expectedRevision,
      clientUpdatedAt: new Date().toISOString(),
    }),
  });
  const body = await response.json() as { revision?: number; updatedAt?: string; error?: string };
  if (response.status === 409) throw new Error("revision_conflict");
  if (!response.ok || body.revision === undefined) {
    throw new Error(body.error ?? "Cloud backup could not be saved.");
  }
  return { revision: body.revision, updatedAt: body.updatedAt ?? new Date().toISOString() };
}

async function writeSyncMetadata(revision: number, syncedAt: string, clearLocalChange = true) {
  await db.transaction("rw", db.meta, async () => {
    await db.meta.put({ key: LAST_SYNC_REVISION, value: String(revision) });
    await db.meta.put({ key: LAST_SYNC_AT, value: syncedAt });
    if (clearLocalChange) await db.meta.delete(LAST_LOCAL_CHANGE_AT);
  });
}

function unionById<T extends { id: string }>(local: T[], remote: T[]) {
  const merged = new Map(remote.map((item) => [item.id, item]));
  for (const item of local) merged.set(item.id, item);
  return [...merged.values()];
}

export function mergeBackups(local: Backup, remote: Backup): Backup {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    exercises: unionById(local.exercises, remote.exercises),
    routines: unionById(local.routines, remote.routines),
    sessions: unionById(local.sessions, remote.sessions),
    measurements: unionById(local.measurements ?? [], remote.measurements ?? []),
    routineVersions: unionById(local.routineVersions ?? [], remote.routineVersions ?? []),
    preferences: local.preferences ?? remote.preferences,
  };
}

function hasPersonalData(backup: Backup) {
  return backup.sessions.length > 0 || (backup.measurements?.length ?? 0) > 0;
}

let inFlight: Promise<CloudSyncResult> | null = null;

export function syncCloudBackup(): Promise<CloudSyncResult> {
  if (inFlight) return inFlight;
  inFlight = performSync().finally(() => { inFlight = null; });
  return inFlight;
}

async function performSync(): Promise<CloudSyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("You are offline. Sync will retry when connected.");

  let remote = await readRemote();
  const [local, revisionMeta, lastSyncMeta, lastChangeMeta] = await Promise.all([
    exportBackup(),
    db.meta.get(LAST_SYNC_REVISION),
    db.meta.get(LAST_SYNC_AT),
    db.meta.get(LAST_LOCAL_CHANGE_AT),
  ]);
  const localRevision = Number(revisionMeta?.value ?? 0);
  const localIsDirty = Boolean(lastChangeMeta && (!lastSyncMeta || lastChangeMeta.value > lastSyncMeta.value));

  if (!remote.backup) {
    const saved = await upload(local, 0);
    await writeSyncMetadata(saved.revision, saved.updatedAt);
    return { action: "uploaded", revision: saved.revision, syncedAt: saved.updatedAt };
  }

  if (localRevision === 0 && !hasPersonalData(local)) {
    const migrated = await importBackup(remote.backup);
    if (migrated) {
      const saved = await upload(await exportBackup(), remote.revision);
      await writeSyncMetadata(saved.revision, saved.updatedAt);
      return { action: "merged", revision: saved.revision, syncedAt: saved.updatedAt };
    }
    const syncedAt = remote.updatedAt ?? new Date().toISOString();
    await writeSyncMetadata(remote.revision, syncedAt);
    return { action: "restored", revision: remote.revision, syncedAt };
  }

  if (remote.revision > localRevision && !localIsDirty) {
    const migrated = await importBackup(remote.backup);
    if (migrated) {
      const saved = await upload(await exportBackup(), remote.revision);
      await writeSyncMetadata(saved.revision, saved.updatedAt);
      return { action: "merged", revision: saved.revision, syncedAt: saved.updatedAt };
    }
    const syncedAt = remote.updatedAt ?? new Date().toISOString();
    await writeSyncMetadata(remote.revision, syncedAt);
    return { action: "restored", revision: remote.revision, syncedAt };
  }

  if (localIsDirty || remote.revision > localRevision || localRevision === 0) {
    const merged = remote.revision > localRevision ? mergeBackups(local, remote.backup) : local;
    if (merged !== local) await importBackup(merged);
    try {
      const saved = await upload(merged, remote.revision);
      await writeSyncMetadata(saved.revision, saved.updatedAt);
      return { action: merged === local ? "uploaded" : "merged", revision: saved.revision, syncedAt: saved.updatedAt };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "revision_conflict") throw error;
      remote = await readRemote();
      if (!remote.backup) throw new Error("Cloud sync conflict could not be resolved.");
      const retryBackup = mergeBackups(merged, remote.backup);
      await importBackup(retryBackup);
      const saved = await upload(retryBackup, remote.revision);
      await writeSyncMetadata(saved.revision, saved.updatedAt);
      return { action: "merged", revision: saved.revision, syncedAt: saved.updatedAt };
    }
  }

  const syncedAt = remote.updatedAt ?? lastSyncMeta?.value ?? new Date().toISOString();
  await writeSyncMetadata(remote.revision, syncedAt, false);
  return { action: "current", revision: remote.revision, syncedAt };
}
