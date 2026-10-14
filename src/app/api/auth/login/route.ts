import { NextResponse } from "next/server";
import { createSessionCookie, passwordIsValid, sessionCookieHeader } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";
    if (!password || !(await passwordIsValid(password))) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true });
    response.headers.set("Set-Cookie", sessionCookieHeader(await createSessionCookie()));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
