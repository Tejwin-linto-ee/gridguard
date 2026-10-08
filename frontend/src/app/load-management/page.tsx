"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { api } from "@/lib/api";
import { Sliders, ShieldAlert, CheckCircle2, AlertTriangle, ArrowDownRight, RefreshCw } from "lucide-react";

export default function LoadManagementPage() {
  const { system, channels, loadSheddingActive, refresh } = useLiveTelemetry();
  const [demandLimit, setDemandLimit] = useState(1200);
  const [priorities, setPriorities] = useState<Record<number, string>>({
    1: "CRITICAL",
    2: "IMPORTANT",
    3: "NORMAL",
    4: "NON-ESSENTIAL",
  });
  const [events, setEvents] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadConfig = async () => {
    try {
      const [cfg, evts] = await Promise.all([
        api.getLoadSheddingConfig(),
        api.getLoadSheddingEvents(),
      ]);
      if (cfg?.system_demand_limit_w) setDemandLimit(cfg.system_demand_limit_w);
      if (cfg?.channel_priorities) setPriorities(cfg.channel_priorities);
      if (Array.isArray(evts)) setEvents(evts);
    } catch {
      // Defaults already set
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.updateLoadSheddingConfig({
        system_demand_limit_w: demandLimit,
        channel_priorities: priorities,
      });
      setNotice("Load shedding priorities & threshold updated and audited.");
      setTimeout(() => setNotice(null), 3500);
    } catch (err: any) {
      setNotice(err.message || "Failed to update configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    try {
      setSaving(true);
      await api.resetLoadShedding();
      setNotice("Load shedding state dismissed and all shed load channels re-energized.");
      refresh();
      loadConfig();
      setTimeout(() => setNotice(null), 3500);
    } catch (err: any) {
      setNotice(err.message || "Failed to restore loads");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="PRIORITY-BASED LOAD SHEDDING MANAGEMENT" dataSource={system.data_source} onRefresh={() => { refresh(); loadConfig(); }}>
      {notice && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="font-medium">{notice}</span>
        </div>
      )}

      {/* Status Banner */}
      <div className={`p-5 rounded-xl border flex flex-wrap items-center justify-between gap-4 font-mono shadow-xs ${
        loadSheddingActive
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-[#E2E8F0] bg-white text-[#172033]"
      }`}>
        <div className="flex items-center gap-3.5">
          <div className={`p-2.5 rounded-lg border ${
            loadSheddingActive ? "bg-amber-100 border-amber-300 text-amber-800" : "bg-green-50 border-green-200 text-green-700"
          }`}>
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#172033] font-mono uppercase">
              {loadSheddingActive ? "AUTOMATED LOAD SHEDDING ACTIVE" : "SYSTEM CAPACITY ADEQUATE (NORMAL)"}
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Current PZEM Active Power: <strong className="text-[#172033] font-mono">{system.power != null ? system.power.toFixed(1) : "---"} W</strong> • Configured System Ceiling: <strong className="text-blue-700 font-mono">{demandLimit} W</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {loadSheddingActive && (
            <button
              onClick={handleRestore}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-mono font-bold tracking-wide transition-all shadow-xs cursor-pointer"
            >
              RESTORE SHED LOADS NOW
            </button>
          )}
          <div className="text-xs font-mono text-[#172033] bg-[#F8FAFC] px-3.5 py-1.5 rounded-lg border border-[#E2E8F0]">
            Load Margin: <strong className="text-blue-700">{system.power != null ? (demandLimit - system.power).toFixed(1) : "---"} W</strong> Available
          </div>
        </div>
      </div>

      {/* Priority Configuration Matrix */}
      <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
          <div>
            <h3 className="text-xs font-bold text-[#172033] uppercase font-mono tracking-wider">
              PROTOTYPE LOAD CHANNEL PRIORITY CONFIGURATION
            </h3>
            <p className="text-[11px] text-[#64748B] mt-0.5">
              Channels are shed in ascending order: Non-Essential (1st) ➔ Normal (2nd) ➔ Important (3rd) ➔ Critical (Protected)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestore}
              disabled={saving}
              className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-[#64748B] hover:text-[#172033] text-xs font-mono font-bold tracking-wide transition-all border border-[#CBD5E1]"
            >
              RESET ALL LOADS
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-mono font-bold tracking-wide transition-all shadow-xs"
            >
              {saving ? "SAVING..." : "SAVE CONFIGURATION"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((ch) => (
            <div key={ch} className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#172033] font-mono">CHANNEL {ch}</span>
                <span className="text-[10px] text-[#64748B] font-medium">Bulb {ch}</span>
              </div>

              <div>
                <label className="text-[10px] text-[#64748B] uppercase font-mono font-semibold">Priority Classification:</label>
                <select
                  value={priorities[ch] || "NORMAL"}
                  onChange={(e) => setPriorities({ ...priorities, [ch]: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-white border border-[#CBD5E1] text-xs text-[#172033] font-mono focus:border-blue-600"
                >
                  <option value="CRITICAL">1. CRITICAL (Protected)</option>
                  <option value="IMPORTANT">2. IMPORTANT</option>
                  <option value="NORMAL">3. NORMAL</option>
                  <option value="NON-ESSENTIAL">4. NON-ESSENTIAL (Shed 1st)</option>
                </select>
              </div>

              <div className="pt-2 border-t border-[#E2E8F0] text-[10px] text-[#64748B] font-mono">
                Current Apparent Power: <strong className="text-[#172033]">{channels.find((c) => c.channel === ch)?.apparent_power != null ? `${channels.find((c) => c.channel === ch)!.apparent_power!.toFixed(1)} VA` : "---"}</strong>
              </div>
            </div>
          ))}
        </div>

        {/* Demand Ceiling Slider */}
        <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#172033] font-bold">TOTAL SYSTEM DEMAND LIMIT:</span>
            <span className="text-blue-700 font-bold text-sm">{demandLimit} W</span>
          </div>
          <input
            type="range"
            min="600"
            max="2500"
            step="50"
            value={demandLimit}
            onChange={(e) => setDemandLimit(parseInt(e.target.value, 10))}
            className="w-full accent-blue-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[#64748B] font-mono">
            <span>600 W (Sensitive)</span>
            <span>1200 W (Nominal Limit)</span>
            <span>2500 W (Max Prototype Capacity)</span>
          </div>
        </div>
      </div>

      {/* Load Shedding History Log */}
      <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
        <h3 className="text-xs font-bold text-[#172033] uppercase font-mono tracking-wider mb-3">
          AUTOMATED LOAD SHEDDING EVENT LOG
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Shed Channel</th>
                <th className="py-2.5 px-3">Priority Level</th>
                <th className="py-2.5 px-3">Reason</th>
                <th className="py-2.5 px-3">System Demand</th>
                <th className="py-2.5 px-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {events.map((evt, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-3 text-[#64748B]">
                    {new Date(evt.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-[#172033] font-bold">Channel {evt.channel}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-[#475569] font-semibold border border-slate-200">
                      {evt.priority_level}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-[#172033]">{evt.reason}</td>
                  <td className="py-2.5 px-3 text-blue-700 font-medium">{evt.system_demand_w} W</td>
                  <td className="py-2.5 px-3">
                    <span className="text-[10px] font-bold text-amber-700">{evt.action}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
