// Digital Asset Links: tells Android that the NaijaDrops app owns this domain, so the
// app opens full-screen without Chrome's address bar. Served at
//   https://<your-domain>/.well-known/assetlinks.json
//
// Set these in Vercel (Project > Settings > Environment Variables), then redeploy:
//   ANDROID_PACKAGE_NAME          e.g. com.naijadrops.app (must match the Android app)
//   ANDROID_SHA256_FINGERPRINTS   comma-separated SHA-256 certificate fingerprint(s):
//                                 the Play App Signing key (Play Console > Setup > App signing),
//                                 plus your upload key if you test builds on a phone.
// Until a valid fingerprint is set this returns an empty list, which is harmless.
export const dynamic = "force-dynamic";

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export async function GET() {
  const packageName = (process.env.ANDROID_PACKAGE_NAME || "com.naijadrops.app").trim();
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS || "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => FINGERPRINT.test(f));

  const body = fingerprints.length === 0 ? [] : [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints },
    },
  ];

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
