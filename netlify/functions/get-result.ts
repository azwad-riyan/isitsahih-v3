// GET /.netlify/functions/get-result?id=<uuid>
// Returns a stored share blob. The blob is immutable — there is no update path —
// so it can be cached forever.
import { getStore } from "@netlify/blobs";

export const config = { path: "/.netlify/functions/get-result" };

function json(obj: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": cache },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false }, 405, "no-store");

  const id = new URL(req.url).searchParams.get("id");
  // UUID v4 sanity check — reject anything that isn't a plausible id.
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return json({ ok: false }, 400, "no-store");
  }

  try {
    const store = getStore("shares");
    const blob = await store.get(id, { type: "json" });
    if (!blob) return json({ ok: false }, 404, "no-store");
    return json(
      { ok: true, share: blob },
      200,
      "public, max-age=31536000, immutable",
    );
  } catch {
    return json({ ok: false }, 500, "no-store");
  }
}
