"use client";

import imageCompression from "browser-image-compression";

// Matches the file_size_limit set on the delivery-photos and documents
// Supabase Storage buckets. Modern phone cameras routinely produce 8-15MB
// raw JPEGs on budget Android devices, which silently fail against this
// limit if uploaded uncompressed - that mismatch is what "Couldn't upload
// the photo" errors have actually been, most of the time.
export const BUCKET_LIMIT_BYTES = 5 * 1024 * 1024;

const COMPRESSION_TIMEOUT_MS = 12000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("COMPRESSION_TIMEOUT")), ms)
    ),
  ]);
}

/**
 * App-wide standard for compressing and uploading an image to Supabase
 * Storage. Used by avatar upload, rider onboarding documents, package
 * photos, and delivery-confirmation photos, so every upload path behaves
 * the same way and fails for the same understandable reasons.
 *
 * Compresses on-device first so budget Android cameras never hit a
 * bucket's real size limit. If compression itself fails or times out
 * (a stuck Web Worker, an older WebView choking on a large image - both
 * common on cheap devices), falls back to the original file only when
 * it already fits the limit on its own.
 *
 * Throws an Error with a `.code` of:
 *   NO_FILE         - no file was passed in
 *   PHOTO_TOO_LARGE - original exceeds the bucket limit and compression
 *                     failed or timed out, so there is nothing safe to send
 *   UPLOAD_FAILED    - Supabase Storage rejected the upload (RLS, network,
 *                     bucket misconfig, etc) - .cause holds the original
 *                     Supabase error for logging
 */
export async function compressAndUploadImage({
  file,
  supabase,
  bucket,
  path,
  contentTypeFallback = "image/jpeg",
  compress = true,
  maxSizeMB = 1.5,
  maxWidthOrHeight = 1280,
  upsert = false,
  cacheControl,
}) {
  if (!file) {
    throw Object.assign(new Error("NO_FILE"), { code: "NO_FILE" });
  }

  let uploadFile = file;

  if (compress) {
    try {
      uploadFile = await withTimeout(
        imageCompression(file, {
          maxSizeMB,
          maxWidthOrHeight,
          useWebWorker: true,
          maxIteration: 4,
          initialQuality: 0.75,
        }),
        COMPRESSION_TIMEOUT_MS
      );
    } catch (compressErr) {
      console.warn(
        "Image compression timed out or failed, falling back to original:",
        compressErr
      );
      if (file.size <= BUCKET_LIMIT_BYTES) {
        uploadFile = file;
      } else {
        throw Object.assign(new Error("PHOTO_TOO_LARGE"), {
          code: "PHOTO_TOO_LARGE",
        });
      }
    }
  } else if (file.size > BUCKET_LIMIT_BYTES) {
    throw Object.assign(new Error("PHOTO_TOO_LARGE"), {
      code: "PHOTO_TOO_LARGE",
    });
  }

  const uploadOptions = {
    contentType: uploadFile.type || contentTypeFallback,
  };
  if (upsert) uploadOptions.upsert = true;
  if (cacheControl) uploadOptions.cacheControl = cacheControl;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, uploadFile, uploadOptions);

  if (error || !data) {
    throw Object.assign(new Error(error?.message || "UPLOAD_FAILED"), {
      code: "UPLOAD_FAILED",
      cause: error,
    });
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return { path, publicUrl: publicUrlData?.publicUrl || null };
}