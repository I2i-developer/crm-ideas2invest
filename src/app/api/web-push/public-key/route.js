import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || "";

  return NextResponse.json({
    publicKey,
    configured: Boolean(publicKey && process.env.WEB_PUSH_VAPID_PRIVATE_KEY && process.env.WEB_PUSH_CONTACT_EMAIL),
  });
}
