import { cookies } from "next/headers";

const COOKIE = "futoff_sid";

/**
 * Read the session id. Middleware guarantees the cookie is set before pages
 * render, but route handlers may be called before middleware on first load,
 * so we fall back to creating one here (allowed inside route handlers).
 */
export async function getOrCreateSessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return existing;

  const sid = crypto.randomUUID();
  jar.set(COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return sid;
}

/** Read session id without mutating cookies — safe in Server Components. */
export async function readSessionId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}
