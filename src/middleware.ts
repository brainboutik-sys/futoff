import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "futoff_sid";

/**
 * Ensures every request has an anonymous session cookie before any
 * server component or route handler runs. Next 15 forbids cookie writes
 * in server-component renders, so we set it here.
 */
export function middleware(req: NextRequest) {
  if (req.cookies.get(COOKIE)) return NextResponse.next();

  const res = NextResponse.next();
  res.cookies.set(COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
