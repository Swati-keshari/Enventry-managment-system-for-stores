import { randomUUID } from "crypto";
import { requireAuth, getClientIp, getUserAgent } from "@/lib/auth";
import { assertDoOwnership, checkRouteAccess } from "@/lib/rbac";
import { AppError, handleApiError, NotFoundError, ValidationError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";
import { writeAudit } from "@/lib/audit";
import { validateFile } from "@/lib/drive";
import {
  isStorageConfigured,
  removeStoredDocument,
  storeDocument,
} from "@/lib/storage";

const ROUTE_KEY_GET = "GET /api/files";
const ROUTE_KEY_POST = "POST /api/files/upload";
const ROUTE_KEY_DELETE = "DELETE /api/files";

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_POST, user, request);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const category = formData.get("category") as string | null;
    const doId = formData.get("do_id") as string | null;
    const description = formData.get("description") as string | null;

    if (!file) throw new ValidationError("file", "File is required");
    if (!category) throw new ValidationError("category", "Category is required");
    if (description && description.length > 250) {
      throw new ValidationError("description", "Must be 250 characters or less");
    }

    const validCategories = ["document", "report", "do_pdf", "template", "rate_list", "contact", "backup", "other"];
    if (!validCategories.includes(category)) throw new ValidationError("category", "Invalid category");

    const validation = validateFile(file);
    if (!validation.valid) throw new ValidationError("file", validation.error!);

    if (!(await isStorageConfigured(user.warehouseId))) {
      throw new AppError(
        "drive_not_configured",
        "Google Drive is not configured. Ask an admin to check the server environment variables.",
        503,
      );
    }

    const supabase = createServiceClient();
    if (doId) {
      const { data: doRow, error: doError } = await supabase
        .from("delivery_orders")
        .select("do_id, user_id")
        .eq("do_id", doId)
        .eq("warehouse_id", user.warehouseId)
        .single();
      if (doError || !doRow) throw new NotFoundError("Delivery order");
      assertDoOwnership(doRow.user_id, user);
    }

    const fileId = randomUUID();
    const stored = await storeDocument({
      file,
      fileId,
      warehouseId: user.warehouseId,
      warehouseName: user.warehouseName,
      userName: user.name,
    });

    const { data, error } = await supabase
      .from("files")
      .insert({
        file_id: fileId,
        warehouse_id: user.warehouseId,
        user_id: user.userId,
        do_id: doId ?? null,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        drive_file_id: stored.key,
        drive_url: stored.url,
        folder_path: stored.folderPath,
        category,
        description: description ?? null,
      })
      .select("file_id")
      .single();

    if (error) {
      try {
        await removeStoredDocument({
          provider: stored.provider,
          key: stored.key,
          warehouseId: user.warehouseId,
        });
      } catch (cleanupError) {
        console.error("Drive cleanup after database failure failed:", cleanupError);
      }
      throw error;
    }

    await writeAudit(supabase, {
      warehouseId: user.warehouseId, userId: user.userId,
      actorName: user.name,
      entity: "file", entityId: data.file_id, action: "create",
      newData: {
        file_id: data.file_id,
        file_name: file.name,
        stored_file_name: stored.storedFileName,
        file_type: file.type,
        file_size: file.size,
        category,
        description: description || null,
        do_id: doId,
        storage_provider: stored.provider,
        folder_path: stored.folderPath,
      },
      ipAddress: getClientIp(request), userAgent: getUserAgent(request),
    }, request);

    return Response.json(
      {
        file_id: data.file_id,
        drive_url: stored.url,
        folder_path: stored.folderPath,
        storage: stored.provider,
        message: "File uploaded to Google Drive.",
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_GET, user, request);

    const url = new URL(request.url);
    const doId = url.searchParams.get("do_id");
    const category = url.searchParams.get("category");
    const standalone = url.searchParams.get("standalone") === "true";

    const supabase = createServiceClient();
    let query = supabase.from("files").select("*").eq("warehouse_id", user.warehouseId).order("created_at", { ascending: false });

    if (user.role === "staff") query = query.eq("user_id", user.userId);
    if (doId) query = query.eq("do_id", doId);
    if (standalone) query = query.is("do_id", null);
    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) throw error;

    return Response.json({ files: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_DELETE, user, request);

    const url = new URL(request.url);
    const fileId = url.searchParams.get("id");
    if (!fileId) throw new ValidationError("id", "File ID required");

    const supabase = createServiceClient();
    const { data: existing } = await supabase
      .from("files")
      .select("*")
      .eq("file_id", fileId)
      .eq("warehouse_id", user.warehouseId)
      .single();
    if (!existing) throw new ValidationError("id", "File not found");

    try {
      await removeStoredDocument({
        provider: "google_drive",
        key: existing.drive_file_id,
        warehouseId: user.warehouseId,
      });
    } catch (driveError) {
      console.error("Drive delete failed (DB delete proceeds):", driveError);
    }

    const { error } = await supabase.from("files").delete().eq("file_id", fileId);
    if (error) throw error;

    await writeAudit(supabase, {
      warehouseId: user.warehouseId, userId: user.userId,
      actorName: user.name,
      entity: "file", entityId: fileId, action: "delete",
      oldData: existing as unknown as Record<string, unknown>,
    }, request);

    return Response.json({ message: "File deleted." });
  } catch (error) {
    return handleApiError(error);
  }
}
