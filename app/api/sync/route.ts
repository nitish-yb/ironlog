import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { getDb } from "../../../db";
import { cloudBackups } from "../../../db/schema";
import { BackupSchema } from "../../lib/types";

export const dynamic = "force-dynamic";

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const USER_EMAIL_HEADER = "oai-authenticated-user-email";

const SyncRequestSchema = z.object({
  backup: BackupSchema,
  expectedRevision: z.number().int().nonnegative(),
  clientUpdatedAt: z.string().min(1),
});

type RuntimeEnv = {
  IRONLOG_SYNC_KEY?: string;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function authenticatedEmail(request: Request) {
  return request.headers.get(USER_EMAIL_HEADER)?.trim().toLowerCase() ?? null;
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const encoded = (env as unknown as RuntimeEnv).IRONLOG_SYNC_KEY;
  if (!encoded) throw new Error("Cloud sync encryption is unavailable.");
  const raw = base64ToBytes(encoded);
  if (raw.byteLength !== 32) throw new Error("Cloud sync encryption is misconfigured.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(plaintext: string) {
  const initializationVector = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: initializationVector },
    await encryptionKey(),
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    initializationVector: bytesToBase64(initializationVector),
  };
}

async function decrypt(ciphertext: string, initializationVector: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(initializationVector) },
    await encryptionKey(),
    base64ToBytes(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

async function userKey(email: string) {
  return sha256(`ironlog-user:${email}`);
}

export async function GET(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return json({ error: "Sign in is required." }, 401);

  try {
    const [row] = await getDb()
      .select()
      .from(cloudBackups)
      .where(eq(cloudBackups.userId, await userKey(email)))
      .limit(1);

    if (!row) return json({ backup: null, revision: 0, updatedAt: null });

    const plaintext = await decrypt(row.ciphertext, row.initializationVector);
    if (await sha256(plaintext) !== row.checksum) {
      return json({ error: "The cloud backup failed its integrity check." }, 500);
    }

    const backup = BackupSchema.parse(JSON.parse(plaintext));
    return json({ backup, revision: row.revision, updatedAt: row.updatedAt });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Cloud backup could not be read." },
      500,
    );
  }
}

export async function POST(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return json({ error: "Sign in is required." }, 401);
  if (!isSameOrigin(request)) return json({ error: "Cross-origin sync is not allowed." }, 403);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BACKUP_BYTES) return json({ error: "Backup is too large." }, 413);

  try {
    const parsed = SyncRequestSchema.parse(await request.json());
    const plaintext = JSON.stringify(parsed.backup);
    if (new TextEncoder().encode(plaintext).byteLength > MAX_BACKUP_BYTES) {
      return json({ error: "Backup is too large." }, 413);
    }

    const id = await userKey(email);
    const database = getDb();
    const [existing] = await database
      .select({ revision: cloudBackups.revision })
      .from(cloudBackups)
      .where(eq(cloudBackups.userId, id))
      .limit(1);

    const currentRevision = existing?.revision ?? 0;
    if (parsed.expectedRevision !== currentRevision) {
      return json({ error: "revision_conflict", revision: currentRevision }, 409);
    }

    const encrypted = await encrypt(plaintext);
    const now = new Date().toISOString();
    const nextRevision = currentRevision + 1;

    if (!existing) {
      const inserted = await database
        .insert(cloudBackups)
        .values({
          userId: id,
          ...encrypted,
          checksum: await sha256(plaintext),
          schemaVersion: parsed.backup.schemaVersion,
          revision: nextRevision,
          clientUpdatedAt: parsed.clientUpdatedAt,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ revision: cloudBackups.revision, updatedAt: cloudBackups.updatedAt });
      if (!inserted.length) return json({ error: "revision_conflict", revision: 1 }, 409);
      return json(inserted[0]);
    }

    const updated = await database
      .update(cloudBackups)
      .set({
        ...encrypted,
        checksum: await sha256(plaintext),
        schemaVersion: parsed.backup.schemaVersion,
        revision: nextRevision,
        clientUpdatedAt: parsed.clientUpdatedAt,
        updatedAt: now,
      })
      .where(and(eq(cloudBackups.userId, id), eq(cloudBackups.revision, currentRevision)))
      .returning({ revision: cloudBackups.revision, updatedAt: cloudBackups.updatedAt });

    if (!updated.length) return json({ error: "revision_conflict", revision: currentRevision }, 409);
    return json(updated[0]);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Backup validation failed." }, 400);
    return json(
      { error: error instanceof Error ? error.message : "Cloud backup could not be saved." },
      500,
    );
  }
}
