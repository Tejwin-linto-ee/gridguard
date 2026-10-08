"use client";

import React from "react";
import Link from "next/link";
import { Sliders, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import { ChannelData } from "@/types/telemetry";

interface LoadManagementSummaryCardProps {
  channels: ChannelData[];
  hasLiveData: boolean;
  loadSheddingActive?: boolean;
}

export function LoadManagementSummaryCard({
  channels,
  hasLiveData,
  loadSheddingActive = false,
}: LoadManagementSummaryCardProps) {
  // Preset priorities and eligibility based on prototype load channel model
  const channelMeta: Record<number, { priority: string; eligible: boolean }> = {
    1: { priority: "CRITICAL", eligible: false },
    2: { priority: "HIGH", eligible: false },
    3: { priority: "MEDIUM", eligible: true },
    4: { priority: "LOW", eligible: true },
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between space-y-4 font-sans text-[#172033]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wide font-mono">
              Load Management &amp; Priority
            </h3>
            <p className="text-[11px] text-[#64748B]">
              Deterministic Automated Load Shedding Scheme
            </p>
          </div>
        </div>

        <Link
          href="/load-management"
          className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 font-mono transition-colors"
        >
          <span>MANAGE</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Active Shedding Banner if engaged */}
      {loadSheddingActive && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between text-xs font-mono text-amber-900">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>LOAD SHEDDING ACTIVE:</strong> Non-essential channels shed.
            </span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
            SHEDDING ENGAGED
          </span>
        </div>
      )}

      {/* 4 Channel Loading Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] text-[10px]">
              <th className="py-2 px-2.5">CHANNEL</th>
              <th className="py-2 px-2.5">PRIORITY</th>
              <th className="py-2 px-2.5 text-right">VOLTAGE</th>
              <th className="py-2 px-2.5 text-right">CURRENT</th>
              <th className="py-2 px-2.5 text-right">APPARENT (VA)</th>
              <th className="py-2 px-2.5 text-center">RELAY</th>
              <th className="py-2 px-2.5 text-right">ELIGIBILITY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {channels.map((ch) => {
              const meta = channelMeta[ch.channel] || { priority: "MEDIUM", eligible: true };
              const apparentPowerVa =
                hasLiveData && ch.voltage != null && ch.current != null
                  ? (ch.voltage * ch.current).toFixed(1)
                  : "---";

              return (
                <tr key={ch.channel} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2 px-2.5 font-bold text-[#172033]">CH 0{ch.channel}</td>
                  <td className="py-2 px-2.5">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                        meta.priority === "CRITICAL"
                          ? "bg-purple-50 text-purple-700 border-purple-200"
                          : meta.priority === "HIGH"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : meta.priority === "MEDIUM"
                          ? "bg-slate-100 text-slate-700 border-slate-200"
                          : "bg-slate-50 text-slate-500 border-slate-200"
                      }`}
                    >
                      {meta.priority}
                    </span>
                  </td>
                  <td className="py-2 px-2.5 text-right tabular-nums text-[#64748B]">
                    {hasLiveData && ch.voltage != null ? `${ch.voltage.toFixed(1)} V` : "--- V"}
                  </td>
                  <td className="py-2 px-2.5 text-right tabular-nums text-[#64748B]">
                    {hasLiveData && ch.current != null ? `${ch.current.toFixed(2)} A` : "--- A"}
                  </td>
                  <td className="py-2 px-2.5 text-right tabular-nums font-bold text-[#172033]">
                    {apparentPowerVa !== "---" ? `${apparentPowerVa} VA` : "--- VA"}
                  </td>
                  <td className="py-2 px-2.5 text-center">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                        ch.main_relay === true
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {ch.main_relay == null ? "N/A" : ch.main_relay ? "ON" : "OFF"}
                    </span>
                  </td>
                  <td className="py-2 px-2.5 text-right">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                        meta.eligible
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-green-50 text-green-700 border-green-200"
                      }`}
                    >
                      {meta.eligible ? "SHEDDABLE" : "PROTECTED"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
