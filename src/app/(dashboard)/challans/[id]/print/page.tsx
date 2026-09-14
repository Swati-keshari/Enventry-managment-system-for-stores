"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase-browser";
import { formatWeight, formatDate } from "@/lib/utils";

interface DOItem {
  do_item_id: string;
  sequence_num: number;
  bags: number;
  total_weight: number;
  bag_size: number;
  vehicle_number?: string | null;
  items?: { name: string };
}

interface DORecord {
  do_id: string;
  do_number: string;
  direction: string;
  date: string;
  item_count: number;
  created_at: string;
  parties?: { name: string } | null;
  app_users?: { name: string } | null;
  do_items: DOItem[];
}

export default function DOPrintPage() {
  const { user } = useAuth();
  const params = useParams();
  const doId = params.id as string;
  const [DO, setDO] = useState<DORecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch(`/api/do?id=${doId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("Entry not found");
        const result = await res.json();
        if (!cancelled) setDO(result.data);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, doId]);

  useEffect(() => {
    if (DO && !loading) {
      window.print();
    }
  }, [DO, loading]);

  if (loading || !DO) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  const totalBags = DO.do_items?.reduce((s, i) => s + i.bags, 0) ?? 0;
  const totalWeight = DO.do_items?.reduce((s, i) => s + i.total_weight, 0) ?? 0;
  const now = new Date().toLocaleString("en-IN");

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; padding: 20px; font-family: serif; color: #000; background: #fff; }
          .no-print { display: none !important; }
          .print-container { max-width: 100%; border: none; box-shadow: none; }
        }
        @page { size: A4; margin: 15mm; }
      `}</style>

      <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => window.print()} className="h-9 px-4 bg-brand text-brand-ink text-[13px] font-semibold rounded-[10px] shadow-lg hover:bg-brand-strong transition-colors">
          Print
        </button>
        <button onClick={() => window.history.back()} className="h-9 px-4 bg-surface border border-border text-ink-soft text-[13px] font-medium rounded-[10px] hover:text-ink transition-colors">
          Back
        </button>
      </div>

      <div className="print-container max-w-2xl mx-auto p-8 bg-white text-black">
        <div className="text-center mb-6 border-b-2 border-black pb-4">
          <h1 className="text-2xl font-bold">Inventory Store</h1>
          <p className="text-sm text-gray-600">Inventory Entries · Store Management</p>
        </div>

        <div className="flex justify-between mb-6 text-sm">
          <div>
            <div><strong>Entry Number:</strong> {DO.do_number}</div>
            <div><strong>Date:</strong> {formatDate(DO.date)}</div>
            <div><strong>Direction:</strong> {DO.direction === "IN" ? "IN — Inward" : "OUT — Outward"}</div>
          </div>
          <div className="text-right">
            {DO.parties && <div><strong>Party:</strong> {DO.parties.name}</div>}
            {DO.app_users && <div><strong>Created by:</strong> {DO.app_users.name}</div>}
          </div>
        </div>

        <table className="w-full border-collapse mb-6 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left">#</th>
              <th className="border border-gray-300 px-3 py-2 text-left">Vehicle No.</th>
              <th className="border border-gray-300 px-3 py-2 text-left">Item</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Units</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Default Qty</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {DO.do_items?.map((item) => (
              <tr key={item.do_item_id}>
                <td className="border border-gray-300 px-3 py-2">{item.sequence_num}</td>
                <td className="border border-gray-300 px-3 py-2">{item.vehicle_number || "—"}</td>
                <td className="border border-gray-300 px-3 py-2 font-medium">{item.items?.name || `Item ${item.sequence_num}`}</td>
                <td className="border border-gray-300 px-3 py-2 text-right">{item.bags}</td>
                <td className="border border-gray-300 px-3 py-2 text-right">{item.bag_size}</td>
                <td className="border border-gray-300 px-3 py-2 text-right">{formatWeight(item.total_weight)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-bold">
              <td colSpan={3} className="border border-gray-300 px-3 py-2">Total</td>
              <td className="border border-gray-300 px-3 py-2 text-right">{totalBags}</td>
              <td className="border border-gray-300 px-3 py-2"></td>
              <td className="border border-gray-300 px-3 py-2 text-right">{formatWeight(totalWeight)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="flex justify-between text-xs text-gray-500 mt-8 pt-4 border-t border-gray-200">
          <div>Generated: {now}</div>
          <div>Total Items: {DO.item_count} · Total Units: {totalBags}</div>
        </div>

        <div className="mt-12 flex justify-between">
          <div className="text-center">
            <div className="w-48 border-t border-black mt-16"></div>
            <div className="text-xs text-gray-600 mt-1">Authorized Signatory</div>
          </div>
          <div className="text-center">
            <div className="w-48 border-t border-black mt-16"></div>
            <div className="text-xs text-gray-600 mt-1">Receiver&apos;s Signature</div>
          </div>
        </div>
      </div>
    </>
  );
}
