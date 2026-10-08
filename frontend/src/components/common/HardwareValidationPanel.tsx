"use client";

import React, { useState, useEffect } from "react";
import {
  Cpu,
  Wifi,
  WifiOff,
  RefreshCw,
  Zap,
  PowerOff,
  UserCheck,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Send,
  Terminal,
  Activity,
  Layers,
  CheckSquare,
  PlayCircle
} from "lucide-react";
import { api } from "@/lib/api";

interface HardwareValidationPanelProps {
  deviceMode?: string;
  hardwareType?: string;
  esp32Status?: "ONLINE" | "OFFLINE";
  onRequestTrip?: (channel: number) => void;
  onRequestReset?: (channel: number) => void;
  onRefresh?: () => void;
}

export function HardwareValidationPanel({
  deviceMode = "SIMULATOR",
  hardwareType = "ESP32-S3 SIMULATOR",
  esp32Status = "OFFLINE",
  onRequestTrip,
  onRequestReset,
  onRefresh,
}: HardwareValidationPanelProps) {
  const [currentMode, setCurrentMode] = useState<string>(deviceMode);
  const [selectedChannel, setSelectedChannel] = useState<number>(1);
  const [activeScenario, setActiveScenario] = useState<string>("NORMAL");
  const [simRunning, setSimRunning] = useState<boolean>(true);
  const [simOnline, setSimOnline] = useState<boolean>(esp32Status === "ONLINE");
  const [customPower, setCustomPower] = useState<number>(6.0);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Commissioning state
  const [commissioningData, setCommissioningData] = useState<any>(null);
  const [showCommissioning, setShowCommissioning] = useState<boolean>(false);
  const [referencePower, setReferencePower] = useState<number>(6.0);
  const [powerValidationResult, setPowerValidationResult] = useState<any>(null);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setActionLog((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 10)]);
  };

  const fetchCommissioningStatus = async () => {
    try {
      const res = await api.getCommissioningStatus();
      if (res) setCommissioningData(res);
    } catch {
      // Ignore poll errors
    }
  };

  // Poll simulator and commissioning status
  useEffect(() => {
    const checkSim = async () => {
      try {
        const res = await api.getSimulatorStatus();
        if (res) {
          setSimRunning(res.running);
          setSimOnline(res.is_online);
          if (res.scenario) setActiveScenario(res.scenario);
        }
      } catch {
        // Backend or simulator not responding
      }
    };
    checkSim();
    fetchCommissioningStatus();
    const interval = setInterval(() => {
      checkSim();
      fetchCommissioningStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSetScenario = async (sc: string) => {
    setIsLoading(true);
    try {
      await api.setSimulatorScenario(sc);
      setActiveScenario(sc);
      addLog(`Scenario set to ${sc} per Section 24 specification`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      addLog(`Error setting scenario: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetOnline = async () => {
    setIsLoading(true);
    try {
      await api.setSimulatorOnline();
      setSimOnline(true);
      addLog("Simulator marked ONLINE — heartbeat & telemetry streaming");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      addLog(`Online error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetOffline = async () => {
    setIsLoading(true);
    try {
      await api.setSimulatorOffline();
      setSimOnline(false);
      addLog("Simulator marked OFFLINE — heartbeat stopped; telemetry stale/offline");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      addLog(`Offline error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartSim = async () => {
    setIsLoading(true);
    try {
      await api.startSimulator();
      setSimRunning(true);
      setSimOnline(true);
      addLog("Simulator process STARTED");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      addLog(`Start error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopSim = async () => {
    setIsLoading(true);
    try {
      await api.stopSimulator();
      setSimRunning(false);
      setSimOnline(false);
      addLog("Simulator process STOPPED — controller will transition to OFFLINE");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      addLog(`Stop error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetCustomPower = async () => {
    setIsLoading(true);
    try {
      await api.setSimulatorChannelPower(selectedChannel, customPower);
      addLog(`Injected ${customPower} W into CH${selectedChannel}`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      addLog(`Power inject error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = async (newMode: string) => {
    setIsLoading(true);
    try {
      const res = await api.setDeviceMode(newMode);
      setCurrentMode(res.device_mode || newMode);
      addLog(`Device Mode switched to ${newMode}`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      addLog(`Mode switch error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Commissioning Actions
  const handleStartCommissioning = async () => {
    setIsLoading(true);
    try {
      const res = await api.startCommissioning();
      setCommissioningData(res);
      addLog("Hardware Commissioning sequence initiated (20 Steps)");
    } catch (err: any) {
      addLog(`Commissioning start error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteStep = async (stepId: number, passed: boolean) => {
    setIsLoading(true);
    try {
      const res = await api.executeCommissioningStep(stepId, passed, `Step ${stepId} validated by operator`);
      setCommissioningData(res);
      addLog(`Commissioning Step ${stepId} ${passed ? "PASSED" : "FAILED"}`);
    } catch (err: any) {
      addLog(`Step execute error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRelayTest = async (channel: number, relayType: "MAIN" | "AUX", action: "ON" | "OFF") => {
    setIsLoading(true);
    try {
      const res = await api.testCommissioningRelay(channel, relayType, action, true);
      addLog(`Relay Test: CH${channel} ${relayType} -> ${action} (Physical Feedback: NOT_AVAILABLE)`);
      fetchCommissioningStatus();
    } catch (err: any) {
      addLog(`Relay test error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidatePower = async () => {
    setIsLoading(true);
    try {
      const res = await api.validateCommissioningPower(selectedChannel, referencePower);
      setPowerValidationResult(res);
      addLog(`Power Validation CH${selectedChannel}: GridGuard=${res.gridguard_w}W, Ref=${res.reference_w}W, Err=${res.error_pct}% (${res.status})`);
      fetchCommissioningStatus();
    } catch (err: any) {
      addLog(`Power validation error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteCommissioning = async () => {
    setIsLoading(true);
    try {
      const res = await api.completeCommissioning();
      if (res.warning) {
        addLog(`COMMISSIONING RESULT: ${res.status} — ${res.warning}`);
      } else {
        addLog(`COMMISSIONING COMPLETE: System marked ${res.device_mode}`);
      }
      fetchCommissioningStatus();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      addLog(`Commissioning completion error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono space-y-4 shadow-2xl">
      {/* 1. MANDATORY HARDWARE HONESTY BANNER (Section 31) */}
      <div className="bg-amber-950/40 border border-amber-600/60 rounded-lg p-2.5 flex items-center justify-between text-amber-300">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
          <span className="font-bold tracking-wide">
            WARNING: SIMULATOR VALIDATION DOES NOT CONSTITUTE PHYSICAL HARDWARE VALIDATION.
          </span>
        </div>
        <span className="bg-amber-900/60 text-amber-200 text-[10px] px-2 py-0.5 rounded font-bold uppercase border border-amber-700">
          PHYSICAL HARDWARE: NOT TESTED
        </span>
      </div>

      {/* Header Info & Device Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/60">
            <Cpu className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">HARDWARE COMMISSIONING & VALIDATION HARNESS</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-800 text-cyan-400 border border-slate-700">
                FW: v1.2.0-prod
              </span>
            </div>
            <div className="text-slate-400 text-[11px] flex items-center gap-2 mt-0.5">
              <span>CONTROLLER: <strong className="text-slate-200">{hardwareType}</strong></span>
              <span>•</span>
              <span>DEVICE MODE: <strong className="text-cyan-300">{currentMode}</strong></span>
              <span>•</span>
              <span>RELAY FEEDBACK: <strong className="text-amber-400">NOT_AVAILABLE</strong></span>
            </div>
          </div>
        </div>

        {/* 5-State Device Mode Selector (Section 5) */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
          <span className="text-[10px] text-slate-400 font-bold px-1">MODE:</span>
          {(["SOFTWARE_ONLY", "SIMULATOR", "REAL_HARDWARE", "HARDWARE_VALIDATION_PENDING", "HARDWARE_VALIDATED"] as const).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              disabled={isLoading}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                currentMode === m
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
              }`}
            >
              {m.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Controls, Scenarios, Injection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Column 1: Simulator Lifecycle */}
        <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between text-slate-300 font-bold border-b border-slate-800 pb-1.5">
            <div className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>1. SIMULATOR LIFECYCLE</span>
            </div>
            <span className={`text-[10px] font-bold ${simRunning ? "text-green-400" : "text-red-400"}`}>
              {simRunning ? "PROCESS RUNNING" : "PROCESS STOPPED"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleStartSim}
              disabled={isLoading || simRunning}
              className={`py-1.5 px-2 rounded font-bold text-[10px] transition-colors ${
                simRunning ? "bg-slate-800 text-slate-600 cursor-not-allowed" : "bg-green-700 hover:bg-green-600 text-white"
              }`}
            >
              START SIMULATOR
            </button>
            <button
              onClick={handleStopSim}
              disabled={isLoading || !simRunning}
              className={`py-1.5 px-2 rounded font-bold text-[10px] transition-colors ${
                !simRunning ? "bg-slate-800 text-slate-600 cursor-not-allowed" : "bg-red-700 hover:bg-red-600 text-white"
              }`}
            >
              STOP SIMULATOR
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
            <button
              onClick={handleSetOnline}
              disabled={isLoading || !simRunning || simOnline}
              className={`py-1 px-2 rounded font-bold text-[10px] flex items-center justify-center gap-1 transition-colors ${
                simOnline || !simRunning ? "bg-slate-800 text-slate-600 cursor-not-allowed" : "bg-cyan-800 hover:bg-cyan-700 text-cyan-200"
              }`}
            >
              <Wifi className="w-3 h-3" />
              <span>STREAM ONLINE</span>
            </button>
            <button
              onClick={handleSetOffline}
              disabled={isLoading || !simRunning || !simOnline}
              className={`py-1 px-2 rounded font-bold text-[10px] flex items-center justify-center gap-1 transition-colors ${
                !simOnline || !simRunning ? "bg-slate-800 text-slate-600 cursor-not-allowed" : "bg-amber-800 hover:bg-amber-700 text-amber-200"
              }`}
            >
              <WifiOff className="w-3 h-3" />
              <span>TEST OFFLINE</span>
            </button>
          </div>
        </div>

        {/* Column 2: Deterministic Scenarios (Section 24) */}
        <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between text-slate-300 font-bold border-b border-slate-800 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>2. LOAD SCENARIOS (SEC 24)</span>
            </div>
            <span className="text-[10px] text-amber-400 font-bold">{activeScenario}</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => handleSetScenario("NORMAL")}
              className={`py-1.5 px-2 rounded font-bold text-[10px] border transition-colors ${
                activeScenario === "NORMAL"
                  ? "bg-green-600/30 text-green-300 border-green-500"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
            >
              NORMAL (5W, 6W, 4W, 7W)
            </button>
            <button
              onClick={() => handleSetScenario("HIGH_LOAD")}
              className={`py-1.5 px-2 rounded font-bold text-[10px] border transition-colors ${
                activeScenario === "HIGH_LOAD"
                  ? "bg-amber-600/30 text-amber-300 border-amber-500"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
            >
              HIGH LOAD (8W, 9W, 10W, 12W)
            </button>
            <button
              onClick={() => handleSetScenario("OVERLOAD")}
              className={`py-1.5 px-2 rounded font-bold text-[10px] border transition-colors ${
                activeScenario === "OVERLOAD"
                  ? "bg-red-600/30 text-red-300 border-red-500"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
            >
              OVERLOAD (13W, 15W, 20W, 30W)
            </button>
            <button
              onClick={() => handleSetScenario("MIXED")}
              className={`py-1.5 px-2 rounded font-bold text-[10px] border transition-colors ${
                activeScenario === "MIXED"
                  ? "bg-purple-600/30 text-purple-300 border-purple-500"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
            >
              MIXED (5W, 9W, 13W, 7W)
            </button>
          </div>
        </div>

        {/* Column 3: Active Power Injection & Trip/Reset */}
        <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between text-slate-300 font-bold border-b border-slate-800 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>3. POWER INJECTION (W)</span>
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map((ch) => (
                <button
                  key={ch}
                  onClick={() => setSelectedChannel(ch)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    selectedChannel === ch ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  CH{ch}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="40"
              step="0.1"
              value={customPower}
              onChange={(e) => setCustomPower(parseFloat(e.target.value) || 0)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-20 text-right text-white font-bold"
            />
            <span className="text-slate-400">Watts</span>
            <button
              onClick={handleSetCustomPower}
              disabled={isLoading}
              className="ml-auto px-2 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-[10px] transition-colors cursor-pointer"
            >
              INJECT
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
            <button
              onClick={() => onRequestTrip && onRequestTrip(selectedChannel)}
              className="py-1 px-2 rounded bg-red-700 hover:bg-red-600 text-white font-bold text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <PowerOff className="w-3 h-3" />
              <span>TRIP CH{selectedChannel} (AUTH)</span>
            </button>
            <button
              onClick={() => onRequestReset && onRequestReset(selectedChannel)}
              className="py-1 px-2 rounded bg-green-700 hover:bg-green-600 text-white font-bold text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <UserCheck className="w-3 h-3" />
              <span>RESET CH{selectedChannel} (AUTH)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 20-STEP COMMISSIONING ACCORDION / WORKFLOW (Section 12, 14, 15) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-white text-xs">PHYSICAL HARDWARE COMMISSIONING WORKFLOW (20 STEPS)</span>
            {commissioningData && (
              <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-emerald-300 font-bold border border-slate-700">
                {commissioningData.passed_count} / {commissioningData.total_steps} Passed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleStartCommissioning}
              disabled={isLoading}
              className="px-2.5 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-[10px] flex items-center gap-1"
            >
              <PlayCircle className="w-3 h-3" />
              <span>START COMMISSIONING</span>
            </button>
            <button
              onClick={() => setShowCommissioning(!showCommissioning)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px]"
            >
              {showCommissioning ? "HIDE STEPS" : "SHOW STEPS"}
            </button>
          </div>
        </div>

        {showCommissioning && commissioningData && (
          <div className="space-y-3">
            {/* Step List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
              {commissioningData.steps.map((st: any) => (
                <div
                  key={st.step}
                  className={`p-2 rounded border flex items-center justify-between text-[11px] ${
                    st.status === "PASSED"
                      ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-300"
                      : st.status === "FAILED"
                      ? "bg-red-950/30 border-red-800/60 text-red-300"
                      : st.status === "RUNNING"
                      ? "bg-cyan-950/30 border-cyan-800/60 text-cyan-300"
                      : "bg-slate-800/40 border-slate-700/60 text-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700">
                      STEP {st.step}
                    </span>
                    <div>
                      <div className="font-bold text-slate-200">{st.name}</div>
                      <div className="text-[9px] text-slate-400">{st.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase">{st.status}</span>
                    {st.status !== "PASSED" && (
                      <button
                        onClick={() => handleExecuteStep(st.step, true)}
                        className="px-1.5 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[9px] font-bold"
                      >
                        PASS
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Guided Relay Testing (Section 15) */}
            <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                <span className="font-bold text-slate-300 text-[11px]">8 RELAY GUIDED COMMISSIONING TESTS</span>
                <span className="text-[9px] text-amber-400 font-bold">PHYSICAL CONTACT FEEDBACK: NOT_AVAILABLE</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((ch) => (
                  <div key={ch} className="bg-slate-900 p-2 rounded border border-slate-800 space-y-1.5">
                    <div className="font-bold text-slate-300 text-[10px]">CH{ch} OUTPUTS</div>
                    <div className="flex items-center justify-between gap-1 text-[9px]">
                      <span>MAIN:</span>
                      <button onClick={() => handleRelayTest(ch, "MAIN", "ON")} className="px-1.5 py-0.5 bg-slate-800 hover:bg-green-700 text-slate-300 rounded font-bold">ON</button>
                      <button onClick={() => handleRelayTest(ch, "MAIN", "OFF")} className="px-1.5 py-0.5 bg-slate-800 hover:bg-red-700 text-slate-300 rounded font-bold">OFF</button>
                    </div>
                    <div className="flex items-center justify-between gap-1 text-[9px]">
                      <span>AUX:</span>
                      <button onClick={() => handleRelayTest(ch, "AUX", "ON")} className="px-1.5 py-0.5 bg-slate-800 hover:bg-green-700 text-slate-300 rounded font-bold">ON</button>
                      <button onClick={() => handleRelayTest(ch, "AUX", "OFF")} className="px-1.5 py-0.5 bg-slate-800 hover:bg-red-700 text-slate-300 rounded font-bold">OFF</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Power Validation against Reference Meter (Requirement 3) */}
            <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                <span className="font-bold text-slate-300 text-[11px]">ACTIVE POWER CALIBRATION VALIDATION (ALL 4 CHANNELS)</span>
                <span className="text-[9px] text-cyan-400 font-bold">FIRMWARE CALIBRATION CONSTANTS LOCKED</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[10px] text-left">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800">
                      <th className="py-1 px-1.5 font-bold">PROTOTYPE LOAD CHANNEL</th>
                      <th className="py-1 px-1.5 font-bold">GRIDGUARD ACTIVE POWER</th>
                      <th className="py-1 px-1.5 font-bold">REFERENCE ACTIVE POWER</th>
                      <th className="py-1 px-1.5 font-bold">ABSOLUTE ERROR</th>
                      <th className="py-1 px-1.5 font-bold">ERROR %</th>
                      <th className="py-1 px-1.5 font-bold">CALIBRATION STATUS</th>
                      <th className="py-1 px-1.5 font-bold text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {[1, 2, 3, 4].map((ch) => {
                      const rec = commissioningData?.power_validations?.[ch] || {};
                      const isChValidated = rec.calibration_status === "VALIDATED" || rec.status === "PASSED";
                      return (
                        <tr key={ch} className="hover:bg-slate-900/50">
                          <td className="py-1.5 px-1.5 font-bold text-white">CH{ch} Prototype Load</td>
                          <td className="py-1.5 px-1.5 text-cyan-300">
                            {rec.gridguard_active_power != null ? `${rec.gridguard_active_power.toFixed(2)} W` : "---"}
                          </td>
                          <td className="py-1.5 px-1.5 text-slate-300">
                            {rec.reference_active_power != null ? `${rec.reference_active_power.toFixed(2)} W` : "---"}
                          </td>
                          <td className="py-1.5 px-1.5 text-slate-400">
                            {rec.absolute_error != null ? `${rec.absolute_error.toFixed(3)} W` : "---"}
                          </td>
                          <td className="py-1.5 px-1.5 text-slate-400">
                            {rec.error_pct != null ? `${rec.error_pct.toFixed(2)} %` : "---"}
                          </td>
                          <td className="py-1.5 px-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              isChValidated
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                : rec.status === "FAILED"
                                ? "bg-red-950 text-red-300 border border-red-800"
                                : "bg-slate-800 text-slate-400"
                            }`}>
                              {rec.calibration_status || rec.status || "UNVALIDATED"}
                            </span>
                          </td>
                          <td className="py-1.5 px-1.5 text-right">
                            <button
                              onClick={async () => {
                                setSelectedChannel(ch);
                                try {
                                  const res = await api.validateCommissioningPower(ch, referencePower);
                                  setPowerValidationResult(res);
                                  addLog(`Power Validation CH${ch}: GridGuard=${res.gridguard_active_power || res.gridguard_w}W, Ref=${res.reference_active_power || res.reference_w}W (${res.calibration_status || res.status})`);
                                  fetchCommissioningStatus();
                                } catch (err: any) {
                                  addLog(`Power validation error CH${ch}: ${err.message}`);
                                }
                              }}
                              className="px-2 py-0.5 bg-cyan-800 hover:bg-cyan-700 text-white rounded text-[9px] font-bold"
                            >
                              VALIDATE
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-[10px]">Reference Power Input:</span>
                  <input
                    type="number"
                    step="0.1"
                    value={referencePower}
                    onChange={(e) => setReferencePower(parseFloat(e.target.value) || 0)}
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 w-16 text-right text-white font-bold"
                  />
                  <span className="text-slate-400 text-[10px]">Ref Watts (Trusted External Meter)</span>
                </div>

                <button
                  onClick={handleCompleteCommissioning}
                  disabled={!commissioningData.is_complete}
                  className={`px-3 py-1.5 rounded font-bold text-[10px] ${
                    commissioningData.is_complete
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-lg"
                      : "bg-slate-800 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  FINALIZE COMMISSIONING → HARDWARE_VALIDATED
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Terminal Activity Log */}
      <div className="bg-black/70 rounded-lg p-2.5 border border-slate-800 text-[10px] text-slate-400 space-y-1">
        <div className="flex items-center justify-between text-slate-500 font-bold border-b border-slate-800 pb-1">
          <div className="flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>COMMISSIONING & VALIDATION AUDIT STREAM</span>
          </div>
          <span className="text-[9px]">End-to-End Correlation Tracking</span>
        </div>
        <div className="space-y-0.5 font-mono">
          {actionLog.length === 0 ? (
            <div className="text-slate-600 italic">No validation actions logged yet.</div>
          ) : (
            actionLog.map((log, i) => (
              <div key={i} className="text-slate-300">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
