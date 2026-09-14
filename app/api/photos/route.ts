import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

type PhotoBucket = {
  put: (key: string, value: ArrayBuffer, options?: { customMetadata?: Record<string, string> }) => Promise<unknown>;
  get: (key: string) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer>; customMetadata?: Record<string, string> } | null>;
  delete: (key: string) => Promise<void>;
};

type RuntimeEnv = { IRONLOG_SYNC_KEY?: string; PHOTOS?: PhotoBucket };

function response(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
}

function authenticatedEmail(request: Request) {
  return request.headers.get(USER_EMAIL_HEADER)?.trim().toLowerCase() ?? null;
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function validPhotoId(value: string | null): value is string {
  return Boolean(value && /^[a-zA-Z0-9-]{1,100}$/.test(value));
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

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function encryptionKey() {
  const encoded = (env as unknown as RuntimeEnv).IRONLOG_SYNC_KEY;
  if (!encoded) throw new Error("Photo encryption is unavailable.");
  const raw = base64ToBytes(encoded);
  if (raw.byteLength !== 32) throw new Error("Photo encryption is misconfigured.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function objectKey(email: string, photoId: string) {
  return `${await sha256(`ironlog-user:${email}`)}/${photoId}`;
}

function bucket() {
  const value = (env as unknown as RuntimeEnv).PHOTOS;
  if (!value) throw new Error("Photo storage is unavailable.");
  return value;
}

export async function POST(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return response({ error: "Sign in is required." }, 401);
  if (!isSameOrigin(request)) return response({ error: "Cross-origin uploads are not allowed." }, 403);
  try {
    const form = await request.formData();
    const photo = form.get("photo");
    const photoId = form.get("photoId");
    if (!(photo instanceof File) || typeof photoId !== "string" || !validPhotoId(photoId)) return response({ error: "Invalid photo upload." }, 400);
    if (!photo.type.startsWith("image/")) return response({ error: "Choose an image file." }, 415);
    if (photo.size > MAX_PHOTO_BYTES) return response({ error: "Photo must be smaller than 8 MB." }, 413);
    const initializationVector = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: initializationVector }, await encryptionKey(), await photo.arrayBuffer());
    await bucket().put(await objectKey(email, photoId), encrypted, { customMetadata: { iv: bytesToBase64(initializationVector), contentType: photo.type } });
    return response({ photoId, contentType: photo.type }, 201);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Photo could not be uploaded." }, 500);
  }
}

export async function GET(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return response({ error: "Sign in is required." }, 401);
  const photoId = new URL(request.url).searchParams.get("id");
  if (!validPhotoId(photoId)) return response({ error: "Invalid photo id." }, 400);
  try {
    const object = await bucket().get(await objectKey(email, photoId));
    if (!object) return response({ error: "Photo not found." }, 404);
    const iv = object.customMetadata?.iv;
    if (!iv) return response({ error: "Photo metadata is incomplete." }, 500);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(), await object.arrayBuffer());
    return new Response(decrypted, { headers: { "Content-Type": object.customMetadata?.contentType ?? "image/jpeg", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Photo could not be loaded." }, 500);
  }
}

export async function DELETE(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return response({ error: "Sign in is required." }, 401);
  if (!isSameOrigin(request)) return response({ error: "Cross-origin deletion is not allowed." }, 403);
  const photoId = new URL(request.url).searchParams.get("id");
  if (!validPhotoId(photoId)) return response({ error: "Invalid photo id." }, 400);
  try {
    await bucket().delete(await objectKey(email, photoId));
    return response({ deleted: true }, 200);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Photo could not be deleted." }, 500);
  }
}
