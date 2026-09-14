import { google } from "googleapis";
import {
  createDriveOAuthClient,
  saveDriveIntegration,
  verifyDriveOAuthState,
} from "@/lib/drive-oauth";
import { createServiceClient } from "@/lib/supabase";
import { getOAuthOrigin } from "@/lib/url-utils";

function profileRedirect(origin: string, status: "connected" | "error") {
  return Response.redirect(`${origin}/profile?drive=${status}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getOAuthOrigin(request);

  try {
    const providerError = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (providerError || !code || !state) {
      return profileRedirect(origin, "error");
    }

    const verifiedState = verifyDriveOAuthState(state);
    const supabase = createServiceClient();
    const { data: admin } = await supabase
      .from("app_users")
      .select("user_id")
      .eq("user_id", verifiedState.userId)
      .eq("warehouse_id", verifiedState.warehouseId)
      .eq("role", "admin")
      .single();
    if (!admin) throw new Error("Admin access is no longer valid");

    const oauth2 = createDriveOAuthClient(origin);
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error("Google did not return an offline refresh token");
    }
    oauth2.setCredentials(tokens);

    const rootFolderId = process.env.DRIVE_ROOT_FOLDER_ID;
    if (!rootFolderId) throw new Error("DRIVE_ROOT_FOLDER_ID is not configured");

    const drive = google.drive({ version: "v3", auth: oauth2 });
    const { data: folder } = await drive.files.get({
      fileId: rootFolderId,
      fields: "mimeType,capabilities(canAddChildren)",
      supportsAllDrives: true,
    });
    if (
      folder.mimeType !== "application/vnd.google-apps.folder" ||
      folder.capabilities?.canAddChildren !== true
    ) {
      throw new Error("The selected Google account cannot write to the Drive folder");
    }

    const oauthApi = google.oauth2({ version: "v2", auth: oauth2 });
    const { data: account } = await oauthApi.userinfo.get();

    await saveDriveIntegration({
      warehouseId: verifiedState.warehouseId,
      userId: verifiedState.userId,
      refreshToken: tokens.refresh_token,
      accountEmail: account.email ?? null,
      rootFolderId,
    });

    return profileRedirect(origin, "connected");
  } catch (error) {
    console.error("Google Drive OAuth callback failed:", error);
    return profileRedirect(origin, "error");
  }
}

