import {
  deleteFromDrive,
  isDriveConfigured,
  uploadToDrive,
} from "./drive";

export type StorageProvider = "google_drive";
export type DocumentType = "pdf" | "csv" | "image" | "xl" | "other";

export type StoredObject = {
  provider: StorageProvider;
  key: string;
  url: string;
  folderPath: string;
  storedFileName: string;
};

function sanitizePathPart(value: string): string {
  return (
    value
      .replace(/[\\/]/g, "-")
      .replace(/[\u0000-\u001f]/g, "")
      .trim()
      .slice(0, 120) || "unknown"
  );
}

function sanitizeFileName(value: string): string {
  return (
    value
      .replace(/[\\/]/g, "-")
      .replace(/[^a-zA-Z0-9._() -]/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 160) || "document"
  );
}

export function classifyDocument(file: File): DocumentType {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type === "application/pdf" || extension === "pdf") return "pdf";
  if (file.type === "text/csv" || extension === "csv") return "csv";
  if (file.type.startsWith("image/") || ["jpg", "jpeg", "png"].includes(extension ?? "")) {
    return "image";
  }
  if (
    file.type === "application/vnd.ms-excel" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ["xls", "xlsx"].includes(extension ?? "")
  ) {
    return "xl";
  }
  return "other";
}

export function buildDocumentFolderPath(input: {
  warehouseName: string;
  userName: string;
  documentType: DocumentType;
}): string {
  return [
    sanitizePathPart(input.warehouseName),
    "Documents",
    sanitizePathPart(input.userName),
    input.documentType,
  ].join("/");
}

export function buildStoredFileName(fileId: string, originalName: string): string {
  return `${fileId}_${sanitizeFileName(originalName)}`;
}

export async function isStorageConfigured(warehouseId: string): Promise<boolean> {
  return await isDriveConfigured(warehouseId);
}

export async function storeDocument(input: {
  file: File;
  fileId: string;
  warehouseId: string;
  warehouseName: string;
  userName: string;
}): Promise<StoredObject> {
  const documentType = classifyDocument(input.file);
  const folderPath = buildDocumentFolderPath({
    warehouseName: input.warehouseName,
    userName: input.userName,
    documentType,
  });
  const storedFileName = buildStoredFileName(input.fileId, input.file.name);
  const uploaded = await uploadToDrive(
    input.file,
    folderPath,
    storedFileName,
    input.warehouseId,
  );

  return {
    provider: "google_drive",
    key: uploaded.fileId,
    url: uploaded.url,
    folderPath,
    storedFileName,
  };
}

export async function removeStoredDocument(input: {
  provider: StorageProvider;
  key: string;
  warehouseId: string;
}): Promise<void> {
  switch (input.provider) {
    case "google_drive":
      await deleteFromDrive(input.key, input.warehouseId);
  }
}

