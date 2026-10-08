"use client";

import React, { useRef, useState } from "react";
import {
  Zap,
  ShieldCheck,
  Activity,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  Eye,
  Info,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { ChannelData, SystemTelemetry } from "@/types/telemetry";
import { InspectedNode } from "./ComponentInspectorDrawer";

interface FixedSingleLineDiagramProps {
  system: SystemTelemetry;
  channels: ChannelData[];
  selectedChannels?: Set<number>;
  onChannelSelect?: (channelId: number) => void;
  onInspectNode: (node: InspectedNode) => void;
  hasLiveData?: boolean;
  packetAgeSec?: number | null;
}

export function FixedSingleLineDiagram({
  system,
  channels,
  selectedChannels,
  onChannelSelect,
  onInspectNode,
  hasLiveData = false,
  packetAgeSec,
}: FixedSingleLineDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleFitView = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, top: 0, behavior: "smooth" });
    }
  };

  const handleResetView = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, top: 0, behavior: "auto" });
    }
  };

  // Helper to format values with zero fabrication
  const formatVoltage = (v: number | null | undefined) =>
    v != null && !isNaN(v) ? `${v.toFixed(1)} V` : "--- V";
  const formatCurrent = (i: number | null | undefined) =>
    i != null && !isNaN(i) ? `${i.toFixed(2)} A` : "--- A";
  const formatFrequency = (f: number | null | undefined) =>
    f != null && !isNaN(f) ? `${f.toFixed(2)} Hz` : "--- Hz";
  const formatPower = (p: number | null | undefined) =>
    p != null && !isNaN(p) ? `${p.toFixed(1)} W` : "--- W";
  const formatEnergy = (e: number | null | undefined) =>
    e != null && !isNaN(e) ? `${e.toFixed(3)} kWh` : "--- kWh";
  const formatPf = (pf: number | null | undefined) =>
    pf != null && !isNaN(pf) ? pf.toFixed(2) : "--- PF";
  const formatVa = (v: number | null | undefined, i: number | null | undefined) =>
    v != null && i != null && !isNaN(v) && !isNaN(i) ? `${(v * i).toFixed(1)} VA` : "--- VA";

  // Channel X-coordinates for exact fixed parallel alignment (4 columns)
  const channelCols = [
    { chId: 1, cx: 180 },
    { chId: 2, cx: 480 },
    { chId: 3, cx: 780 },
    { chId: 4, cx: 1080 },
  ];

  return (
    <div
      ref={containerRef}
      className={`bg-white border border-[#D9E1EA] rounded-xl shadow-xs overflow-hidden flex flex-col font-sans transition-all ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none h-screen w-screen p-4 overflow-auto bg-[#F5F7FA]" : ""
      }`}
    >
      {/* 1. SLD Header & Action Toolbar */}
      <div className="bg-[#FFFFFF] px-5 py-3.5 border-b border-[#D9E1EA] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-[#172033] uppercase tracking-wider font-mono">
                ELECTRICAL SINGLE-LINE DIAGRAM (SLD)
              </h2>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                SCADA MIMIC
              </span>
            </div>
            <p className="text-[11px] text-[#64748B] mt-0.5">
              Fixed Topology &bull; 4 Parallel Prototype Load Channels &bull; Series ACS712 &bull; Parallel ZMPT101B
            </p>
          </div>
        </div>

        {/* View Controls */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={handleFitView}
            className="px-2.5 py-1.5 rounded-lg border border-[#D9E1EA] bg-[#F8FAFC] text-[#172033] hover:bg-slate-100 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Restore predefined layout"
          >
            <Eye className="w-3.5 h-3.5 text-blue-600" />
            <span>FIT VIEW</span>
          </button>
          <button
            onClick={handleResetView}
            className="px-2.5 py-1.5 rounded-lg border border-[#D9E1EA] bg-[#F8FAFC] text-[#172033] hover:bg-slate-100 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Restore initial viewport"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
            <span>RESET VIEW</span>
          </button>
          <button
            onClick={toggleFullscreen}
            className="px-2.5 py-1.5 rounded-lg border border-[#D9E1EA] bg-[#F8FAFC] text-[#172033] hover:bg-slate-100 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Toggle fullscreen view"
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

      {/* 2. Compact Engineering Legend */}
      <div className="bg-[#F8FAFC] px-5 py-2 border-b border-[#D9E1EA] flex flex-wrap items-center justify-between gap-3 text-[10px] text-[#64748B] font-mono">
        <div className="flex items-center gap-1.5 font-bold text-[#172033]">
          <Layers className="w-3.5 h-3.5 text-blue-600" />
          <span>LEGEND:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full border border-blue-600 flex items-center justify-center text-[7px] text-blue-600 font-bold">~</span>
            <span>AC Source</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-blue-100 border border-blue-300 text-[7px] flex items-center justify-center font-bold text-blue-700">M</span>
            <span>Energy Meter</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 border-t-2 border-green-600 block" />
            <span>Main/Aux Relay</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-slate-100 border border-slate-300 text-[7px] flex items-center justify-center font-bold text-slate-700">I</span>
            <span>ACS712 (Series Current)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-blue-50 border border-blue-300 text-[7px] flex items-center justify-center font-bold text-blue-700">V</span>
            <span>ZMPT101B (Parallel Voltage)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-100 border border-amber-400 text-[7px] flex items-center justify-center font-bold text-amber-700">L</span>
            <span>Prototype Load</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-1 bg-[#2563EB] rounded-full" />
            <span>Live Conductor (L)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-1 bg-[#64748B] rounded-full" />
            <span>Neutral Conductor (N)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#172033]" />
            <span>Connection Node</span>
          </div>
        </div>
      </div>

      {/* 3. Primary Electrical SLD Mimic Canvas (Fixed Coordinates SVG) */}
      <div className="relative w-full overflow-x-auto bg-[#F5F7FA] p-4 select-none">
        <div className="min-w-[1260px] mx-auto">
          <svg
            viewBox="0 0 1260 840"
            className="w-full h-auto block"
            style={{ minHeight: "780px" }}
          >
            <defs>
              <filter id="subtleShadow" x="-5%" y="-5%" width="110%" height="115%">
                <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.06" />
              </filter>
            </defs>

            {/* ============================================================== */}
            {/* STAGE 1: AC INPUT (TOP-CENTER)                                */}
            {/* ============================================================== */}
            <g
              id="ac-input"
              className="cursor-pointer group"
              onClick={() =>
                onInspectNode({
                  type: "AC_MAINS",
                  title: "AC Mains Single Phase Grid Feed",
                  subtitle: "230 V RMS / 50 Hz Nominal AC Supply",
                })
              }
            >
              {/* Box */}
              <rect
                x="470"
                y="15"
                width="320"
                height="64"
                rx="8"
                fill="#FFFFFF"
                stroke="#D9E1EA"
                strokeWidth="1.5"
                filter="url(#subtleShadow)"
                className="group-hover:stroke-blue-500 transition-colors"
              />
              {/* AC Symbol Circle */}
              <circle cx="505" cy="47" r="16" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5" />
              <text x="505" y="52" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#2563EB" fontFamily="sans-serif">
                ~
              </text>
              {/* Header Text */}
              <text x="532" y="36" fontSize="11" fontWeight="bold" fill="#172033" fontFamily="monospace">
                AC INPUT (SINGLE PHASE)
              </text>
              <text x="532" y="51" fontSize="9" fill="#64748B" fontFamily="monospace">
                NOMINAL: 230 V / 50.0 Hz
              </text>
              <text x="532" y="66" fontSize="9" fontWeight="bold" fill={hasLiveData ? "#16A34A" : "#64748B"} fontFamily="monospace">
                LIVE: {formatVoltage(system.voltage)} &bull; {formatFrequency(system.frequency)}
              </text>
            </g>

            {/* Vertical conductor from AC Input to PZEM */}
            <line x1="630" y1="79" x2="630" y2="105" stroke="#2563EB" strokeWidth="2.5" />
            <circle cx="630" cy="79" r="3.5" fill="#172033" />
            <circle cx="630" cy="105" r="3.5" fill="#172033" />

            {/* ============================================================== */}
            {/* STAGE 2: PZEM-004T V3.0 SYSTEM METER                          */}
            {/* ============================================================== */}
            <g
              id="pzem"
              className="cursor-pointer group"
              onClick={() =>
                onInspectNode({
                  type: "PZEM",
                  title: "PZEM-004T V3.0 System Meter",
                  subtitle: "AC Real-Time Power, Voltage, Current & Energy Sensing",
                })
              }
            >
              <rect
                x="410"
                y="105"
                width="440"
                height="80"
                rx="8"
                fill="#FFFFFF"
                stroke="#D9E1EA"
                strokeWidth="1.5"
                filter="url(#subtleShadow)"
                className="group-hover:stroke-blue-500 transition-colors"
              />
              {/* Header inside PZEM card */}
              <rect x="410" y="105" width="440" height="24" rx="8" fill="#F8FAFC" />
              <text x="424" y="121" fontSize="10" fontWeight="bold" fill="#172033" fontFamily="monospace">
                PZEM-004T V3.0 SYSTEM METER
              </text>
              <rect
                x="745"
                y="110"
                width="95"
                height="14"
                rx="4"
                fill={hasLiveData ? "#DCFCE7" : "#F1F5F9"}
              />
              <text
                x="792"
                y="120"
                textAnchor="middle"
                fontSize="8"
                fontWeight="bold"
                fill={hasLiveData ? "#16A34A" : "#64748B"}
                fontFamily="monospace"
              >
                {hasLiveData ? "● LIVE MQTT" : "○ NO LIVE DATA"}
              </text>

              {/* Parameter Columns (6 electrical readings) */}
              {/* 1. Voltage */}
              <text x="440" y="146" fontSize="8" fill="#64748B" fontFamily="monospace">VOLTAGE</text>
              <text x="440" y="165" fontSize="12" fontWeight="bold" fill="#172033" fontFamily="monospace">
                {formatVoltage(system.voltage)}
              </text>

              {/* 2. Current */}
              <text x="515" y="146" fontSize="8" fill="#64748B" fontFamily="monospace">CURRENT</text>
              <text x="515" y="165" fontSize="12" fontWeight="bold" fill="#172033" fontFamily="monospace">
                {formatCurrent(system.current)}
              </text>

              {/* 3. Active Power */}
              <text x="585" y="146" fontSize="8" fill="#64748B" fontFamily="monospace">POWER</text>
              <text x="585" y="165" fontSize="12" fontWeight="bold" fill="#2563EB" fontFamily="monospace">
                {formatPower(system.power)}
              </text>

              {/* 4. Energy */}
              <text x="655" y="146" fontSize="8" fill="#64748B" fontFamily="monospace">ENERGY</text>
              <text x="655" y="165" fontSize="11" fontWeight="bold" fill="#172033" fontFamily="monospace">
                {formatEnergy(system.energy)}
              </text>

              {/* 5. Frequency */}
              <text x="735" y="146" fontSize="8" fill="#64748B" fontFamily="monospace">FREQ</text>
              <text x="735" y="165" fontSize="11" fontWeight="bold" fill="#172033" fontFamily="monospace">
                {formatFrequency(system.frequency)}
              </text>

              {/* 6. Power Factor */}
              <text x="795" y="146" fontSize="8" fill="#64748B" fontFamily="monospace">PF</text>
              <text x="795" y="165" fontSize="11" fontWeight="bold" fill="#172033" fontFamily="monospace">
                {formatPf(system.power_factor)}
              </text>
            </g>

            {/* Vertical conductor from PZEM down to Live Bus */}
            <line x1="630" y1="185" x2="630" y2="225" stroke="#2563EB" strokeWidth="2.5" />
            <circle cx="630" cy="185" r="3.5" fill="#172033" />
            <circle cx="630" cy="225" r="4.5" fill="#172033" />

            {/* ============================================================== */}
            {/* STAGE 3: HORIZONTAL LIVE BUS (L)                              */}
            {/* ============================================================== */}
            <g id="live-bus">
              {/* Heavy copper Live Busbar */}
              <line x1="120" y1="225" x2="1140" y2="225" stroke="#2563EB" strokeWidth="6" strokeLinecap="round" />
              {/* Bus Label Badge */}
              <rect x="555" y="213" width="150" height="24" rx="5" fill="#1E40AF" />
              <text x="630" y="229" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#FFFFFF" fontFamily="monospace">
                LIVE BUS (L) &bull; 230V
              </text>

              {/* 4 Connection Junction Nodes to the 4 Channels */}
              {channelCols.map((c) => (
                <circle key={`node-${c.chId}`} cx={c.cx} cy="225" r="5" fill="#172033" stroke="#FFFFFF" strokeWidth="1.5" />
              ))}
            </g>

            {/* ============================================================== */}
            {/* STAGE 4: FOUR PARALLEL PROTOTYPE LOAD CHANNELS (CH1 - CH4)     */}
            {/* ============================================================== */}
            {channelCols.map(({ chId, cx }) => {
              const ch = channels.find((c) => c.channel === chId);
              const isSelected = selectedChannels?.has(chId);
              const isTripped = ch?.status === "TRIPPED" || ch?.status === "FAULT LATCHED";
              const isWarning = ch?.status === "WARNING";
              const mainClosed = ch?.main_relay === true;
              const auxClosed = ch?.aux_relay === true;
              const isEnergized = ch?.load_active && mainClosed && auxClosed;

              // Channel Status configuration
              let statusLabel = "NO DATA";
              let statusBg = "#F1F5F9";
              let statusText = "#64748B";
              let statusBorder = "#CBD5E1";
              let branchWireColor = "#2563EB";

              if (hasLiveData) {
                if (isTripped) {
                  statusLabel = "FAULT";
                  statusBg = "#FEE2E2";
                  statusText = "#DC2626";
                  statusBorder = "#FCA5A5";
                  branchWireColor = "#DC2626";
                } else if (isWarning) {
                  statusLabel = "WARNING";
                  statusBg = "#FEF3C7";
                  statusText = "#D97706";
                  statusBorder = "#FCD34D";
                  branchWireColor = "#D97706";
                } else {
                  statusLabel = "NORMAL";
                  statusBg = "#DCFCE7";
                  statusText = "#16A34A";
                  statusBorder = "#86EFAC";
                  branchWireColor = "#2563EB";
                }
              }

              // Card boundary coordinates: fixed width 260px, centered around cx
              const cardX = cx - 130;
              const cardWidth = 260;

              return (
                <g key={`ch-${chId}`} id={`channel-${chId}`}>
                  {/* Vertical drop line from Live Bus to Channel Panel */}
                  <line x1={cx} y1="225" x2={cx} y2="255" stroke={branchWireColor} strokeWidth="2.5" />
                  <circle cx={cx} cy="255" r="3.5" fill="#172033" />

                  {/* Channel Main Container Card (Fixed Coordinate Boundary) */}
                  <rect
                    x={cardX}
                    y="255"
                    width={cardWidth}
                    height="470"
                    rx="10"
                    fill="#FFFFFF"
                    stroke={isSelected ? "#2563EB" : isTripped ? "#FCA5A5" : "#D9E1EA"}
                    strokeWidth={isSelected ? "2.5" : "1.5"}
                    filter="url(#subtleShadow)"
                  />

                  {/* Channel Header */}
                  <rect x={cardX} y="255" width={cardWidth} height="32" rx="10" fill="#F8FAFC" />
                  <line x1={cardX} y1="287" x2={cardX + cardWidth} y2="287" stroke="#E2E8F0" strokeWidth="1" />
                  <text x={cardX + 14} y="275" fontSize="11" fontWeight="bold" fill="#172033" fontFamily="monospace">
                    CHANNEL 0{chId}
                  </text>
                  <rect
                    x={cardX + cardWidth - 80}
                    y="263"
                    width="68"
                    height="17"
                    rx="4"
                    fill={statusBg}
                    stroke={statusBorder}
                    strokeWidth="0.8"
                  />
                  <text
                    x={cardX + cardWidth - 46}
                    y="275"
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="bold"
                    fill={statusText}
                    fontFamily="monospace"
                  >
                    {statusLabel}
                  </text>

                  {/* -------------------------------------------------------- */}
                  {/* COMPONENT 1: MAIN RELAY (Series Switched)               */}
                  {/* -------------------------------------------------------- */}
                  <g
                    className="cursor-pointer group"
                    onClick={() =>
                      onInspectNode({
                        type: "MAIN_RELAY",
                        channelId: chId,
                        title: `Main Relay — Channel 0${chId}`,
                        subtitle: "Primary Hardware Disconnect",
                      })
                    }
                  >
                    <rect
                      x={cardX + 16}
                      y="297"
                      width="150"
                      height="46"
                      rx="6"
                      fill="#F8FAFC"
                      stroke="#D9E1EA"
                      strokeWidth="1"
                      className="group-hover:stroke-blue-500 transition-colors"
                    />
                    <text x={cardX + 24} y="312" fontSize="9" fontWeight="bold" fill="#172033" fontFamily="monospace">
                      MAIN RELAY
                    </text>
                    <text x={cardX + 24} y="325" fontSize="8" fill="#64748B" fontFamily="monospace">
                      CMD:{" "}
                      <tspan fontWeight="bold" fill={mainClosed ? "#16A34A" : "#DC2626"}>
                        {ch?.main_relay != null ? (mainClosed ? "ON (CLOSED)" : "OFF (OPEN)") : "---"}
                      </tspan>
                    </text>
                    <text x={cardX + 24} y="336" fontSize="7" fill="#94A3B8" fontFamily="monospace">
                      FEEDBACK: NOT AVAILABLE
                    </text>

                    {/* IEC Relay Switch Graphic */}
                    <circle cx={cardX + 144} cy="312" r="3" fill="#172033" />
                    <circle cx={cardX + 144} cy="330" r="3" fill="#172033" />
                    <line
                      x1={cardX + 144}
                      y1="312"
                      x2={mainClosed ? cardX + 144 : cardX + 152}
                      y2={mainClosed ? 330 : 324}
                      stroke={mainClosed ? "#16A34A" : "#DC2626"}
                      strokeWidth="2"
                    />
                  </g>

                  {/* Drop line between Main Relay and Aux Relay */}
                  <line x1={cx - 40} y1="343" x2={cx - 40} y2="357" stroke={branchWireColor} strokeWidth="2" />
                  <circle cx={cx - 40} cy="343" r="2.5" fill="#172033" />
                  <circle cx={cx - 40} cy="357" r="2.5" fill="#172033" />

                  {/* -------------------------------------------------------- */}
                  {/* COMPONENT 2: AUXILIARY RELAY (Series Redundant)         */}
                  {/* -------------------------------------------------------- */}
                  <g
                    className="cursor-pointer group"
                    onClick={() =>
                      onInspectNode({
                        type: "AUX_RELAY",
                        channelId: chId,
                        title: `Auxiliary Relay — Channel 0${chId}`,
                        subtitle: "Secondary Redundant Protection Switch",
                      })
                    }
                  >
                    <rect
                      x={cardX + 16}
                      y="357"
                      width="150"
                      height="46"
                      rx="6"
                      fill="#F8FAFC"
                      stroke="#D9E1EA"
                      strokeWidth="1"
                      className="group-hover:stroke-blue-500 transition-colors"
                    />
                    <text x={cardX + 24} y="372" fontSize="9" fontWeight="bold" fill="#172033" fontFamily="monospace">
                      AUX RELAY
                    </text>
                    <text x={cardX + 24} y="385" fontSize="8" fill="#64748B" fontFamily="monospace">
                      CMD:{" "}
                      <tspan fontWeight="bold" fill={auxClosed ? "#16A34A" : "#DC2626"}>
                        {ch?.aux_relay != null ? (auxClosed ? "ON (CLOSED)" : "OFF (OPEN)") : "---"}
                      </tspan>
                    </text>
                    <text x={cardX + 24} y="396" fontSize="7" fill="#94A3B8" fontFamily="monospace">
                      FEEDBACK: NOT AVAILABLE
                    </text>

                    {/* IEC Relay Switch Graphic */}
                    <circle cx={cardX + 144} cy="372" r="3" fill="#172033" />
                    <circle cx={cardX + 144} cy="390" r="3" fill="#172033" />
                    <line
                      x1={cardX + 144}
                      y1="372"
                      x2={auxClosed ? cardX + 144 : cardX + 152}
                      y2={auxClosed ? 390 : 384}
                      stroke={auxClosed ? "#16A34A" : "#DC2626"}
                      strokeWidth="2"
                    />
                  </g>

                  {/* Drop line from Aux Relay to ACS712 */}
                  <line x1={cx - 40} y1="403" x2={cx - 40} y2="423" stroke={branchWireColor} strokeWidth="2" />
                  <circle cx={cx - 40} cy="403" r="2.5" fill="#172033" />
                  <circle cx={cx - 40} cy="423" r="2.5" fill="#172033" />

                  {/* -------------------------------------------------------- */}
                  {/* COMPONENT 3: ACS712 CURRENT SENSOR (Series Path)        */}
                  {/* -------------------------------------------------------- */}
                  <g
                    className="cursor-pointer group"
                    onClick={() =>
                      onInspectNode({
                        type: "ACS712",
                        channelId: chId,
                        title: `ACS712 Current Sensor — Channel 0${chId}`,
                        subtitle: "Series Hall-Effect Load Current Measurement",
                      })
                    }
                  >
                    <rect
                      x={cardX + 16}
                      y="423"
                      width="150"
                      height="46"
                      rx="6"
                      fill="#F8FAFC"
                      stroke="#D9E1EA"
                      strokeWidth="1"
                      className="group-hover:stroke-blue-500 transition-colors"
                    />
                    <text x={cardX + 24} y="437" fontSize="9" fontWeight="bold" fill="#172033" fontFamily="monospace">
                      ACS712 CURRENT SENSOR
                    </text>
                    <text x={cardX + 24} y="452" fontSize="11" fontWeight="bold" fill="#172033" fontFamily="monospace">
                      {formatCurrent(ch?.current)}
                    </text>
                    <text x={cardX + 24} y="463" fontSize="7" fill={ch?.current != null ? "#16A34A" : "#94A3B8"} fontFamily="monospace">
                      STATUS: {ch?.current != null ? "VALID" : "NO DATA"} &bull; IN-SERIES
                    </text>
                  </g>

                  {/* -------------------------------------------------------- */}
                  {/* COMPONENT 4: ZMPT101B VOLTAGE SENSOR (PARALLEL BRANCH)  */}
                  {/* -------------------------------------------------------- */}
                  {/* Tap wire off series conductor to parallel ZMPT101B */}
                  <line x1={cx - 40} y1="413" x2={cardX + 185} y2="413" stroke="#2563EB" strokeWidth="1.5" strokeDasharray="3 2" />
                  <line x1={cardX + 185} y1="413" x2={cardX + 185} y2="435" stroke="#2563EB" strokeWidth="1.5" />
                  <circle cx={cx - 40} cy="413" r="2.5" fill="#2563EB" />

                  <g
                    className="cursor-pointer group"
                    onClick={() =>
                      onInspectNode({
                        type: "ZMPT101B",
                        channelId: chId,
                        title: `ZMPT101B Voltage Sensor — Channel 0${chId}`,
                        subtitle: "Parallel AC Voltage Sensing across Live-Neutral",
                      })
                    }
                  >
                    <rect
                      x={cardX + 172}
                      y="435"
                      width="76"
                      height="80"
                      rx="6"
                      fill="#EFF6FF"
                      stroke="#BFDBFE"
                      strokeWidth="1"
                      className="group-hover:stroke-blue-500 transition-colors"
                    />
                    <text x={cardX + 210} y="450" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#1E40AF" fontFamily="monospace">
                      ZMPT101B
                    </text>
                    <text x={cardX + 210} y="460" textAnchor="middle" fontSize="6.5" fill="#3B82F6" fontFamily="monospace">
                      PARALLEL SENSOR
                    </text>
                    <text x={cardX + 210} y="478" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#172033" fontFamily="monospace">
                      {formatVoltage(ch?.voltage)}
                    </text>
                    <text x={cardX + 210} y="492" textAnchor="middle" fontSize="6.5" fill={ch?.voltage != null ? "#16A34A" : "#64748B"} fontFamily="monospace">
                      {ch?.voltage != null ? "VALID" : "NO DATA"}
                    </text>
                    <text x={cardX + 210} y="504" textAnchor="middle" fontSize="6" fill="#64748B" fontFamily="monospace">
                      ACROSS L-N
                    </text>
                  </g>

                  {/* ZMPT101B Neutral Return Line (Connects in parallel down to Neutral Bus) */}
                  <line x1={cardX + 210} y1="515" x2={cardX + 210} y2="725" stroke="#64748B" strokeWidth="1.5" strokeDasharray="3 2" />
                  <circle cx={cardX + 210} cy="725" r="3" fill="#64748B" />

                  {/* Drop line from ACS712 to Prototype Load */}
                  <line x1={cx - 40} y1="469" x2={cx - 40} y2="520" stroke={branchWireColor} strokeWidth="2" />
                  <circle cx={cx - 40} cy="469" r="2.5" fill="#172033" />
                  <circle cx={cx - 40} cy="520" r="2.5" fill="#172033" />

                  {/* -------------------------------------------------------- */}
                  {/* COMPONENT 5: PROTOTYPE LOAD (Series Load Element)       */}
                  {/* -------------------------------------------------------- */}
                  <g
                    className="cursor-pointer group"
                    onClick={() =>
                      onInspectNode({
                        type: "PROTOTYPE_LOAD",
                        channelId: chId,
                        title: `Prototype Load — Channel 0${chId}`,
                        subtitle: "Prototype Emulation Load Channel (Bulb Load)",
                      })
                    }
                  >
                    <rect
                      x={cardX + 16}
                      y="520"
                      width="150"
                      height="85"
                      rx="6"
                      fill={isEnergized ? "#FFFBEB" : "#F8FAFC"}
                      stroke={isEnergized ? "#FDE68A" : "#D9E1EA"}
                      strokeWidth="1"
                      className="group-hover:stroke-blue-500 transition-colors"
                    />

                    {/* Bulb / Load Symbol */}
                    <circle
                      cx={cx - 40}
                      cy="548"
                      r="12"
                      fill={isEnergized ? "#FEF3C7" : "#FFFFFF"}
                      stroke={isEnergized ? "#D97706" : "#64748B"}
                      strokeWidth="1.5"
                    />
                    <path
                      d={`M ${cx - 44} 546 Q ${cx - 40} 538 ${cx - 36} 546`}
                      fill="none"
                      stroke={isEnergized ? "#D97706" : "#64748B"}
                      strokeWidth="1.5"
                    />

                    <text x={cardX + 91} y="572" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#172033" fontFamily="monospace">
                      PROTOTYPE LOAD 0{chId}
                    </text>
                    <text x={cardX + 91} y="584" textAnchor="middle" fontSize="7.5" fontWeight="bold" fill={isEnergized ? "#D97706" : isTripped ? "#DC2626" : "#64748B"} fontFamily="monospace">
                      STATUS: {isTripped ? "TRIPPED" : isEnergized ? "ENERGIZED (ON)" : "DE-ENERGIZED (OFF)"}
                    </text>
                    <text x={cardX + 91} y="597" textAnchor="middle" fontSize="7.5" fill="#64748B" fontFamily="monospace">
                      S: {formatVa(ch?.voltage, ch?.current)}
                    </text>
                  </g>

                  {/* Channel Summary Footer Metrics inside Card */}
                  <rect x={cardX + 16} y="618" width={cardWidth - 32} height="40" rx="4" fill="#F1F5F9" />
                  <text x={cardX + 24} y="632" fontSize="7.5" fill="#64748B" fontFamily="monospace">
                    CALCULATED APPARENT POWER:
                  </text>
                  <text x={cardX + 24} y="647" fontSize="10" fontWeight="bold" fill="#172033" fontFamily="monospace">
                    {formatVa(ch?.voltage, ch?.current)}
                  </text>
                  <text x={cardX + cardWidth - 24} y="647" textAnchor="end" fontSize="7" fill="#64748B" fontFamily="monospace">
                    (V &times; I)
                  </text>

                  {/* Tripped Fault Alert Ribbon (if Tripped) */}
                  {isTripped && (
                    <g>
                      <rect x={cardX + 16} y="665" width={cardWidth - 32} height="20" rx="4" fill="#FEE2E2" stroke="#FCA5A5" strokeWidth="0.8" />
                      <text x={cx} y="678" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#DC2626" fontFamily="monospace">
                        FAULT: OVERCURRENT LATENCY TRIP
                      </text>
                    </g>
                  )}

                  {/* Return conductor line from Prototype Load to Common Neutral Bus */}
                  <line x1={cx - 40} y1="605" x2={cx - 40} y2="725" stroke="#64748B" strokeWidth="2.5" />
                  <circle cx={cx - 40} cy="605" r="2.5" fill="#172033" />
                  <circle cx={cx - 40} cy="725" r="4.5" fill="#172033" />
                </g>
              );
            })}

            {/* ============================================================== */}
            {/* STAGE 5: HORIZONTAL COMMON NEUTRAL BUS (N)                    */}
            {/* ============================================================== */}
            <g id="neutral-bus">
              {/* Heavy Neutral Return Busbar */}
              <line x1="120" y1="725" x2="1140" y2="725" stroke="#64748B" strokeWidth="6" strokeLinecap="round" />
              {/* Neutral Label Badge */}
              <rect x="540" y="738" width="180" height="24" rx="5" fill="#475569" />
              <text x="630" y="754" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#FFFFFF" fontFamily="monospace">
                COMMON NEUTRAL (N) &bull; RETURN BUS
              </text>

              {/* Earth Ground Symbol attached to Neutral Bus */}
              <line x1="630" y1="762" x2="630" y2="780" stroke="#475569" strokeWidth="2" />
              <line x1="616" y1="780" x2="644" y2="780" stroke="#475569" strokeWidth="2.5" />
              <line x1="621" y1="786" x2="639" y2="786" stroke="#475569" strokeWidth="2" />
              <line x1="626" y1="792" x2="634" y2="792" stroke="#475569" strokeWidth="1.5" />
            </g>
          </svg>
        </div>
      </div>

      {/* 4. SLD Footer Status Bar */}
      <div className="bg-white px-5 py-2.5 border-t border-[#D9E1EA] flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-[#64748B]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-600" />
          <span>FIXED TOPOLOGY SCADA ENGINE: IEC 60617 SINGLE-LINE DIAGRAM SPECIFICATION</span>
        </div>
        <div className="flex items-center gap-3">
          <span>ZERO FABRICATION &bull; ZERO CANVASSING ZOOM</span>
          <span className="font-bold text-[#172033]">
            {hasLiveData ? "● 4 CHANNELS SYNCHRONIZED" : "○ DISCONNECTED / IDLE"}
          </span>
        </div>
      </div>
    </div>
  );
}
