import { google } from "googleapis";
import { Readable } from "stream";
import { AppError } from "./errors";
import { decryptRefreshToken, getDriveIntegration } from "./drive-oauth";

type DriveClient = {
  drive: ReturnType<typeof google.drive>;
  rootFolderId: string;
  mode: "oauth" | "service_account";
};

function getServiceAccountAuth() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;
  return new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

function isServiceAccountConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.DRIVE_ROOT_FOLDER_ID,
  );
}

function extractGoogleErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : "Google Drive request failed";
  }

  const withResponse = error as {
    message?: string;
    response?: { data?: { error?: string; error_description?: string } };
  };
  const data = withResponse.response?.data;
  if (data?.error_description) return data.error_description;
  if (data?.error) return data.error;
  if (typeof withResponse.message === "string" && withResponse.message) {
    return withResponse.message;
  }
  return "Google Drive request failed";
}

export function mapDriveError(error: unknown): AppError {
  const message = extractGoogleErrorMessage(error).toLowerCase();

  if (
    message.includes("invalid_client") ||
    message.includes("client secret is invalid")
  ) {
    return new AppError(
      "drive_oauth_misconfigured",
      "Google Drive OAuth is misconfigured: GOOGLE_CLIENT_SECRET does not match GOOGLE_CLIENT_ID. Update the Drive OAuth client secret in Vercel/.env, redeploy, then reconnect Drive from Profile.",
      503,
    );
  }

  if (
    message.includes("invalid_grant") ||
    message.includes("token has been expired") ||
    message.includes("token has been revoked")
  ) {
    return new AppError(
      "drive_reconnect_required",
      "Google Drive access expired. Ask an admin to reconnect Drive from Profile.",
      503,
    );
  }

  if (message.includes("insufficient") || message.includes("permission")) {
    return new AppError(
      "drive_permission_denied",
      "Google Drive permission denied for the warehouse folder.",
      503,
    );
  }

  return new AppError(
    "drive_error",
    `Google Drive upload failed: ${extractGoogleErrorMessage(error)}`,
    502,
  );
}

async function getOAuthDriveClient(warehouseId: string): Promise<DriveClient | null> {
  const integration = await getDriveIntegration(warehouseId);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!integration || !clientId || !clientSecret) return null;

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({
    refresh_token: decryptRefreshToken(integration.refresh_token_encrypted),
  });

  // Validate credentials before returning so we can fall back cleanly.
  await auth.getAccessToken();

  return {
    drive: google.drive({ version: "v3", auth }),
    rootFolderId: integration.root_folder_id,
    mode: "oauth",
  };
}

function getServiceAccountDriveClient(rootFolderId: string): DriveClient | null {
  const auth = getServiceAccountAuth();
  if (!auth || !rootFolderId) return null;
  return {
    drive: google.drive({ version: "v3", auth }),
    rootFolderId,
    mode: "service_account",
  };
}

async function getDriveClient(warehouseId: string): Promise<DriveClient | null> {
  const integration = await getDriveIntegration(warehouseId);
  const saRoot =
    process.env.DRIVE_ROOT_FOLDER_ID || integration?.root_folder_id || null;

  try {
    const oauthClient = await getOAuthDriveClient(warehouseId);
    if (oauthClient) return oauthClient;
  } catch (error) {
    const saClient = saRoot ? getServiceAccountDriveClient(saRoot) : null;
    if (saClient) {
      console.warn(
        "OAuth Drive auth failed; falling back to service account:",
        extractGoogleErrorMessage(error),
      );
      return saClient;
    }
    throw mapDriveError(error);
  }

  if (saRoot) {
    const saClient = getServiceAccountDriveClient(saRoot);
    if (saClient) return saClient;
  }

  return null;
}

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/csv",
  "text/plain",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "csv",
  "xls",
  "xlsx",
  "doc",
  "docx",
  "txt",
]);

// Keep uploads below Vercel's request body limit. Larger files should use a
// resumable/direct upload flow instead of passing through the API route.
const MAX_FILE_SIZE = 4 * 1024 * 1024;

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size === 0) return { valid: false, error: "Empty file not allowed" };
  if (file.size > MAX_FILE_SIZE) return { valid: false, error: "File too large (max 4 MB)" };
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (
    !ALLOWED_MIME_TYPES.has(file.type) &&
    !ALLOWED_EXTENSIONS.has(extension)
  ) {
    return {
      valid: false,
      error: `File type not allowed: ${file.type || extension || "unknown"}`,
    };
  }
  return { valid: true };
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function ensureFolder(drive: ReturnType<typeof google.drive>, parentId: string, name: string): Promise<string> {
  const escapedName = escapeDriveQueryValue(name);
  const { data: existing } = await drive.files.list({
    q: `name='${escapedName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)", spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (existing.files?.[0]?.id) return existing.files[0].id;
  const { data: created } = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!created.id) throw new Error("Failed to create folder");
  return created.id;
}

export async function uploadToDrive(
  file: File,
  folderPath: string,
  fileName: string,
  warehouseId: string,
): Promise<{ fileId: string; url: string }> {
  try {
    const client = await getDriveClient(warehouseId);
    if (!client) {
      throw new AppError(
        "drive_not_configured",
        "Google Drive is not configured. Ask an admin to connect Drive from Profile, or set service-account Drive env vars.",
        503,
      );
    }
    const { drive, rootFolderId } = client;

    const pathParts = folderPath.split("/").filter(Boolean);
    let parentId = rootFolderId;
    for (const part of pathParts) {
      parentId = await ensureFolder(drive, parentId, part);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { data: uploaded } = await drive.files.create({
      requestBody: { name: fileName, parents: [parentId] },
      media: { mimeType: file.type, body: Readable.from(buffer) as unknown as NodeJS.ReadableStream },
      fields: "id, webViewLink",
      supportsAllDrives: true,
    });

    if (!uploaded.id) throw new Error("Failed to upload to Google Drive");
    return {
      fileId: uploaded.id,
      url: uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view`,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw mapDriveError(error);
  }
}

export function getDownloadUrl(driveFileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${driveFileId}`;
}

export async function deleteFromDrive(driveFileId: string, warehouseId: string): Promise<void> {
  try {
    const client = await getDriveClient(warehouseId);
    if (!client) {
      throw new AppError(
        "drive_not_configured",
        "Google Drive is not configured for this warehouse.",
        503,
      );
    }
    const { drive } = client;
    await drive.files.delete({ fileId: driveFileId, supportsAllDrives: true });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw mapDriveError(error);
  }
}

export async function isDriveConfigured(warehouseId: string): Promise<boolean> {
  if (isServiceAccountConfigured()) return true;
  return (await getDriveIntegration(warehouseId)) !== null;
}

export async function checkDriveConnection(warehouseId: string): Promise<{
  ok: boolean;
  folderName?: string;
  error?: string;
  mode?: "oauth" | "service_account";
}> {
  try {
    const client = await getDriveClient(warehouseId);
    if (!client) {
      return { ok: false, error: "not_configured" };
    }
    const { drive, rootFolderId, mode } = client;

    const { data } = await drive.files.get({
      fileId: rootFolderId,
      fields: "name,mimeType,capabilities(canAddChildren)",
      supportsAllDrives: true,
    });
    const isFolder = data.mimeType === "application/vnd.google-apps.folder";
    const canAddChildren = data.capabilities?.canAddChildren === true;
    if (!isFolder || !canAddChildren) {
      return { ok: false, error: "folder_not_writable", mode };
    }
    return { ok: true, folderName: data.name ?? "Google Drive", mode };
  } catch (error) {
    return {
      ok: false,
      error: extractGoogleErrorMessage(error),
    };
  }
}
