"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { FaceVerificationModal } from "@/components/face/FaceVerificationModal";
import {
  PlayCircle, CheckCircle2, AlertOctagon, RefreshCw, Zap,
  Activity, ArrowRight, ShieldCheck, AlertTriangle, Lightbulb,
  ShieldAlert, Camera, Lock, Unlock, UserCheck, Eye, Terminal, Clock
} from "lucide-react";

interface DemoChannel {
  channel: number;
  voltage: number;
  current: number;
  apparent_power: number;
  main_relay: boolean;
  aux_relay: boolean;
  load_active: boolean;
  status: string;
  fault?: string | null;
  priority_level: string;
}

interface TimelineItem {
  time: string;
  state: string;
  desc: string;
}

export default function DemonstrationModePage() {
  const [demoState, setDemoState] = useState<string>("DEMO_NORMAL");
  const [channels, setChannels] = useState<DemoChannel[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set([2]));
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState<boolean>(false);

  // Biometric reset modal state
  const [isFaceAuthOpen, setIsFaceAuthOpen] = useState<boolean>(false);
  const [verifiedOperator, setVerifiedOperator] = useState<string | null>(null);
  const [simulateUnsafeCurrent, setSimulateUnsafeCurrent] = useState<boolean>(false);
  const [safetyBlocked, setSafetyBlocked] = useState<boolean>(false);

  // Fetch demo status from backend
  const loadDemoStatus = useCallback(async () => {
    try {
      const res = await api.getDemoStatus();
      if (res) {
        setDemoState(res.demo_state || "DEMO_NORMAL");
        if (res.channels) setChannels(res.channels);
        if (res.timeline) setTimeline(res.timeline);
      }
    } catch (err) {
      console.error("Failed to load demo status:", err);
    }
  }, []);

  useEffect(() => {
    loadDemoStatus();
    const interval = setInterval(loadDemoStatus, 2000);
    return () => clearInterval(interval);
  }, [loadDemoStatus]);

  const [showTripModal, setShowTripModal] = useState<boolean>(false);

  // Toggle channel in multi-selection Set independently (Part T & AX)
  const toggleChannel = (ch: number) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) {
        next.delete(ch);
      } else {
        next.add(ch);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedChannels(new Set([1, 2, 3, 4]));
  };

  const clearSelection = () => {
    setSelectedChannels(new Set());
  };

  const selectAllEligible = () => {
    if (isLatched) {
      const latched = channels.filter((c) => c.status === "FAULT LATCHED" || c.status === "TRIPPED").map((c) => c.channel);
      setSelectedChannels(new Set(latched.length > 0 ? latched : [1, 2, 3, 4]));
    } else {
      setSelectedChannels(new Set([1, 2, 3, 4]));
    }
  };

  // Handle demo action injection across selected channels in a single atomic request (Part V)
  const triggerDemoAction = async (action: string, channelId?: number) => {
    try {
      setIsLoading(true);
      setSafetyBlocked(false);
      setVerifiedOperator(null);

      const targetList = channelId !== undefined ? [channelId] : Array.from(selectedChannels);
      if (targetList.length === 0) {
        setStatusMessage("Please select at least one channel first.");
        return;
      }

      const res = await api.injectDemoAction(action, targetList);
      if (res && res.success) {
        setDemoState(res.demo_state);
        setChannels(res.channels);
        setTimeline(res.timeline);
        setStatusMessage(`Demo action '${action}' applied to Channel(s) ${targetList.join(", ")}.`);
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (err: any) {
      setStatusMessage(err.message || "Failed to inject demo action");
    } finally {
      setIsLoading(false);
    }
  };

  // Face auth completed callback
  const handleFaceAuthSuccess = async () => {
    setIsFaceAuthOpen(false);
    const operatorName = "Authorized Operator (OPERATOR)";
    setVerifiedOperator(operatorName);

    if (simulateUnsafeCurrent) {
      setSafetyBlocked(true);
      setStatusMessage("IDENTITY VERIFIED ✓ BUT SAFETY CHECK FAILED: Measured current exceeds 2.50A threshold. Reset blocked by safety policy.");
    } else {
      setSafetyBlocked(false);
      setStatusMessage("IDENTITY VERIFIED ✓ FaceNet512 match confirmed. Pre-closure safety check: PASSED. Demo reset authorized.");
    }
  };

  // Execute demo reset
  const handleExecuteDemoReset = async () => {
    try {
      setIsLoading(true);
      const targetIds = Array.from(selectedChannels);
      const res = await api.executeDemoReset(verifiedOperator || "Authorized Operator", targetIds);
      if (res && res.success) {
        setDemoState("DEMO_NORMAL");
        setChannels(res.channels);
        setTimeline(res.timeline);
        setVerifiedOperator(null);
        setSafetyBlocked(false);
        setStatusMessage(`DEMO RESET SUCCESSFUL: Channel(s) ${targetIds.join(", ")} restored to NORMAL in simulation.`);
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (err: any) {
      setStatusMessage(err.message || "Failed to execute demo reset");
    } finally {
      setIsLoading(false);
    }
  };

  // Open confirmation modal or execute demo trip (Part W)
  const handleRequestTrip = () => {
    if (selectedChannels.size === 0) {
      setStatusMessage("Please select at least one channel to trip.");
      return;
    }
    setShowTripModal(true);
  };

  const handleConfirmDemoTrip = async () => {
    setShowTripModal(false);
    try {
      setIsLoading(true);
      const targetIds = Array.from(selectedChannels);
      const res = await api.executeDemoTrip(targetIds, verifiedOperator || "Authorized Operator");
      if (res && res.success) {
        setDemoState(res.demo_state || "DEMO_MAINTENANCE");
        setChannels(res.channels);
        setTimeline(res.timeline);
        setStatusMessage(`DEMO TRIP SUCCESSFUL: Channel(s) ${targetIds.join(", ")} de-energized in simulation.`);
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (err: any) {
      setStatusMessage(err.message || "Failed to execute demo trip");
    } finally {
      setIsLoading(false);
    }
  };

  // Reset demo scenario
  const handleResetScenario = async () => {
    for (const ch of Array.from(selectedChannels)) {
      await api.injectDemoAction("CLEAR", ch);
    }
    await loadDemoStatus();
    setVerifiedOperator(null);
    setSafetyBlocked(false);
  };

  const isLatched = demoState === "DEMO_FAULT_LATCHED" || channels.some((c) => c.status === "FAULT LATCHED");
  const latchedChannels = channels.filter((c) => c.status === "FAULT LATCHED" || c.status === "TRIPPED");

  return (
    <AppShell title="DEMONSTRATION MODE" dataSource="SIMULATED DEMO" onRefresh={loadDemoStatus}>
      {/* Prominent Simulated Demonstration Banner (Section 8, 20) */}
      <div className="p-4 rounded-xl bg-[#FFF7ED] border border-[#FDBA74] shadow-xs flex flex-wrap items-center justify-between gap-4 font-mono">
        <div className="flex items-center gap-3.5">
          <AlertTriangle className="w-7 h-7 text-[#C2410C] shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#C2410C] font-mono uppercase tracking-wider">
                DEMONSTRATION MODE — SIMULATED DATA — NOT LIVE HARDWARE TELEMETRY
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-100 text-[#C2410C] border border-orange-200">
                EXHIBITION ONLY
              </span>
            </div>
            <p className="text-xs text-[#9A3412] mt-1">
              Controlled simulation for exhibition and system workflow demonstration. All channel states, fault injection, and demo resets operate in software memory and strictly <strong>NEVER modify live MQTT telemetry or trigger physical hardware relays</strong>.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPresentationMode(!presentationMode)}
            className={`px-3.5 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all ${
              presentationMode
                ? "bg-[#C2410C] text-white border-[#C2410C] shadow-xs"
                : "bg-white text-[#C2410C] border-[#FDBA74] hover:bg-orange-50"
            }`}
          >
            {presentationMode ? "EXIT PRESENTATION" : "PRESENTATION MODE"}
          </button>
          <Link
            href="/"
            className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-[#172033] border border-[#CBD5E1] text-xs font-mono transition-colors"
          >
            &larr; Back to Live Mode
          </Link>
        </div>
      </div>

      {/* Status Notice */}
      {statusMessage && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center justify-between gap-2 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-[#64748B] hover:text-[#172033] text-xs font-mono">
            Dismiss
          </button>
        </div>
      )}

      {/* State Machine Pipeline HUD (Section 9) */}
      <div className="bg-white p-5 border border-[#E2E8F0] rounded-xl shadow-xs">
        <div className="flex items-center justify-between mb-3 border-b border-[#E2E8F0] pb-2.5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold text-[#172033] font-mono uppercase tracking-wider">
              DEMO STATE MACHINE PROGRESSION
            </h2>
          </div>
          <span className="text-[11px] font-mono text-blue-700 font-bold px-2.5 py-0.5 rounded bg-blue-50 border border-blue-200">
            CURRENT: {demoState}
          </span>
        </div>

        {/* State Flow Steps */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center text-[10px] font-mono">
          {[
            { id: "DEMO_NORMAL", label: "1. NORMAL" },
            { id: "DEMO_WARNING", label: "2. WARNING" },
            { id: "DEMO_HIGH_LOAD", label: "3. HIGH LOAD" },
            { id: "DEMO_CRITICAL", label: "4. CRITICAL" },
            { id: "DEMO_FAULT_LATCHED", label: "5. LATCHED" },
            { id: "FACE_AUTH", label: "6. FACE AUTH" },
            { id: "SAFETY_EVAL", label: "7. SAFETY EVAL" },
            { id: "DEMO_NORMAL", label: "8. RECOVERY" },
          ].map((st, idx) => {
            const isCurrent =
              (st.id === demoState) ||
              (st.id === "FACE_AUTH" && (isFaceAuthOpen || verifiedOperator !== null)) ||
              (st.id === "SAFETY_EVAL" && verifiedOperator !== null);
            return (
              <div
                key={idx}
                className={`p-2 rounded-lg border transition-all ${
                  isCurrent
                    ? "bg-[#EFF6FF] text-[#1D4ED8] border-2 border-[#2563EB] shadow-2xs font-bold"
                    : "bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]"
                }`}
              >
                {st.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Demo Control Panel (Section 10, 19) */}
      <div className="bg-white p-5 border border-[#E2E8F0] rounded-xl shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-[#E2E8F0]">
          <div>
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-[#172033] font-mono uppercase tracking-wider">
                DEMONSTRATION CONTROL PANEL
              </h3>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Inject deterministic fault sequences across simulated prototype load channels (Bulbs 1–4).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <span className="text-[#172033] font-bold bg-[#F8FAFC] px-2.5 py-1 rounded border border-[#E2E8F0]">
              {selectedChannels.size} {selectedChannels.size === 1 ? "CHANNEL" : "CHANNELS"} SELECTED
            </span>
            <div className="flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-lg border border-[#E2E8F0]">
              {[1, 2, 3, 4].map((ch) => {
                const isSelected = selectedChannels.has(ch);
                return (
                  <button
                    key={ch}
                    onClick={() => toggleChannel(ch)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#2563EB] text-white font-bold shadow-2xs"
                        : "text-[#64748B] hover:text-[#172033]"
                    }`}
                  >
                    CH {ch} {isSelected ? "✓" : ""}
                  </button>
                );
              })}
            </div>
            <button
              onClick={selectAll}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-[#172033] text-[11px] font-bold cursor-pointer border border-[#CBD5E1]"
            >
              SELECT ALL
            </button>
            <button
              onClick={clearSelection}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-[#64748B] text-[11px] cursor-pointer border border-[#CBD5E1]"
            >
              CLEAR SELECTION
            </button>
            <button
              onClick={selectAllEligible}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-[#C2410C] text-[11px] cursor-pointer border border-[#CBD5E1]"
            >
              SELECT ALL ELIGIBLE
            </button>
          </div>
        </div>

        {/* Action Buttons Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
          <button
            disabled={isLoading}
            onClick={() => triggerDemoAction("NORMAL")}
            className="py-2.5 px-3 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>NORMAL</span>
          </button>

          <button
            disabled={isLoading}
            onClick={() => triggerDemoAction("WARNING")}
            className="py-2.5 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>INJECT WARNING</span>
          </button>

          <button
            disabled={isLoading}
            onClick={() => triggerDemoAction("HIGH_LOAD")}
            className="py-2.5 px-3 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>INJECT HIGH LOAD</span>
          </button>

          <button
            disabled={isLoading}
            onClick={() => triggerDemoAction("CRITICAL")}
            className="py-2.5 px-3 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>INJECT CRITICAL</span>
          </button>

          <button
            disabled={isLoading}
            onClick={handleRequestTrip}
            className="py-2.5 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-mono font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>TRIP SELECTED ({selectedChannels.size})</span>
          </button>

          <button
            disabled={isLoading}
            onClick={() => triggerDemoAction("TRIP_ALL")}
            className="py-2.5 px-3 rounded-lg bg-red-700 hover:bg-red-800 text-white font-mono font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>TRIP ALL</span>
          </button>

          <button
            disabled={isLoading}
            onClick={handleResetScenario}
            className="py-2.5 px-3 rounded-lg bg-white hover:bg-slate-50 text-[#172033] font-mono font-bold text-xs transition-all border border-[#CBD5E1] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>RESET SCENARIO</span>
          </button>
        </div>
      </div>

      {/* Latched Fault & Biometric Reset Workflow (Sections 12-16) */}
      {isLatched && (
        <div className="p-5 border border-red-200 bg-red-50/70 rounded-xl font-mono">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-red-900 uppercase font-mono tracking-wider">
                    PROTOTYPE LOAD CHANNEL {latchedChannels.map((c) => c.channel).join(", ")} FAULT LATCHED
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-100 text-red-800 border border-red-200">
                    MANUAL RESET BLOCKED
                  </span>
                </div>
                <p className="text-xs text-red-700 mt-1">
                  Deterministic protection tripped dual relays open. Biometric identity verification required to authorize safety unlatch.
                </p>
              </div>
            </div>

            {/* Safety Demo Options & Trigger */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-mono text-[#172033] bg-white px-3 py-2 rounded-lg border border-[#CBD5E1] cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulateUnsafeCurrent}
                  onChange={(e) => {
                    setSimulateUnsafeCurrent(e.target.checked);
                    setSafetyBlocked(false);
                  }}
                  className="rounded border-slate-300 text-red-600 focus:ring-0"
                />
                <span>Simulate Unsafe Current (3.45A &gt; 2.50A)</span>
              </label>

              {!verifiedOperator ? (
                <button
                  onClick={() => setIsFaceAuthOpen(true)}
                  className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-mono font-bold text-xs tracking-wider transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>START FACE AUTHENTICATION</span>
                </button>
              ) : safetyBlocked ? (
                <div className="flex items-center gap-2">
                  <div className="px-3.5 py-2 rounded-lg bg-red-100 text-red-800 border border-red-200 text-xs font-mono font-bold flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-red-600" />
                    <span>SAFETY BLOCKED (3.45A &gt; 2.50A)</span>
                  </div>
                  <button
                    onClick={() => {
                      setSimulateUnsafeCurrent(false);
                      setSafetyBlocked(false);
                    }}
                    className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-[#172033] border border-[#CBD5E1] text-xs font-mono font-semibold"
                  >
                    Clear Overcurrent
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleExecuteDemoReset}
                  className="px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-mono font-bold text-xs tracking-wider transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>RESET DEMO GRID</span>
                </button>
              )}
            </div>
          </div>

          {/* Verification Status Feedback */}
          {verifiedOperator && (
            <div className="mt-4 pt-3 border-t border-red-200 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 text-green-700">
                <UserCheck className="w-4 h-4" />
                <span>Verified Operator: <strong>{verifiedOperator}</strong></span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[11px] ${safetyBlocked ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                {safetyBlocked ? "Pre-Closure Check: FAILED" : "Pre-Closure Check: PASSED (Current Safe)"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 4 Prototype Load Channels (Bulbs 1–4) (Section 11) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs font-bold text-[#172033] uppercase font-mono tracking-wider flex items-center gap-2">
              <span>PROTOTYPE LOAD CHANNELS (CH1 - CH4)</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-100 text-[#C2410C] border border-orange-200">
                SIMULATED DATA
              </span>
            </h2>
            <p className="text-[11px] text-[#64748B]">
              Four prototype loads (bulbs) emulating transformer/load channels with simulated ZMPT101B, ACS712 &amp; Dual Relays
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {channels.map((ch) => {
            const chTripped = ch.status === "FAULT LATCHED" || ch.status === "TRIPPED";
            const chHigh = ch.status === "HIGH LOAD" || ch.status === "WARNING" || ch.status === "CRITICAL";

            let borderColor = "border-[#E2E8F0]";
            if (ch.status === "NORMAL") borderColor = "border-green-300";
            else if (chHigh) borderColor = "border-amber-300";
            else if (chTripped) borderColor = "border-red-300";

            return (
              <div key={ch.channel} className={`bg-white p-5 border ${borderColor} rounded-xl shadow-xs flex flex-col justify-between relative`}>
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-[#172033] font-mono">
                          PROTOTYPE LOAD CHANNEL {ch.channel}
                        </span>
                      </div>
                      <span className="text-xs text-[#64748B]">Bulb {ch.channel} Emulation</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      ch.status === "NORMAL" ? "bg-green-50 text-green-700 border border-green-200" :
                      chTripped ? "bg-red-50 text-red-700 border border-red-200" :
                      "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}>
                      {ch.status}
                    </span>
                  </div>

                  {/* Simulated Electrical Grid */}
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] mb-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[#64748B] font-mono">Voltage (Simulated)</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-bold text-[#172033] font-mono">{ch.voltage.toFixed(1)}</span>
                        <span className="text-xs text-[#64748B] font-mono">V</span>
                      </div>
                      <span className="text-[9px] text-[#C2410C] font-mono">SIMULATED</span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[10px] text-[#64748B] font-mono">Current (Simulated)</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className={`text-xl font-bold font-mono ${chTripped ? "text-red-700" : chHigh ? "text-amber-700" : "text-[#172033]"}`}>
                          {ch.current.toFixed(2)}
                        </span>
                        <span className="text-xs text-[#64748B] font-mono">A</span>
                      </div>
                      <span className="text-[9px] text-[#C2410C] font-mono">SIMULATED</span>
                    </div>

                    <div className="col-span-2 pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
                      <span className="text-[10px] text-blue-600 font-mono uppercase">
                        APPARENT POWER
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-base font-bold text-[#172033] font-mono">
                          {ch.apparent_power.toFixed(1)}
                        </span>
                        <span className="text-xs text-[#64748B] font-mono">VA</span>
                      </div>
                    </div>
                  </div>

                  {/* Relay Status Matrix */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[#F8FAFC] border border-[#E2E8F0]">
                      <span className="text-[#64748B] font-mono text-[11px]">Main Relay:</span>
                      <span className={`text-[11px] font-bold font-mono ${ch.main_relay ? "text-green-700" : "text-red-700"}`}>
                        {ch.main_relay ? "CLOSED (ON)" : "OPEN (OFF)"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[#F8FAFC] border border-[#E2E8F0]">
                      <span className="text-[#64748B] font-mono text-[11px]">Auxiliary Relay:</span>
                      <span className={`text-[11px] font-bold font-mono ${ch.aux_relay ? "text-green-700" : "text-red-700"}`}>
                        {ch.aux_relay ? "CLOSED (ON)" : "OPEN (OFF)"}
                      </span>
                    </div>

                    {/* Prototype Bulb State */}
                    <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[#F8FAFC] border border-[#E2E8F0]">
                      <div className="flex items-center gap-1.5">
                        <Lightbulb className={`w-3.5 h-3.5 ${ch.load_active ? "text-amber-500 fill-amber-500" : "text-slate-400"}`} />
                        <span className="text-[#64748B] font-mono text-[11px]">Prototype Bulb:</span>
                      </div>
                      <span className={`text-[11px] font-bold font-mono ${ch.load_active ? "text-green-700" : "text-slate-500"}`}>
                        {ch.load_active ? "ACTIVE (GLOWING)" : "INACTIVE (OFF)"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Simulated Channel Action */}
                <button
                  onClick={() => triggerDemoAction("OVERCURRENT", ch.channel)}
                  className="w-full py-2 rounded-lg bg-white hover:bg-red-50 text-red-700 border border-[#CBD5E1] hover:border-red-300 text-xs font-mono font-semibold transition-all cursor-pointer"
                >
                  Trip CH {ch.channel}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Exhibition Event Timeline (Section 18) */}
      <div className="bg-white p-5 border border-[#E2E8F0] rounded-xl shadow-xs">
        <div className="flex items-center justify-between mb-3 border-b border-[#E2E8F0] pb-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-bold text-[#172033] font-mono uppercase tracking-wider">
              DEMO EVENT TIMELINE
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[#64748B]">
            Audit Trail of Simulated Transitions
          </span>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {timeline.length === 0 ? (
            <div className="text-xs font-mono text-[#64748B] py-4 text-center">
              No simulated events recorded. System baseline is Nominal.
            </div>
          ) : (
            timeline.slice().reverse().map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-mono"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[#64748B]">{item.time}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    item.state.includes("NORMAL") || item.state.includes("RESET") ? "bg-green-50 text-green-700 border border-green-200" :
                    item.state.includes("FAULT") || item.state.includes("TRIP") ? "bg-red-50 text-red-700 border border-red-200" :
                    "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}>
                    {item.state}
                  </span>
                  <span className="text-[#172033]">{item.desc}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Demo Multi-Channel Trip Confirmation Modal (Part W) */}
      {showTripModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150 font-mono">
          <div className="relative w-full max-w-md rounded-2xl bg-white border border-[#E2E8F0] shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2 text-red-700 font-bold text-xs uppercase tracking-wider">
                <AlertOctagon className="w-4 h-4" />
                <span>MAINTENANCE / DEMONSTRATION ACTION</span>
              </div>
              <button
                onClick={() => setShowTripModal(false)}
                className="text-[#64748B] hover:text-[#172033] text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-[#172033]">
                Confirm simulated de-energization for selected prototype load channels:
              </p>
              <div className="p-3 rounded-lg bg-[#EFF6FF] border border-[#2563EB] text-[#1D4ED8] font-bold">
                Selected: {Array.from(selectedChannels).sort((a, b) => a - b).map(c => `CH${c}`).join(", ")}
              </div>
              <p className="text-[11px] text-[#64748B] leading-relaxed">
                The simulated Main Relay and Auxiliary Relay pairs will be commanded OPEN. Channels not selected ({[1, 2, 3, 4].filter(c => !selectedChannels.has(c)).map(c => `CH${c}`).join(", ") || "None"}) will remain completely unaffected.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
              <button
                onClick={() => setShowTripModal(false)}
                className="px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#172033] text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDemoTrip}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Confirm Demo Trip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Biometric Verification Modal for Demo Reset (Section 13) */}
      <FaceVerificationModal
        channel={Array.from(selectedChannels)[0] || 1}
        channels={Array.from(selectedChannels)}
        faultType="OVERCURRENT"
        measuredCurrent={simulateUnsafeCurrent ? 3.45 : 1.20}
        isOpen={isFaceAuthOpen}
        onClose={() => setIsFaceAuthOpen(false)}
        onSuccess={handleFaceAuthSuccess}
      />
    </AppShell>
  );
}
