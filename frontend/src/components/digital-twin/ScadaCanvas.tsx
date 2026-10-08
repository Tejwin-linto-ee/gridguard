"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Zap,
  ShieldCheck,
  Lightbulb,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  Maximize,
  Activity,
  AlertTriangle,
  Info,
  MousePointer,
  Hand,
} from "lucide-react";
import { ChannelData, SystemTelemetry } from "@/types/telemetry";
import { InspectedNode } from "./ComponentInspectorDrawer";

interface ScadaCanvasProps {
  system: SystemTelemetry;
  channels: ChannelData[];
  selectedChannels?: Set<number>;
  onChannelSelect?: (channelId: number) => void;
  onInspectNode: (node: InspectedNode) => void;
  focusedChannel?: number | null;
  hasLiveData?: boolean;
  packetAgeSec?: number | null;
}

export function ScadaCanvas({
  system,
  channels,
  selectedChannels,
  onChannelSelect,
  onInspectNode,
  focusedChannel,
  hasLiveData = false,
  packetAgeSec,
}: ScadaCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(1.0);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mode, setMode] = useState<"SELECT" | "PAN">("SELECT");
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);

  // Zoom limits
  const MIN_SCALE = 0.4;
  const MAX_SCALE = 2.4;
  const STEP = 0.15;

  const handleZoomIn = () => {
    setScale((prev) => Math.min(MAX_SCALE, Math.round((prev + STEP) * 100) / 100));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(MIN_SCALE, Math.round((prev - STEP) * 100) / 100));
  };

  const handleZoomReset = () => {
    setScale(1.0);
    setPosition({ x: 0, y: 0 });
  };

  const handleFitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (!clientWidth || !clientHeight) return;
    const contentWidth = 1100;
    const contentHeight = 850;
    const scaleX = (clientWidth - 48) / contentWidth;
    const scaleY = (clientHeight - 80) / contentHeight;
    const fittedScale = Math.min(Math.max(MIN_SCALE, Math.min(scaleX, scaleY)), 1.15);
    setScale(Math.round(fittedScale * 100) / 100);
    setPosition({ x: 0, y: 0 });
  }, [MIN_SCALE]);

  // Initial Auto-Fit on Mount
  useEffect(() => {
    const timer = setTimeout(() => {
      handleFitToScreen();
    }, 60);
    return () => clearTimeout(timer);
  }, [handleFitToScreen]);

  // Recalculate Fit on Fullscreen Toggle
  useEffect(() => {
    const timer = setTimeout(() => {
      handleFitToScreen();
    }, 100);
    return () => clearTimeout(timer);
  }, [isFullscreen, handleFitToScreen]);

  // Spacebar panning support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !isSpacePressed &&
        !(e.target as HTMLElement).matches("input, textarea, select, button")
      ) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isSpacePressed]);

  // Controlled Native Wheel: DO NOT hijack ordinary page scroll!
  // ONLY zoom if Ctrl or Meta (Cmd on Mac) is held down.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheelNative = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); // Stop browser page zoom
        const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
        setScale((prev) => {
          const next = Math.round(prev * zoomFactor * 100) / 100;
          return Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
        });
      }
      // If Ctrl is NOT pressed: do not preventDefault, do not zoom!
      // Browser scrolls the webpage normally.
    };

    container.addEventListener("wheel", onWheelNative, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheelNative);
    };
  }, [MIN_SCALE, MAX_SCALE]);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.warn("Fullscreen error:", err);
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Explicit Channel Focus (Telemetry updates NEVER move the camera)
  const prevFocusedRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (focusedChannel !== prevFocusedRef.current) {
      prevFocusedRef.current = focusedChannel;
      if (focusedChannel && focusedChannel >= 1 && focusedChannel <= 4) {
        const offsets = [-340, -110, 110, 340];
        const targetX = -offsets[focusedChannel - 1] * 1.1;
        setScale(1.15);
        setPosition({ x: targetX, y: 30 });
      } else if (focusedChannel === null && prevFocusedRef.current !== undefined) {
        handleFitToScreen();
      }
    }
  }, [focusedChannel, handleFitToScreen]);

  // Drag pan handlers (Only active in PAN mode, with Space held, or with middle click)
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("input")) {
      return;
    }
    const isMiddleClick = e.button === 1;
    const shouldPan = mode === "PAN" || isMiddleClick || isSpacePressed;
    if (shouldPan) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] font-mono select-none shadow-xs ${
        isFullscreen
          ? "fixed inset-0 z-50 h-screen w-screen rounded-none p-4"
          : "h-[70vh] min-h-[560px] max-h-[820px]"
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        cursor: isDragging
          ? "grabbing"
          : mode === "PAN" || isSpacePressed
          ? "grab"
          : "default",
      }}
    >
      {/* Background Engineering Grid (Subtle Light Theme) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #E2E8F0 1px, transparent 1px),
            linear-gradient(to bottom, #E2E8F0 1px, transparent 1px)
          `,
          backgroundSize: `${28 * scale}px ${28 * scale}px`,
          backgroundPosition: `${position.x}px ${position.y}px`,
          opacity: 0.85,
        }}
      />

      {/* Top Floating SCADA Toolbar (Fixed & Always Visible) */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
        {/* Left: System Status & Provenance */}
        <div className="flex items-center gap-2 bg-white/95 backdrop-blur-md p-2 px-3 rounded-xl border border-[#E2E8F0] shadow-xs text-xs">
          <Activity className="w-4 h-4 text-blue-600" />
          <span className="font-bold text-[#172033] tracking-wide text-[11px] hidden sm:inline">
            GRIDGUARD SCADA DIGITAL TWIN
          </span>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              hasLiveData
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            {hasLiveData ? "● LIVE MQTT" : "○ NO LIVE DATA"}
          </span>
          {hasLiveData && packetAgeSec != null && (
            <span className="text-[10px] text-slate-500 tabular-nums">
              {packetAgeSec < 3 ? `${packetAgeSec.toFixed(1)}s ago` : "STALE"}
            </span>
          )}
        </div>

        {/* Right: Mode & Navigation Controls */}
        <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-[#E2E8F0] shadow-xs text-xs">
          {/* Interaction Mode: SELECT vs PAN */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setMode("SELECT")}
              className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors ${
                mode === "SELECT"
                  ? "bg-white text-blue-700 shadow-2xs border border-[#CBD5E1]"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Select Mode (Inspect components & interact)"
            >
              <MousePointer className="w-3 h-3" />
              <span>SELECT</span>
            </button>
            <button
              onClick={() => setMode("PAN")}
              className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors ${
                mode === "PAN"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Pan Mode (Drag canvas to move model)"
            >
              <Hand className="w-3 h-3" />
              <span>PAN</span>
            </button>
          </div>

          <div className="w-[1px] h-4 bg-slate-200 mx-0.5" />

          {/* Explicit Zoom Controls */}
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
            title="Zoom Out (−)"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomReset}
            className="px-2 py-1 rounded-lg hover:bg-slate-100 text-slate-800 font-bold text-[11px] tabular-nums"
            title="Reset Zoom to 100%"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
            title="Zoom In (+)"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-4 bg-slate-200 mx-0.5" />

          {/* Fit to Viewport */}
          <button
            onClick={handleFitToScreen}
            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase tracking-wider transition-colors shadow-2xs"
            title="Fit Entire Model into Viewport"
          >
            FIT
          </button>

          {/* Reset View */}
          <button
            onClick={handleZoomReset}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
            title="Reset View (100% Zoom, Centered)"
            aria-label="Reset view"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            aria-label="Toggle fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Non-intrusive Interaction Guide Pill */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none hidden sm:flex items-center gap-2 bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-[#E2E8F0] text-[10px] text-slate-500 shadow-xs">
        <Info className="w-3 h-3 text-blue-600 shrink-0" />
        <span>Scroll page normally • <strong className="text-slate-700 font-bold">Ctrl + Scroll</strong> to zoom • <strong className="text-slate-700 font-bold">PAN</strong> or <strong className="text-slate-700 font-bold">Space + Drag</strong> to move</span>
      </div>

      {/* Main Pannable / Zoomable Engineering Plane */}
      <div
        className="absolute inset-0 flex items-center justify-center transition-transform duration-75 ease-out"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <div className="relative w-[1050px] min-h-[760px] p-6 text-[#172033] no-pan">
          {/* ====================================================== */}
          {/* 1. AC MAINS SUPPLY NODE */}
          {/* ====================================================== */}
          <div className="flex justify-center mb-3">
            <div
              onClick={() =>
                onInspectNode({
                  type: "AC_MAINS",
                  title: "AC Mains Single-Phase Supply",
                  subtitle: "Grid Utility Supply: 230V RMS 50Hz",
                })
              }
              className="px-5 py-2.5 rounded-xl bg-white border border-[#CBD5E1] flex items-center gap-3 cursor-pointer hover:border-blue-500 hover:bg-slate-50 transition-all shadow-xs group"
            >
              <Zap className="w-5 h-5 text-blue-600 group-hover:scale-110 transition-transform" />
              <div>
                <div className="text-xs font-bold text-[#172033] uppercase tracking-wider">
                  AC MAINS 230V 50Hz FEEDER
                </div>
                <div className="text-[10px] text-slate-500">
                  Utility Grid Feeder &bull; Voltage: {system.voltage != null ? `${system.voltage.toFixed(1)} V` : "--- V"} &bull; Freq: {system.frequency != null ? `${system.frequency.toFixed(2)} Hz` : "--- Hz"}
                </div>
              </div>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                SOURCE
              </span>
            </div>
          </div>

          {/* Central Animated Conductor */}
          <div className="relative w-1 h-6 bg-blue-600 mx-auto">
            {hasLiveData && (
              <span className="absolute left-0 right-0 top-0 h-2 bg-blue-300 rounded-full animate-[bounce_1.2s_infinite]" />
            )}
          </div>

          {/* ====================================================== */}
          {/* 2. SYSTEM METER: PZEM-004T V3.0 */}
          {/* ====================================================== */}
          <div className="flex justify-center mb-3">
            <div
              onClick={() =>
                onInspectNode({
                  type: "PZEM",
                  title: "PZEM-004T V3.0 System Meter",
                  subtitle: "Overall Prototype Voltage, Current, Power & Energy",
                })
              }
              className="w-[480px] p-3.5 rounded-xl bg-white border border-[#CBD5E1] hover:border-blue-500 hover:bg-slate-50 cursor-pointer transition-all shadow-xs group"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <div>
                    <span className="text-xs font-bold text-[#172033] group-hover:text-blue-700 transition-colors">
                      PZEM-004T V3.0
                    </span>
                    <span className="text-[9px] text-slate-500 ml-2">SYSTEM-LEVEL MEASUREMENT</span>
                  </div>
                </div>
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                    hasLiveData
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  {hasLiveData ? "● LIVE MQTT" : "○ NO LIVE DATA"}
                </span>
              </div>

              {/* 6 Core Metrics Grid */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-[#F8FAFC] p-2 rounded-lg border border-[#E2E8F0]">
                  <span className="text-[9px] text-slate-500 font-bold block">VOLTAGE</span>
                  <span className="font-bold text-[#172033] tabular-nums text-[11px]">
                    {system.voltage != null ? `${system.voltage.toFixed(1)} V` : "--- V"}
                  </span>
                </div>
                <div className="bg-[#F8FAFC] p-2 rounded-lg border border-[#E2E8F0]">
                  <span className="text-[9px] text-slate-500 font-bold block">CURRENT</span>
                  <span className="font-bold text-[#172033] tabular-nums text-[11px]">
                    {system.current != null ? `${system.current.toFixed(2)} A` : "--- A"}
                  </span>
                </div>
                <div className="bg-[#F8FAFC] p-2 rounded-lg border border-[#E2E8F0]">
                  <span className="text-[9px] text-slate-500 font-bold block">POWER</span>
                  <span className="font-bold text-emerald-700 tabular-nums text-[11px]">
                    {system.power != null ? `${system.power.toFixed(1)} W` : "--- W"}
                  </span>
                </div>
                <div className="bg-[#F8FAFC] p-2 rounded-lg border border-[#E2E8F0]">
                  <span className="text-[9px] text-slate-500 font-bold block">ENERGY</span>
                  <span className="font-bold text-[#172033] tabular-nums text-[11px]">
                    {system.energy != null ? `${system.energy.toFixed(3)} kWh` : "--- kWh"}
                  </span>
                </div>
                <div className="bg-[#F8FAFC] p-2 rounded-lg border border-[#E2E8F0]">
                  <span className="text-[9px] text-slate-500 font-bold block">FREQUENCY</span>
                  <span className="font-bold text-[#172033] tabular-nums text-[11px]">
                    {system.frequency != null ? `${system.frequency.toFixed(2)} Hz` : "--- Hz"}
                  </span>
                </div>
                <div className="bg-[#F8FAFC] p-2 rounded-lg border border-[#E2E8F0]">
                  <span className="text-[9px] text-slate-500 font-bold block">POWER FACTOR</span>
                  <span className="font-bold text-[#172033] tabular-nums text-[11px]">
                    {system.power_factor != null ? system.power_factor.toFixed(2) : "---"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Central Conductor Line */}
          <div className="relative w-1 h-6 bg-blue-600 mx-auto" />

          {/* ====================================================== */}
          {/* 3. PARALLEL DISTRIBUTION LIVE BUSBAR */}
          {/* ====================================================== */}
          <div className="relative mb-6 px-6">
            <div
              onClick={() =>
                onInspectNode({
                  type: "DISTRIBUTION_BUS",
                  title: "Parallel Distribution Live Bus",
                  subtitle: "Common 230V Phase Conductor Feeding All 4 Protection Channels",
                })
              }
              className="h-3 w-full bg-blue-600 rounded-full cursor-pointer hover:bg-blue-700 transition-colors shadow-2xs"
            />
            <div className="flex items-center justify-between text-[9px] text-blue-700 font-bold mt-1 uppercase tracking-widest px-2">
              <span>AC LIVE DISTRIBUTION BUS (230V)</span>
              <span>COMMON PARALLEL FEED</span>
            </div>
          </div>

          {/* ====================================================== */}
          {/* 4. FOUR PARALLEL CHANNELS (CH1 - CH4) */}
          {/* ====================================================== */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {channels.map((ch) => {
              const isSelected = selectedChannels?.has(ch.channel);
              const isTripped = ch.status === "TRIPPED" || ch.status === "FAULT LATCHED";
              const isMaintenance = ch.status === "MAINTENANCE";
              const isLoadEnergized = ch.load_active && ch.main_relay && ch.aux_relay;

              return (
                <div
                  key={ch.channel}
                  className={`p-3.5 rounded-xl border flex flex-col items-center gap-2.5 transition-all shadow-2xs ${
                    isSelected
                      ? "bg-[#EFF6FF] border-2 border-[#2563EB]"
                      : isTripped
                      ? "bg-red-50/30 border-red-300"
                      : isMaintenance
                      ? "bg-blue-50/30 border-blue-300"
                      : "bg-white border-[#CBD5E1] hover:border-slate-400"
                  }`}
                >
                  {/* Channel Header */}
                  <div className="w-full flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#172033] tracking-wider">
                        CHANNEL 0{ch.channel}
                      </span>
                      {onChannelSelect && (
                        <button
                          onClick={() => onChannelSelect(ch.channel)}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                          }`}
                        >
                          {isSelected ? "SELECTED" : "SELECT"}
                        </button>
                      )}
                    </div>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                        isTripped
                          ? "bg-red-50 text-red-700 border-red-200"
                          : isMaintenance
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-green-50 text-green-700 border-green-200"
                      }`}
                    >
                      {ch.status}
                    </span>
                  </div>

                  {/* Node 1: ZMPT101B Voltage Sensing (Across L & N) */}
                  <div
                    onClick={() =>
                      onInspectNode({
                        type: "ZMPT101B",
                        channelId: ch.channel,
                        title: `ZMPT101B Voltage Sensor — CH0${ch.channel}`,
                        subtitle: "Parallel Channel AC Voltage Micro-Transformer",
                      })
                    }
                    className="w-full p-2.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] hover:border-blue-500 cursor-pointer transition-all text-center group"
                  >
                    <div className="flex items-center justify-between text-[8px] text-slate-500 font-bold uppercase mb-0.5">
                      <span className="group-hover:text-blue-600 transition-colors">ZMPT101B CH0{ch.channel}</span>
                      <span className={ch.voltage != null ? "text-green-700" : "text-slate-400"}>
                        {ch.voltage != null ? "● VALID" : "○ NO DATA"}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-[#172033] tabular-nums">
                      {ch.voltage != null ? `${ch.voltage.toFixed(1)} V` : "--- V"}
                    </div>
                    <div className="text-[8px] text-slate-400 mt-0.5">
                      VOLTAGE ACROSS L-N
                    </div>
                  </div>

                  {/* Conductor to Main Relay */}
                  <div className={`w-1 h-3 ${isTripped ? "bg-[#DC2626]" : isLoadEnergized ? "bg-[#16A34A]" : "bg-[#64748B]"}`} />

                  {/* Node 2: Main Relay */}
                  <div
                    onClick={() =>
                      onInspectNode({
                        type: "MAIN_RELAY",
                        channelId: ch.channel,
                        title: `Main Relay — CH0${ch.channel}`,
                        subtitle: "Primary Dual-Relay Safety Switch",
                      })
                    }
                    className={`w-full p-2 rounded-lg border cursor-pointer transition-all text-center ${
                      ch.main_relay
                        ? "bg-green-50 border-green-200 text-green-800 hover:border-green-300"
                        : "bg-red-50 border-red-200 text-red-800 hover:border-red-300"
                    }`}
                  >
                    <div className="text-[8px] text-slate-500 font-bold uppercase tracking-tight">MAIN RELAY</div>
                    <div className="text-[10px] font-bold">
                      {ch.main_relay == null ? "UNKNOWN" : ch.main_relay ? "● ON (CLOSED)" : "○ OFF (OPEN)"}
                    </div>
                    <div className="text-[7px] text-slate-400 mt-0.5 font-bold">
                      FEEDBACK N/A
                    </div>
                  </div>

                  {/* Conductor between Relays */}
                  <div className={`w-1 h-2.5 ${isTripped ? "bg-[#DC2626]" : isLoadEnergized ? "bg-[#16A34A]" : "bg-[#64748B]"}`} />

                  {/* Node 3: Auxiliary Relay */}
                  <div
                    onClick={() =>
                      onInspectNode({
                        type: "AUX_RELAY",
                        channelId: ch.channel,
                        title: `Auxiliary Relay — CH0${ch.channel}`,
                        subtitle: "Secondary Dual-Relay Redundant Safety Switch",
                      })
                    }
                    className={`w-full p-2 rounded-lg border cursor-pointer transition-all text-center ${
                      ch.aux_relay
                        ? "bg-green-50 border-green-200 text-green-800 hover:border-green-300"
                        : "bg-red-50 border-red-200 text-red-800 hover:border-red-300"
                    }`}
                  >
                    <div className="text-[8px] text-slate-500 font-bold uppercase tracking-tight">AUX RELAY</div>
                    <div className="text-[10px] font-bold">
                      {ch.aux_relay == null ? "UNKNOWN" : ch.aux_relay ? "● ON (CLOSED)" : "○ OFF (OPEN)"}
                    </div>
                    <div className="text-[7px] text-slate-400 mt-0.5 font-bold">
                      FEEDBACK N/A
                    </div>
                  </div>

                  {/* Conductor to ACS712 */}
                  <div className={`w-1 h-3 ${isTripped ? "bg-[#DC2626]" : isLoadEnergized ? "bg-[#16A34A]" : "bg-[#64748B]"}`} />

                  {/* Node 4: ACS712 Current Sensing */}
                  <div
                    onClick={() =>
                      onInspectNode({
                        type: "ACS712",
                        channelId: ch.channel,
                        title: `ACS712 Current Sensor — CH0${ch.channel}`,
                        subtitle: "Hall-Effect In-Series Current Sensor",
                      })
                    }
                    className="w-full p-2.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] hover:border-blue-500 cursor-pointer transition-all text-center group"
                  >
                    <div className="flex items-center justify-between text-[8px] text-slate-500 font-bold uppercase mb-0.5">
                      <span className="group-hover:text-blue-600 transition-colors">ACS712 CH0{ch.channel}</span>
                      <span className={ch.current != null ? "text-green-700" : "text-slate-400"}>
                        {ch.current != null ? "● VALID" : "○ NO DATA"}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-[#172033] tabular-nums">
                      {ch.current != null ? `${ch.current.toFixed(2)} A` : "--- A"}
                    </div>
                    <div className="text-[8px] text-slate-400 mt-0.5">
                      SERIES CURRENT
                    </div>
                  </div>

                  {/* Conductor to Prototype Load */}
                  <div className={`w-1 h-3 ${isTripped ? "bg-[#DC2626]" : isLoadEnergized ? "bg-[#16A34A]" : "bg-[#64748B]"}`} />

                  {/* Node 5: Prototype Load (Bulb Load) */}
                  <div
                    onClick={() =>
                      onInspectNode({
                        type: "PROTOTYPE_LOAD",
                        channelId: ch.channel,
                        title: `Prototype Load CH${ch.channel}`,
                        subtitle: `Emulated Feeder Load Circuit 0${ch.channel}`,
                      })
                    }
                    className={`w-full p-2.5 rounded-xl border flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      isLoadEnergized
                        ? "bg-amber-50/70 border-amber-300 text-amber-900 hover:border-amber-400"
                        : "bg-slate-100 border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <Lightbulb
                      className={`w-5 h-5 ${
                        isLoadEnergized
                          ? "text-amber-500 fill-amber-400"
                          : "text-slate-400"
                      }`}
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#172033]">
                      PROTOTYPE LOAD CH{ch.channel}
                    </span>
                    <span className={`text-[8px] font-bold ${isLoadEnergized ? "text-amber-700" : "text-slate-500"}`}>
                      {isLoadEnergized ? "● ENERGIZED" : "○ DE-ENERGIZED"}
                    </span>
                    <span className="text-[7px] text-slate-400">
                      COMMANDED LOAD STATE
                    </span>

                    {/* Apparent Power S = V x I */}
                    <div className="w-full mt-1 pt-1 border-t border-slate-200 text-[8px] flex justify-between text-slate-500">
                      <span>S (V&times;I):</span>
                      <span className="font-bold text-[#172033] tabular-nums">
                        {ch.voltage != null && ch.current != null
                          ? `${(ch.voltage * ch.current).toFixed(1)} VA`
                          : "--- VA"}
                      </span>
                    </div>
                  </div>

                  {/* Return Conductor to Common Neutral */}
                  <div className="w-1 h-4 bg-slate-400" />
                </div>
              );
            })}
          </div>

          {/* ====================================================== */}
          {/* 5. COMMON NEUTRAL RETURN BUSBAR */}
          {/* ====================================================== */}
          <div className="relative mb-6 px-6">
            <div
              onClick={() =>
                onInspectNode({
                  type: "NEUTRAL_BUS",
                  title: "Common Neutral Return Busbar",
                  subtitle: "Shared Neutral Conductor for All 4 Parallel Prototype Channels",
                })
              }
              className="h-3 w-full bg-slate-500 rounded-full cursor-pointer hover:bg-slate-600 transition-colors shadow-2xs"
            />
            <div className="flex items-center justify-between text-[9px] text-slate-500 font-bold mt-1 uppercase tracking-widest px-2">
              <span>COMMON NEUTRAL RETURN BUSBAR</span>
              <span>GRID UTILITY GROUNDED NEUTRAL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Minimap Viewport in Bottom-Right Corner */}
      <div className="absolute bottom-4 right-4 z-20 bg-white/95 backdrop-blur-md p-2.5 rounded-xl border border-[#E2E8F0] shadow-sm hidden md:block">
        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1 flex items-center justify-between">
          <span>TOPOLOGY MAP</span>
          <span className="text-[8px] text-blue-600 font-bold">MINIMAP</span>
        </div>
        <div
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = (e.clientX - rect.left) / rect.width - 0.5;
            const clickY = (e.clientY - rect.top) / rect.height - 0.5;
            setPosition({ x: -clickX * 800, y: -clickY * 600 });
          }}
          className="relative w-36 h-24 bg-slate-50 rounded-lg border border-slate-200 cursor-crosshair overflow-hidden"
        >
          {/* Schematic Wireframe in Minimap */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-blue-600 rounded" />
          <div className="absolute top-5 left-1/2 -translate-x-1/2 w-16 h-3 bg-slate-200 rounded" />
          <div className="absolute top-10 left-2 right-2 h-0.5 bg-blue-600 rounded" />
          <div className="absolute top-12 left-3 right-3 flex justify-between">
            <div className="w-6 h-7 bg-white border border-slate-200 rounded" />
            <div className="w-6 h-7 bg-white border border-slate-200 rounded" />
            <div className="w-6 h-7 bg-white border border-slate-200 rounded" />
            <div className="w-6 h-7 bg-white border border-slate-200 rounded" />
          </div>
          <div className="absolute bottom-2 left-2 right-2 h-0.5 bg-slate-400 rounded" />

          {/* Current Viewport Box */}
          <div
            className="absolute border-2 border-blue-600 bg-blue-600/10 rounded pointer-events-none transition-all duration-75"
            style={{
              width: `${Math.min(100, Math.max(25, 100 / scale))}%`,
              height: `${Math.min(100, Math.max(25, 100 / scale))}%`,
              left: `${Math.max(0, Math.min(75, 50 - (position.x / 800) * 50))}%`,
              top: `${Math.max(0, Math.min(75, 50 - (position.y / 600) * 50))}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
