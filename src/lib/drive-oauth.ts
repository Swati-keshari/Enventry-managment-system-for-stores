import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { google } from "googleapis";
import { createServiceClient } from "./supabase";

const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/userinfo.email",
];

type OAuthState = {
  warehouseId: string;
  userId: string;
  expiresAt: number;
};

function getOAuthCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client credentials are not configured");
  }
  return { clientId, clientSecret };
}

function getCallbackUrl(origin: string): string {
  return `${origin}/api/integrations/google-drive/callback`;
}

export function createDriveOAuthClient(origin: string) {
  const { clientId, clientSecret } = getOAuthCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, getCallbackUrl(origin));
}

function signState(encodedPayload: string): string {
  const { clientSecret } = getOAuthCredentials();
  return createHmac("sha256", clientSecret).update(encodedPayload).digest("base64url");
}

export function createDriveOAuthState(warehouseId: string, userId: string): string {
  const payload: OAuthState = {
    warehouseId,
    userId,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signState(encodedPayload)}`;
}

export function verifyDriveOAuthState(state: string): OAuthState {
  const [encodedPayload, receivedSignature] = state.split(".");
  if (!encodedPayload || !receivedSignature) throw new Error("Invalid OAuth state");

  const expectedSignature = signState(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(receivedSignature);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new Error("Invalid OAuth state signature");
  }

  const parsed: unknown = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  );
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("warehouseId" in parsed) ||
    !("userId" in parsed) ||
    !("expiresAt" in parsed) ||
    typeof parsed.warehouseId !== "string" ||
    typeof parsed.userId !== "string" ||
    typeof parsed.expiresAt !== "number"
  ) {
    throw new Error("Invalid OAuth state payload");
  }
  if (parsed.expiresAt < Date.now()) throw new Error("OAuth state expired");
  return parsed as OAuthState;
}

export function getDriveAuthorizationUrl(
  origin: string,
  warehouseId: string,
  userId: string,
): string {
  const oauth2 = createDriveOAuthClient(origin);
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPES,
    state: createDriveOAuthState(warehouseId, userId),
  });
}

function getTokenKey(): Buffer {
  const { clientSecret } = getOAuthCredentials();
  return createHash("sha256")
    .update(`warehouse-google-drive:${clientSecret}`)
    .digest();
}

export function encryptRefreshToken(refreshToken: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getTokenKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptRefreshToken(encryptedToken: string): string {
  const [ivPart, tagPart, encryptedPart] = encryptedToken.split(".");
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error("Invalid encrypted Drive token");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getTokenKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getDriveIntegration(warehouseId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("drive_integrations")
    .select("refresh_token_encrypted, account_email, root_folder_id, updated_at")
    .eq("warehouse_id", warehouseId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveDriveIntegration(input: {
  warehouseId: string;
  userId: string;
  refreshToken: string;
  accountEmail: string | null;
  rootFolderId: string;
}) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("drive_integrations").upsert(
    {
      warehouse_id: input.warehouseId,
      connected_by: input.userId,
      refresh_token_encrypted: encryptRefreshToken(input.refreshToken),
      account_email: input.accountEmail,
      root_folder_id: input.rootFolderId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "warehouse_id" },
  );
  if (error) throw error;
}

export async function removeDriveIntegration(warehouseId: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("drive_integrations")
    .delete()
    .eq("warehouse_id", warehouseId);
  if (error) throw error;
}

