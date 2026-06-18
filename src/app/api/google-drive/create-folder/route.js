import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { userName, accessToken } = await req.json();

    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing Google access token" },
        { status: 400 }
      );
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: accessToken,
    });

    const drive = google.drive({ version: "v3", auth });

    const response = await drive.files.create({
      requestBody: {
        name: `ClientDocs_${userName}`,
        mimeType: "application/vnd.google-apps.folder",
      },
    });

    return NextResponse.json({
      folderId: response.data.id,
    });

  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}