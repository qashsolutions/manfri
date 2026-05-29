import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

// HttpOnly, Secure, SameSite=Lax encrypted session cookie. The browser never holds
// a FastAPI token; per request the BFF reads this session and mints a short-lived
// internal JWT (see jwt.ts) for the FastAPI call.
export interface BffSession {
  userId?: string;
  orgId?: string;
  roles?: string[];
}

export const sessionOptions: SessionOptions = {
  // Dev default (>= 32 chars). Rotate from a secret in real environments.
  password: process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me-0123456789",
  cookieName: "manfriday_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  },
};

export async function getSession(): Promise<IronSession<BffSession>> {
  return getIronSession<BffSession>(await cookies(), sessionOptions);
}
