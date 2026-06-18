import { google } from "googleapis";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const accessToken = formData.get("accessToken");
    const folderId = formData.get("folderId");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    if (!accessToken || typeof accessToken !== "string") {
      return NextResponse.json({ error: "Missing Google access token" }, { status: 400 });
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: "v3", auth });
    const buffer = Buffer.from(await file.arrayBuffer());

    const response = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: folderId && typeof folderId === "string" ? [folderId] : undefined,
      },
      media: {
        mimeType: file.type || "application/octet-stream",
        body: Readable.from(buffer),
      },
      fields: "id, name, mimeType, webViewLink, webContentLink",
    });

    return NextResponse.json({ file: response.data }, { status: 201 });
  } catch (error) {
    console.error("Google Drive upload error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}
