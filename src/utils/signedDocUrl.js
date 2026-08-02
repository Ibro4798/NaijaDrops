// Documents bucket is private. Old rows may still hold a legacy "public" URL
// (from supabase.storage.from('documents').getPublicUrl(...)); new rows just
// store the bare storage path. This resolves either form into a short-lived
// signed URL, server-side, at render time.

const PUBLIC_MARKER = "/object/public/documents/";
const SIGN_MARKER = "/object/sign/documents/";

function extractPath(urlOrPath) {
  if (!urlOrPath) return null;

  const publicIdx = urlOrPath.indexOf(PUBLIC_MARKER);
  if (publicIdx !== -1) {
    return urlOrPath.slice(publicIdx + PUBLIC_MARKER.length);
  }

  const signIdx = urlOrPath.indexOf(SIGN_MARKER);
  if (signIdx !== -1) {
    return urlOrPath.slice(signIdx + SIGN_MARKER.length).split("?")[0];
  }

  // Not a URL at all — assume it's already a bare storage path.
  if (!urlOrPath.startsWith("http")) {
    return urlOrPath;
  }

  return null;
}

export async function getSignedDocUrl(supabase, urlOrPath, expiresIn = 3600) {
  const path = extractPath(urlOrPath);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error("getSignedDocUrl error for path:", path, error.message);
    return null;
  }

  return data.signedUrl;
}

const RIDER_DOC_FIELDS = [
  "profile_photo_url",
  "id_card_url",
  "license_url",
  "vehicle_photo_url",
];

export async function resolveRiderDocUrls(supabase, rider, expiresIn = 3600) {
  if (!rider) return rider;

  const resolved = { ...rider };
  await Promise.all(
    RIDER_DOC_FIELDS.map(async (field) => {
      if (rider[field]) {
        resolved[field] = await getSignedDocUrl(supabase, rider[field], expiresIn);
      }
    })
  );

  return resolved;
}