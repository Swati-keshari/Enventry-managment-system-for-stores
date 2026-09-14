import { DO } from "./types";

export function getTotalBags(DOs: DO[]): number {
  return DOs.reduce(
    (total, c) =>
      total + c.items.reduce((sum, item) => sum + item.noOfBags, 0),
    0
  );
}

export function getTotalWeight(DOs: DO[]): number {
  return DOs.reduce(
    (total, c) =>
      total + c.items.reduce((sum, item) => sum + item.weight, 0),
    0
  );
}

export function getVehicleCount(DOs: DO[]): number {
  const vehicles = new Set(DOs.map((c) => c.vehicleNumber));
  return vehicles.size;
}

export function formatWeight(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(1)} t`;
  }
  return `${kg}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function todayStr(): string {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

export function last7DaysRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  const from = new Date(now.getTime() - 7 * 86400000)
    .toISOString()
    .split("T")[0];
  return { from, to };
}

export function directionLabel(d: "IN" | "OUT"): string {
  return d === "IN" ? "IN — Inward" : "OUT — Outward";
}

export function createEmptyItem() {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    rstNo: "",
    itemName: "",
    noOfBags: 0,
    weight: 0,
  };
}
