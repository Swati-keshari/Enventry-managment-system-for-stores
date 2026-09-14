// ─── Audit Writer Helper (Prompt 08) ─────────────────────────────────
//
// Centralized audit logging with SHA-256 hash chain.
// Every mutating API must call writeAudit() after a successful write.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientIp, getUserAgent } from "@/lib/auth";

export interface AuditEntry {
  warehouseId: string;
  userId: string | null;
  /** Snapshot of the actor's display name (survives user deletion). */
  actorName?: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  requestId?: string | null;
}

// ─── SHA-256 Hash Chain ───────────────────────────────────────────────

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function computeAuditContentHash(
  timestamp: string,
  userId: string | null,
  action: string,
  entityId: string | null,
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): Promise<string> {
  const input =
    (timestamp ?? "") +
    (userId ?? "") +
    (action ?? "") +
    (entityId ?? "") +
    (oldData ? JSON.stringify(oldData) : "") +
    (newData ? JSON.stringify(newData) : "");
  return sha256(input);
}

async function computeHash(
  timestamp: string,
  userId: string | null,
  action: string,
  entityId: string | null,
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): Promise<string> {
  return computeAuditContentHash(
    timestamp,
    userId,
    action,
    entityId,
    oldData,
    newData,
  );
}

// ─── Write Audit Entry ────────────────────────────────────────────────

/**
 * Write an audit log entry with hash chain integrity.
 *
 * Pass the incoming `request` so IP / user-agent are stored for every action
 * (not only login/logout). Explicit entry.ipAddress / userAgent still win.
 * Actor display name is snapshotted so it remains after the user is removed.
 */
export async function writeAudit(
  supabase: SupabaseClient,
  entry: AuditEntry,
  request?: Request | null,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const ipAddress =
    entry.ipAddress ?? (request ? getClientIp(request) : null) ?? null;
  const userAgent =
    entry.userAgent ?? (request ? getUserAgent(request) : null) ?? null;

  // Super-admins may have an Auth user without an app_users row.
  // audit_log.user_id FKs to app_users, so drop the id when there is no membership.
  let userId = entry.userId;
  let actorName = entry.actorName?.trim() || null;
  if (userId) {
    const { data: member } = await supabase
      .from("app_users")
      .select("user_id, name")
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) {
      userId = null;
    } else if (!actorName) {
      actorName = member.name?.trim() || null;
    }
  }
  if (!actorName) {
    const fromPayload =
      (typeof entry.newData?.name === "string" && entry.newData.name) ||
      (typeof entry.oldData?.name === "string" && entry.oldData.name) ||
      (typeof entry.newData?.email === "string" && entry.newData.email) ||
      (typeof entry.oldData?.email === "string" && entry.oldData.email) ||
      null;
    if (
      entry.action === "login" ||
      entry.action === "logout" ||
      entry.action.startsWith("super_admin_")
    ) {
      actorName = fromPayload;
    }
  }

  // Compute content hash first. Chain linking is done atomically in Postgres
  // so concurrent writes cannot leave a broken previous_hash.
  const currentHash = await computeHash(
    timestamp,
    userId,
    entry.action,
    entry.entityId,
    entry.oldData ?? null,
    entry.newData ?? null,
  );

  const { error } = await supabase.rpc("append_audit_log", {
    p_warehouse_id: entry.warehouseId,
    p_user_id: userId,
    p_entity: entry.entity,
    p_entity_id: entry.entityId,
    p_action: entry.action,
    p_old_data: entry.oldData ?? null,
    p_new_data: entry.newData ?? null,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
    p_session_id: entry.sessionId ?? null,
    p_request_id: entry.requestId ?? null,
    p_current_hash: currentHash,
    p_timestamp: timestamp,
    p_actor_name: actorName,
  });

  if (error) {
    // Fallback for environments that have not applied the atomic-append migration yet.
    console.warn("append_audit_log RPC failed; falling back to direct insert:", error.message);

    const { data: prevRow } = await supabase
      .from("audit_log")
      .select("current_hash")
      .eq("warehouse_id", entry.warehouseId)
      .order("timestamp", { ascending: false })
      .order("log_id", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousHash = prevRow?.current_hash ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditRow: any = {
      warehouse_id: entry.warehouseId,
      user_id: userId,
      actor_name: actorName ?? undefined,
      entity: entry.entity,
      entity_id: entry.entityId,
      action: entry.action,
      old_data: entry.oldData ?? null,
      new_data: entry.newData ?? null,
      ip_address: ipAddress ?? undefined,
      user_agent: userAgent ?? undefined,
      session_id: entry.sessionId ?? undefined,
      request_id: entry.requestId ?? undefined,
      previous_hash: previousHash,
      current_hash: currentHash,
      timestamp,
    };
    const { error: insertError } = await supabase.from("audit_log").insert(auditRow);
    if (insertError) throw insertError;
  }
}

// ─── Integrity Verification ───────────────────────────────────────────

/**
 * Verify the audit hash chain integrity for a warehouse.
 * Calls the database function verify_audit_integrity().
 */
export async function verifyAuditIntegrity(
  supabase: SupabaseClient,
  warehouseId: string,
): Promise<{ ok: boolean; brokenAt: number | null; message: string }> {
  const { data, error } = await supabase.rpc("verify_audit_integrity", {
    p_warehouse_id: warehouseId,
  });

  if (error) throw error;

  const row = data?.[0];
  return {
    ok: row?.ok ?? false,
    brokenAt: row?.broken_at ?? null,
    message: row?.message ?? "Unknown error",
  };
}

/**
 * Fill missing current_hash values (e.g. old login/logout inserts),
 * then re-link previous_hash via repair_audit_chain.
 */
export async function repairAuditChainWithHashBackfill(
  supabase: SupabaseClient,
  warehouseId: string,
): Promise<{
  ok: boolean;
  backfilledCount: number;
  repairedCount: number;
  message: string;
  verify: { ok: boolean; brokenAt: number | null; message: string };
}> {
  const { data: rows, error } = await supabase
    .from("audit_log")
    .select(
      "log_id, user_id, action, entity_id, old_data, new_data, timestamp, current_hash",
    )
    .eq("warehouse_id", warehouseId)
    .order("timestamp", { ascending: true })
    .order("log_id", { ascending: true });

  if (error) throw error;

  let backfilledCount = 0;
  for (const row of rows ?? []) {
    if (row.current_hash) continue;

    const timestamp =
      typeof row.timestamp === "string"
        ? row.timestamp
        : new Date(row.timestamp as string).toISOString();

    const currentHash = await computeAuditContentHash(
      timestamp,
      row.user_id ?? null,
      row.action,
      row.entity_id ?? null,
      (row.old_data as Record<string, unknown> | null) ?? null,
      (row.new_data as Record<string, unknown> | null) ?? null,
    );

    const { error: updateError } = await supabase
      .from("audit_log")
      .update({ current_hash: currentHash })
      .eq("log_id", row.log_id);

    if (updateError) throw updateError;
    backfilledCount += 1;
  }

  const { data: repairData, error: repairError } = await supabase.rpc(
    "repair_audit_chain",
    { p_warehouse_id: warehouseId },
  );
  if (repairError) throw repairError;

  const repairRow = Array.isArray(repairData) ? repairData[0] : repairData;
  const verify = await verifyAuditIntegrity(supabase, warehouseId);

  return {
    ok: verify.ok,
    backfilledCount,
    repairedCount: repairRow?.repaired_count ?? 0,
    message: [
      backfilledCount > 0
        ? `Backfilled ${backfilledCount} missing content hash(es).`
        : null,
      repairRow?.message ?? "Repair finished.",
    ]
      .filter(Boolean)
      .join(" "),
    verify,
  };
}
