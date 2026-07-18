import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Insurance client creation has moved to the separate insurance portal" }, { status: 410 });
}
