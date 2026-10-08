"use client";

import React, { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FaceResetModal } from "@/components/faults/FaceResetModal";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { api } from "@/lib/api";
import {
  AlertTriangle, CheckCircle2, AlertOctagon, Filter,
  Clock, UserCheck, Check, ShieldAlert, PowerOff, RotateCcw
} from "lucide-react";

export default function FaultCenterPage() {
  const { channels, hasLiveData, refresh } = useLiveTelemetry();
  const [filterState, setFilterState] = useState<string>("ALL"); // ALL, ACTIVE, LATCHED, RESOLVED, MAINTENANCE
  const [faultHistory, setFaultHistory] = useState<any[]>([]);
  const [resetModalChannels, setResetModalChannels] = useState<number[] | null>(null);
  const [selectedForReset, setSelectedForReset] = useState<Set<number>>(new Set());
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const loadHistory = async () => {
    try {
      const data = await api.getFaults();
      if (Array.isArray(data)) setFaultHistory(data);
    } catch {
      setFaultHistory([]);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleAcknowledge = async (faultId: string) => {
    try {
      await api.acknowledgeFault(faultId, "Operator review completed");
      setActionNotice(`Fault ${faultId} acknowledged.`);
      loadHistory();
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      setActionNotice(err.message || "Failed to acknowledge");
    }
  };

  // Extract active faults from live channels
  const activeFaults = channels.filter(
    (ch) => ch.status === "FAULT LATCHED" || ch.status === "TRIPPED" || ch.status === "CRITICAL" || ch.status === "WARNING"
  );

  // Filtered faults list for the table
  const filteredFaults = useMemo(() => {
    return faultHistory.filter((flt) => {
      if (filterState === "ALL") return true;
      if (filterState === "ACTIVE") return flt.resolution === "UNRESOLVED" || flt.relay_state === "TRIPPED";
      if (filterState === "LATCHED") return flt.relay_state === "LATCHED" || flt.status === "FAULT LATCHED";
      if (filterState === "RESOLVED") return flt.resolution === "RESOLVED";
      if (filterState === "MAINTENANCE") return flt.fault_type?.includes("MAINTENANCE") || flt.notes?.includes("Maintenance");
      return true;
    });
  }, [faultHistory, filterState]);

  // Toggle selection with functional update on Set<number>
  const toggleChannelForReset = (chNum: number) => {
    setSelectedForReset((prev) => {
      const next = new Set(prev);
      if (next.has(chNum)) next.delete(chNum);
      else next.add(chNum);
      return next;
    });
  };

  const selectedCount = selectedForReset.size;
  const selectedList = Array.from(selectedForReset).sort((a, b) => a - b);

  return (
    <AppShell
      title="SAFETY &amp; FAULT MANAGEMENT CENTER"
      dataSource={hasLiveData ? "LIVE MQTT" : "WAITING FOR MQTT"}
      onRefresh={() => {
        refresh();
        loadHistory();
      }}
      hasActiveFault={activeFaults.length > 0}
    >
      {actionNotice && (
        <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-xs text-green-900 font-mono flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* SELECTIVE MULTI-CHANNEL RESET GATE */}
      <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs font-mono text-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-amber-800 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              SELECTIVE MULTI-CHANNEL RESET GATE
            </span>
            <p className="text-[11px] text-[#64748B] mt-1">
              Select any faulted or maintenance channel. Restores Main relay, stabilizes 250ms, then restores Aux relay.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (selectedCount > 0) {
                  setResetModalChannels(selectedList);
                }
              }}
              disabled={selectedCount === 0}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shadow-xs"
            >
              <UserCheck className="w-4 h-4 text-white" />
              <span>AUTHORIZE RESET ({selectedCount})</span>
            </button>
          </div>
        </div>

        {/* 4 Channel Selection Boxes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {[1, 2, 3, 4].map((chNum) => {
            const liveCh = channels.find((c) => c.channel === chNum);
            const isFaulted = liveCh?.status === "FAULT LATCHED" || liveCh?.status === "TRIPPED" || liveCh?.status === "CRITICAL";
            const isMaintenance = liveCh?.status === "MAINTENANCE";
            const isEligible = isFaulted || isMaintenance;
            const isChecked = selectedForReset.has(chNum);

            return (
              <div
                key={chNum}
                onClick={() => toggleChannelForReset(chNum)}
                className={`p-3.5 rounded-xl border flex items-center justify-between transition-all select-none cursor-pointer ${
                  isChecked
                    ? "bg-[#EFF6FF] border-[#2563EB] text-[#172033] shadow-xs"
                    : "bg-white border-[#CBD5E1] text-[#172033] hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleChannelForReset(chNum)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <div>
                    <div className="font-bold text-xs text-[#172033]">Channel 0{chNum}</div>
                    <div className="text-[10px] mt-0.5">
                      {isFaulted ? (
                        <span className="text-red-700 font-semibold">{liveCh?.fault || "FAULT LATCHED"}</span>
                      ) : isMaintenance ? (
                        <span className="text-blue-700 font-semibold">MAINTENANCE</span>
                      ) : (
                        <span className="text-green-700 font-semibold">NORMAL (Commanded ON)</span>
                      )}
                    </div>
                  </div>
                </div>

                {isFaulted ? (
                  <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
                ) : isMaintenance ? (
                  <PowerOff className="w-4 h-4 text-blue-600 shrink-0" />
                ) : (
                  <Check className="w-4 h-4 text-green-600/70 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* FILTERING BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3 font-mono text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {["ALL", "ACTIVE", "LATCHED", "RESOLVED", "MAINTENANCE"].map((f) => (
            <button
              key={f}
              onClick={() => setFilterState(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filterState === f
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "bg-white text-[#64748B] hover:text-[#172033] border border-[#CBD5E1]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <span className="text-[#64748B] text-[11px]">
          Showing {filteredFaults.length} events
        </span>
      </div>

      {/* PROFESSIONAL FAULT TABLE */}
      <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs font-mono">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Channel</th>
                <th className="py-2.5 px-3">Fault</th>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">State</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Authorization</th>
                <th className="py-2.5 px-3">Operator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filteredFaults.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#64748B]">
                    No fault events match filter &quot;{filterState}&quot;.
                  </td>
                </tr>
              ) : (
                filteredFaults.map((f, i) => {
                  const isResolved = f.resolution === "RESOLVED";
                  const isCritical = f.severity === "CRITICAL" || f.fault_type?.includes("OVERCURRENT");

                  return (
                    <tr key={f.id || i} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-[#64748B]">
                        {new Date(f.start_timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 text-[#172033] font-bold">CH 0{f.channel}</td>
                      <td className="py-2.5 px-3 text-red-700 font-semibold">{f.fault_type}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isCritical
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {f.severity || "CRITICAL"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isResolved
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          }`}
                        >
                          {isResolved ? "RESOLVED" : f.relay_state || "TRIPPED"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#172033]">
                        {!isResolved ? (
                          <button
                            onClick={() => setResetModalChannels([f.channel])}
                            className="px-2.5 py-1 rounded bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 text-[10px] font-bold cursor-pointer transition-colors shadow-xs"
                          >
                            RESET CH0{f.channel}
                          </button>
                        ) : (
                          <span className="text-[#94A3B8] text-[11px]">CLOSED</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[#64748B] text-[11px]">
                        {f.resolved_by ? "BIOMETRIC_FACE" : "PENDING_AUTH"}
                      </td>
                      <td className="py-2.5 px-3 text-[#172033] font-semibold">
                        {f.resolved_by || "---"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Channel Face Reset Modal */}
      {resetModalChannels !== null && (
        <FaceResetModal
          channels={resetModalChannels}
          channel={resetModalChannels[0]}
          isOpen={true}
          onClose={() => setResetModalChannels(null)}
          onSuccess={() => {
            setResetModalChannels(null);
            refresh();
            loadHistory();
          }}
        />
      )}
    </AppShell>
  );
}
