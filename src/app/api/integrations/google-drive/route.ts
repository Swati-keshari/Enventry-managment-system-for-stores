import { requireRole } from "@/lib/auth";
import { checkDriveConnection } from "@/lib/drive";
import {
  getDriveAuthorizationUrl,
  getDriveIntegration,
  removeDriveIntegration,
} from "@/lib/drive-oauth";
import { handleApiError } from "@/lib/errors";
import { getOAuthOrigin } from "@/lib/url-utils";

export async function GET(request: Request) {
  try {
    const user = await requireRole(request, ["admin"]);
    const integration = await getDriveIntegration(user.warehouseId);
    if (!integration) {
      return Response.json({
        connected: false,
        callback_url: `${getOAuthOrigin(request)}/api/integrations/google-drive/callback`,
      });
    }

    const connection = await checkDriveConnection(user.warehouseId);
    return Response.json({
      connected: connection.ok,
      account_email: integration.account_email,
      folder_name: connection.folderName ?? null,
      updated_at: integration.updated_at,
      mode: connection.mode ?? null,
      error: connection.ok ? null : connection.error,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole(request, ["admin"]);
    const origin = getOAuthOrigin(request);
    const authorizationUrl = getDriveAuthorizationUrl(
      origin,
      user.warehouseId,
      user.userId,
    );
    return Response.json({
      authorization_url: authorizationUrl,
      callback_url: `${origin}/api/integrations/google-drive/callback`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireRole(request, ["admin"]);
    await removeDriveIntegration(user.warehouseId);
    return Response.json({ message: "Google Drive disconnected." });
  } catch (error) {
    return handleApiError(error);
  }
}

