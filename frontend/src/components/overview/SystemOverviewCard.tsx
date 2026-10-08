"use client";

import React from "react";
import Link from "next/link";
import { Cpu, ShieldCheck, Terminal, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useSystemHealth } from "@/context/SystemHealthContext";

interface SystemOverviewCardProps {
  systemState: string;
  hasLiveData: boolean;
  onToggleDiagnostics?: () => void;
  showDiagnostics?: boolean;
  onToggleValidation?: () => void;
  showValidation?: boolean;
  deviceMode?: string;
  hardwareType?: string;
}

export function SystemOverviewCard({
  systemState,
  hasLiveData,
  onToggleDiagnostics,
  showDiagnostics,
  onToggleValidation,
  showValidation,
  deviceMode = "SIMULATOR",
  hardwareType = "ESP32-S3 SIMULATOR",
}: SystemOverviewCardProps) {
  const health = useSystemHealth();
  // Format state label nicely
  const normalizedState = systemState?.replace(/_/g, " ") || "UNKNOWN";
  const isSimulator = deviceMode === "SIMULATOR" || hardwareType.includes("SIMULATOR");
  
  const isHealthy =
    systemState === "FULLY OPERATIONAL" ||
    systemState === "NORMAL" ||
    systemState === "FULLY_OPERATIONAL";

  const isFault =
    systemState === "SYSTEM FAULT" ||
    systemState === "SYSTEM_FAULT" ||
    systemState === "CRITICAL FAULT";

  const isWaiting =
    systemState === "WAITING FOR HARDWARE" ||
    systemState === "WAITING_FOR_HARDWARE" ||
    systemState === "INITIALIZING";

  return (
    <div className="bg-white p-4.5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-wrap items-center justify-between gap-4 font-sans text-[#172033]">
      <div className="flex items-center gap-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isFault
              ? "bg-red-50 text-red-600 border border-red-200"
              : isHealthy
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}
        >
          {isFault ? (
            <AlertTriangle className="w-5 h-5" />
          ) : isHealthy ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <ShieldCheck className="w-5 h-5" />
          )}
        </div>

        <div>
          <span className="text-[10px] text-[#64748B] uppercase tracking-wider font-mono block">
            SYSTEM STATUS
          </span>
          <div className="flex items-center gap-2.5 mt-0.5">
            <h2 className="text-lg font-bold text-[#172033] tracking-tight font-mono">
              {normalizedState}
            </h2>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase font-mono ${
                health.dataProvenance === "LIVE_ESP32_MQTT" || health.dataProvenance === "SIMULATOR_MQTT"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : health.dataProvenance === "STALE_DEVICE_DATA"
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              {health.dataProvenanceDisplay}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
        <div>
          <span className="text-[#64748B] text-[10px] block">CONTROLLER</span>
          <span className="text-[#172033] font-bold">
            {isSimulator ? "SIMULATOR ACTIVE" : "ESP32-S3 N16R8"}
          </span>
        </div>
        <div className="h-6 w-px bg-[#E2E8F0] hidden sm:block" />
        <div>
          <span className="text-[#64748B] text-[10px] block">PHYSICAL HARDWARE</span>
          <span className={health.physicalEsp32.isOnline ? "text-green-700 font-bold" : "text-slate-600 font-bold"}>
            {health.physicalEsp32.displayStatus}
          </span>
        </div>
        <div className="h-6 w-px bg-[#E2E8F0] hidden sm:block" />
        <div>
          <span className="text-[#64748B] text-[10px] block">PROTECTION LOOP</span>
          <span className="text-green-700 font-bold">Local FreeRTOS</span>
        </div>
        <div className="h-6 w-px bg-[#E2E8F0] hidden sm:block" />

        <div className="flex items-center gap-2">
          {onToggleValidation && (
            <button
              onClick={onToggleValidation}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                showValidation
                  ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                  : "bg-slate-900 text-slate-100 border-slate-700 hover:bg-slate-800"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>{showValidation ? "HIDE VALIDATION" : "HW VALIDATION"}</span>
            </button>
          )}

          {onToggleDiagnostics && (
            <button
              onClick={onToggleDiagnostics}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                showDiagnostics
                  ? "bg-blue-50 text-blue-700 border-blue-300"
                  : "bg-white text-[#64748B] border-[#CBD5E1] hover:text-[#172033] hover:bg-slate-50"
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>{showDiagnostics ? "HIDE DIAGNOSTICS" : "DIAGNOSTICS"}</span>
            </button>
          )}

          <Link
            href="/system-health"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#F8FAFC] hover:bg-slate-100 text-blue-600 border border-[#CBD5E1] text-xs font-bold transition-colors"
          >
            <span>HEALTH CENTER &rarr;</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
