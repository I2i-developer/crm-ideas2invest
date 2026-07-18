import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json({ error: "Insurance logs have moved to the separate insurance portal" }, { status: 410 });
}

export const GET = retired;
export const POST = retired;
