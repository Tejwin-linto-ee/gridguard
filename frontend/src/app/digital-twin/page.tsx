"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FixedSingleLineDiagram } from "@/components/digital-twin/FixedSingleLineDiagram";
import { ScadaArchitectureSection } from "@/components/digital-twin/ScadaArchitectureSection";
import { ComponentInspectorDrawer, InspectedNode } from "@/components/digital-twin/ComponentInspectorDrawer";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { FaceResetModal } from "@/components/faults/FaceResetModal";
import { api } from "@/lib/api";
import { SystemHealthData } from "@/types/telemetry";
import {
  Activity,
  Layers,
  AlertTriangle,
  ShieldCheck,
  Maximize2,
  Minimize2,
  RotateCcw,
  Eye,
  Info,
  CheckCircle2,
} from "lucide-react";

export default function DigitalTwinPage() {
  const {
    system,
    channels,
    refresh,
    hasLiveData,
    mqttConnected,
    deviceOnline,
    packetAgeSec,
  } = useLiveTelemetry();

  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set());
  const [focusedChannel, setFocusedChannel] = useState<number | null>(null);
  const [inspectedNode, setInspectedNode] = useState<InspectedNode | null>(null);
  const [resetModalChannel, setResetModalChannel] = useState<number | null>(null);
  const [healthData, setHealthData] = useState<SystemHealthData | null>(null);

  const mainContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fetch real system health data
  const loadHealth = useCallback(async () => {
    try {
      const data = await api.getSystemHealth();
      setHealthData(data);
    } catch {
      // Backend may be offline or unreachable
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 5000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  const toggleChannelSelection = (chId: number) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(chId)) {
        next.delete(chId);
      } else {
        next.add(chId);
      }
      return next;
    });
  };

  const toggleFullscreen = () => {
    if (!mainContainerRef.current) return;
    if (!document.fullscreenElement) {
      mainContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleFitView = () => {
    if (mainContainerRef.current) {
      mainContainerRef.current.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  };

  const handleResetView = () => {
    setFocusedChannel(null);
    setSelectedChannels(new Set());
    if (mainContainerRef.current) {
      mainContainerRef.current.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  };

  // Determine authoritative Live Status
  const isDemoMode = system?.data_source === "DEMONSTRATION" || system?.data_source === "DEMO";
  const isStale = hasLiveData && packetAgeSec != null && packetAgeSec > 10;

  return (
    <AppShell
      title="GRIDGUARD DIGITAL TWIN — SINGLE-LINE DIAGRAM (SLD)"
      dataSource={system.data_source}
      onRefresh={refresh}
    >
      <div ref={mainContainerRef} className="space-y-5 font-sans text-[#172033]">
        {/* ============================================================== */}
        {/* SECTION A: HEADER / TITLE / LIVE STATUS / CONTROLS              */}
        {/* ============================================================== */}
        <div className="bg-white p-5 border border-[#D9E1EA] rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-widest font-mono">
                GRIDGUARD
              </span>
              <span className="text-slate-300">&bull;</span>
              <h1 className="text-sm font-bold text-[#172033] uppercase tracking-wide font-mono">
                DIGITAL TWIN / SINGLE-LINE DIAGRAM (SLD)
              </h1>
            </div>
            <p className="text-xs text-[#64748B]">
              Real-Time Monitoring | Protection | Smart Assistance
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Live Status Badge */}
            <div className="font-mono text-xs">
              {isDemoMode ? (
                <div className="px-3 py-1.5 rounded-lg border bg-purple-50 text-purple-700 border-purple-200 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                  <span>● DEMONSTRATION MODE (SIMULATED DATA)</span>
                </div>
              ) : isStale ? (
                <div className="px-3 py-1.5 rounded-lg border bg-amber-50 text-amber-800 border-amber-200 font-bold flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>⚠ TELEMETRY STALE ({packetAgeSec?.toFixed(0)}s)</span>
                </div>
              ) : hasLiveData ? (
                <div className="px-3 py-1.5 rounded-lg border bg-green-50 text-green-700 border-green-200 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-600" />
                  <span>● LIVE MQTT SYNCHRONIZED</span>
                </div>
              ) : (
                <div className="px-3 py-1.5 rounded-lg border bg-slate-100 text-slate-600 border-slate-200 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>○ NO LIVE DATA (DISCONNECTED)</span>
                </div>
              )}
            </div>

            {/* Global View Controls */}
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <button
                onClick={handleFitView}
                className="px-2.5 py-1.5 rounded-lg border border-[#D9E1EA] bg-[#F8FAFC] text-[#172033] hover:bg-slate-100 font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
                title="Scroll to top-center of Single-Line Diagram"
              >
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                <span>FIT VIEW</span>
              </button>
              <button
                onClick={handleResetView}
                className="px-2.5 py-1.5 rounded-lg border border-[#D9E1EA] bg-[#F8FAFC] text-[#172033] hover:bg-slate-100 font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
                title="Reset channel selection and filters"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                <span>RESET VIEW</span>
              </button>
              <button
                onClick={toggleFullscreen}
                className="px-2.5 py-1.5 rounded-lg border border-[#D9E1EA] bg-[#F8FAFC] text-[#172033] hover:bg-slate-100 font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-slate-600" />
                    <span>EXIT FULLSCREEN</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
                    <span>FULLSCREEN</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Demo Mode Notice Banner if Active */}
        {isDemoMode && (
          <div className="bg-purple-50 border border-purple-200 p-3.5 rounded-xl text-purple-900 text-xs font-mono flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-purple-600 shrink-0" />
              <span>
                <strong>DEMONSTRATION MODE:</strong> SIMULATED DATA — NOT LIVE HARDWARE TELEMETRY. PHYSICAL MQTT COMMANDS AND DATABASE MUTATIONS ARE INHIBITED.
              </span>
            </div>
            <span className="font-bold text-[10px] bg-purple-200 px-2 py-0.5 rounded text-purple-800">
              SAFE SANDBOX
            </span>
          </div>
        )}

        {/* Channel Selection & Biometric Reset Toolbar Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#F8FAFC] border border-[#D9E1EA] font-mono text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="w-4 h-4 text-[#64748B]" />
            <span className="text-[11px] text-[#64748B] font-bold">SELECT CHANNEL:</span>
            {[1, 2, 3, 4].map((chId) => {
              const ch = channels.find((c) => c.channel === chId);
              const isSelected = selectedChannels.has(chId);
              const isTripped = ch?.status === "TRIPPED" || ch?.status === "FAULT LATCHED";

              return (
                <button
                  key={chId}
                  onClick={() => toggleChannelSelection(chId)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-xs"
                      : isTripped
                      ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                      : "bg-white border border-[#CBD5E1] text-[#172033] hover:bg-slate-50"
                  }`}
                >
                  {isTripped && <AlertTriangle className="w-3 h-3 text-red-600" />}
                  <span>CHANNEL 0{chId}</span>
                  {isSelected && <span className="text-[9px] bg-blue-700 px-1 rounded">&check;</span>}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {selectedChannels.size > 0 && (
              <button
                onClick={() => {
                  const firstSelected = Array.from(selectedChannels)[0];
                  setResetModalChannel(firstSelected);
                }}
                className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>RESET SELECTED ({selectedChannels.size})</span>
              </button>
            )}
            <div className="text-[10px] text-[#64748B]">
              Click any SLD component to inspect technical specs &amp; diagnostics
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION B: ELECTRICAL SINGLE-LINE DIAGRAM (SLD)                 */}
        {/* ============================================================== */}
        <FixedSingleLineDiagram
          system={system}
          channels={channels}
          selectedChannels={selectedChannels}
          onChannelSelect={toggleChannelSelection}
          onInspectNode={(node) => setInspectedNode(node)}
          hasLiveData={hasLiveData}
          packetAgeSec={packetAgeSec}
        />

        {/* ============================================================== */}
        {/* SECTION C & D: COMMUNICATION ARCHITECTURE & SYSTEM STATUS       */}
        {/* ============================================================== */}
        <ScadaArchitectureSection
          health={healthData}
          hasLiveData={hasLiveData}
          mqttConnected={mqttConnected}
          packetAgeSec={packetAgeSec}
          onInspectNode={(node) => setInspectedNode(node)}
        />

        {/* Engineering Architecture & Synchronization Standards Footnotes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="bg-white p-4 border border-[#D9E1EA] rounded-xl shadow-xs space-y-2">
            <div className="font-bold text-[#172033] uppercase text-[11px] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>DIGITAL TWIN SYNCHRONIZATION RULES</span>
            </div>
            <p className="text-[#64748B] leading-relaxed text-[11px]">
              Authoritative edge telemetry is streamed from the ESP32-S3 over TLS 8883 MQTT and FastAPI WebSocket. If an overcurrent fault occurs, the hardware trips both series relays in &lt;10 ms. The Single-Line Diagram updates its state indicators immediately without moving any components.
            </p>
          </div>

          <div className="bg-white p-4 border border-[#D9E1EA] rounded-xl shadow-xs space-y-2">
            <div className="font-bold text-[#172033] uppercase text-[11px] flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600" />
              <span>SERIES &amp; PARALLEL SENSOR TOPOLOGY</span>
            </div>
            <p className="text-[#64748B] leading-relaxed text-[11px]">
              The PZEM-004T monitors bulk AC mains input. Each prototype load channel branches in parallel from the Live Bus, passing through Main and Auxiliary relays, with an ACS712 Hall-effect sensor in series. ZMPT101B voltage sensors are wired in parallel across Channel Live and Neutral.
            </p>
          </div>
        </div>
      </div>

      {/* Component Detail Inspector Drawer */}
      <ComponentInspectorDrawer
        node={inspectedNode}
        onClose={() => setInspectedNode(null)}
        system={system}
        channels={channels}
        packetAgeSec={packetAgeSec}
        hasLiveData={hasLiveData}
      />

      {/* Server-Authoritative Biometric Reset Modal */}
      {resetModalChannel !== null && (
        <FaceResetModal
          channel={resetModalChannel}
          isOpen={true}
          onClose={() => setResetModalChannel(null)}
          onSuccess={() => {
            setResetModalChannel(null);
            refresh();
          }}
        />
      )}
    </AppShell>
  );
}
