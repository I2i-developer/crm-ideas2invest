import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json({ error: "Insurance module has moved to the separate insurance portal" }, { status: 410 });
}

export const GET = retired;
export const PATCH = retired;
export const DELETE = retired;
