"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ArrowRight } from "lucide-react";

interface LiveTelemetryBannerProps {
  hasLiveData: boolean;
  packetAgeSec?: number | null;
  latencyMs?: number | null;
  esp32Status?: "ONLINE" | "OFFLINE";
  lastHeartbeatAgeSec?: number | null;
  mqttConnected?: boolean;
  deviceMode?: string;
  hardwareType?: string;
  connectionStatus?: string;
}

export function LiveTelemetryBanner({
  hasLiveData,
  packetAgeSec,
  latencyMs,
  esp32Status = "OFFLINE",
  lastHeartbeatAgeSec,
  mqttConnected = false,
  deviceMode = "SIMULATOR",
  hardwareType = "ESP32-S3 SIMULATOR",
  connectionStatus,
}: LiveTelemetryBannerProps) {
  const [expanded, setExpanded] = useState(false);

  const isOnline = esp32Status === "ONLINE";
  const isSimulator = deviceMode === "SIMULATOR" || hardwareType.includes("SIMULATOR");
  const isStale = hasLiveData && packetAgeSec != null && packetAgeSec > 10;

  const effectiveConnStatus =
    connectionStatus ||
    (!hasLiveData && packetAgeSec == null
      ? "WAITING_FOR_DEVICE"
      : isStale
      ? "STALE"
      : isOnline
      ? "ONLINE"
      : "OFFLINE");

  const hbDisplay =
    lastHeartbeatAgeSec != null && lastHeartbeatAgeSec >= 0 && lastHeartbeatAgeSec < 86400
      ? `${lastHeartbeatAgeSec.toFixed(1)}s ago`
      : "No heartbeat";

  const dotColor =
    effectiveConnStatus === "ONLINE"
      ? "bg-[#16A34A]"
      : effectiveConnStatus === "STALE"
      ? "bg-amber-500 animate-pulse"
      : "bg-[#DC2626] animate-pulse";

  const bannerBg =
    isOnline && hasLiveData && !isStale
      ? "bg-green-50/70 border-green-200"
      : isStale
      ? "bg-amber-50/80 border-amber-300"
      : "bg-[#FFFBEB] border-amber-200";

  // Short summary label for collapsed mobile view
  const summaryLabel = isSimulator
    ? "SIMULATOR ACTIVE"
    : isOnline
    ? "ESP32 ONLINE"
    : "WAITING FOR DEVICE";

  const modeColor = isOnline
    ? "text-green-800"
    : isSimulator
    ? "text-purple-800"
    : "text-amber-900";

  return (
    <div className={`rounded-xl border font-sans transition-colors ${bannerBg}`}>
      {/* ── Always-visible compact row ── */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
          <span className={`text-xs font-bold font-mono truncate ${modeColor}`}>
            {summaryLabel}
          </span>
          {/* MQTT pill — always visible */}
          <span
            className={`hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono shrink-0 ${
              mqttConnected
                ? "bg-white text-green-700 border-green-300"
                : "bg-white text-red-600 border-red-300"
            }`}
          >
            MQTT: {mqttConnected ? "OK" : "OFF"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isOnline && (
            <Link
              href="/demo"
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-[11px] transition-colors"
            >
              <span>Demo</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
          {/* Expand/collapse toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#172033] hover:bg-black/5 transition-colors"
            aria-label={expanded ? "Collapse details" : "Expand details"}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Expanded detail section ── */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-black/5 pt-2.5 space-y-2">
          {/* Badge pills — all visible when expanded */}
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${
              deviceMode === "SIMULATOR"
                ? "bg-purple-100 text-purple-800 border-purple-300"
                : "bg-blue-100 text-blue-800 border-blue-300"
            }`}>
              MODE: {deviceMode?.replace(/_/g, " ") ?? "SIMULATOR"}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${
              isOnline ? "bg-green-100 text-green-800 border-green-300" : "bg-slate-100 text-slate-700 border-slate-300"
            }`}>
              ESP32: {isOnline ? "ONLINE" : "NOT CONNECTED"}
            </span>
            {isSimulator && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded border font-mono bg-blue-100 text-blue-800 border-blue-300">
                SIM: {hasLiveData ? "ONLINE" : "STANDBY"}
              </span>
            )}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${
              mqttConnected
                ? "bg-white text-green-700 border-green-300"
                : "bg-white text-red-700 border-red-300"
            }`}>
              MQTT: {mqttConnected ? "CONNECTED" : "DISCONNECTED"}
            </span>
          </div>

          {/* Technical detail line */}
          <p className="text-[11px] text-[#64748B] font-mono">
            Last heartbeat: <strong className="text-[#172033]">{hbDisplay}</strong>
            <span className="hidden sm:inline"> • ESP32-S3 → HiveMQ (TLS 8883) → Node-RED → FastAPI</span>
          </p>

          {/* Demo link for mobile */}
          {!isOnline && (
            <Link
              href="/demo"
              className="sm:hidden inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-xs transition-colors"
            >
              Exhibition Demo <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
