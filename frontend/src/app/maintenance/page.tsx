"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { api } from "@/lib/api";
import { ChannelSelector } from "@/components/maintenance/ChannelSelector";
import { MaintenanceTripModal } from "@/components/maintenance/MaintenanceTripModal";
import { FaceResetModal } from "@/components/faults/FaceResetModal";
import {
  Wrench, Calendar, Clock, CheckCircle2, AlertTriangle, Plus,
  ShieldCheck, PowerOff, ShieldAlert, FileText, Check, AlertOctagon, History, X
} from "lucide-react";

export default function MaintenancePage() {
  const { channels, hasLiveData, refresh } = useLiveTelemetry();
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set());
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"LOGBOOK" | "SCHEDULE" | "AUDIT">("LOGBOOK");

  const [showAddModal, setShowAddModal] = useState(false);
  const [newRec, setNewRec] = useState({
    channel: 1,
    maintenance_type: "ROUTINE_INSPECTION",
    description: "Inspection of relay contacts and terminal screws",
    action_taken: "Verified terminal torque and contact resistance under load",
    notes: "Nominal operation verified",
  });
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      const data = await api.getMaintenance();
      if (Array.isArray(data)) setRecords(data);
    } catch {
      // Fallback
    }

    try {
      const logs = await api.getAuditLogs();
      if (Array.isArray(logs)) {
        const maintLogs = logs.filter((l) =>
          l.action?.includes("MAINTENANCE") || l.action?.includes("RESET") || l.action?.includes("RELAY")
        );
        setAuditLogs(maintLogs);
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateRecord = async () => {
    try {
      setSaving(true);
      await api.createMaintenance(newRec);
      setShowAddModal(false);
      loadData();
    } catch (err) {
      console.warn("Error creating record:", err);
    } finally {
      setSaving(false);
    }
  };

  // Channels requiring attention
  const channelsRequiringAttention = channels.filter(
    (c) => c.status === "FAULT LATCHED" || c.status === "TRIPPED" || c.status === "MAINTENANCE" || (c.operating_hours || 0) > 250
  );

  return (
    <AppShell
      title="MAINTENANCE CONTROL CENTER"
      dataSource={hasLiveData ? "LIVE MQTT" : "WAITING FOR MQTT"}
      onRefresh={() => {
        refresh();
        loadData();
      }}
    >
      {/* Maintenance Center Top Alert if channels require attention */}
      {channelsRequiringAttention.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs font-mono shadow-xs">
          <div className="flex items-center gap-2.5 text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>ATTENTION REQUIRED:</strong> {channelsRequiringAttention.length} channel(s) in maintenance, latched, or due for contact inspection.
            </span>
          </div>
          <button
            onClick={() => {
              const chIds = channelsRequiringAttention.map((c) => c.channel);
              setSelectedChannels(new Set(chIds));
            }}
            className="px-3 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-[11px] font-bold transition-colors cursor-pointer"
          >
            SELECT ATTENTION CHANNELS ({channelsRequiringAttention.length})
          </button>
        </div>
      )}

      {/* 1. Multi-Channel Selection Control */}
      <ChannelSelector
        channels={channels}
        selectedChannels={selectedChannels}
        onSelectionChange={setSelectedChannels}
        onTripClick={() => setIsTripModalOpen(true)}
        onResetClick={() => setIsResetModalOpen(true)}
      />

      {/* 2. Channel Contact & Operating Hours Cards */}
      <div>
        <div className="flex items-center justify-between mb-2.5 font-mono">
          <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider">
            CHANNEL CONTACT DUTY CYCLE &amp; OPERATING HEALTH
          </h3>
          <span className="text-[10px] text-[#64748B]">Dual Relays (Main + Aux) Per Channel</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
          {channels.map((ch) => {
            const hours = ch.operating_hours || 120.0;
            const isDue = hours > 300;
            const isDueSoon = hours > 200;

            return (
              <div key={ch.channel} className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#172033] text-sm">Channel 0{ch.channel}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      ch.status === "MAINTENANCE"
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : ch.status === "NORMAL"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {ch.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Operating Hours:</span>
                    <span className="font-bold text-[#172033]">{hours.toFixed(1)} h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Trip Operations:</span>
                    <span className="font-bold text-[#172033]">{ch.trip_count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Relay Main State:</span>
                    <span className={`font-bold ${ch.main_relay ? "text-emerald-700" : "text-red-700"}`}>
                      {ch.main_relay ? "CLOSED (ON)" : "OPEN (OFF)"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Relay Aux State:</span>
                    <span className={`font-bold ${ch.aux_relay ? "text-emerald-700" : "text-red-700"}`}>
                      {ch.aux_relay ? "CLOSED (ON)" : "OPEN (OFF)"}
                    </span>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-[#E2E8F0] flex items-center justify-between text-[10px]">
                  <span className="text-[#64748B]">Contact Duty:</span>
                  <span className={isDue ? "text-red-700 font-bold" : isDueSoon ? "text-amber-700 font-bold" : "text-emerald-700 font-bold"}>
                    {isDue ? "INSPECTION DUE" : isDueSoon ? "DUE SOON" : "NOMINAL"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Maintenance Records & Schedules Tabs */}
      <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs space-y-4 font-mono">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("LOGBOOK")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === "LOGBOOK"
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "bg-white text-[#64748B] hover:text-[#172033] border border-[#CBD5E1]"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>SERVICE LOGBOOK ({records.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("SCHEDULE")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === "SCHEDULE"
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "bg-white text-[#64748B] hover:text-[#172033] border border-[#CBD5E1]"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>PREVENTIVE SCHEDULE</span>
            </button>

            <button
              onClick={() => setActiveTab("AUDIT")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === "AUDIT"
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "bg-white text-[#64748B] hover:text-[#172033] border border-[#CBD5E1]"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>BIOMETRIC AUDIT TRAIL</span>
            </button>
          </div>

          {activeTab === "LOGBOOK" && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>LOG RECORD</span>
            </button>
          )}
        </div>

        {/* Tab 1: Service Logbook */}
        {activeTab === "LOGBOOK" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Channel</th>
                  <th className="py-2.5 px-3">Service Type</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3">Technician</th>
                  <th className="py-2.5 px-3">Action Taken</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-[#64748B]">
                      No maintenance records logged yet. Use &quot;LOG RECORD&quot; to add an entry.
                    </td>
                  </tr>
                ) : (
                  records.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-[#64748B]">
                        {new Date(r.date).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3 text-[#172033] font-bold">CH {r.channel}</td>
                      <td className="py-2.5 px-3 text-blue-700 font-medium">{r.maintenance_type}</td>
                      <td className="py-2.5 px-3 text-[#172033]">{r.description}</td>
                      <td className="py-2.5 px-3 text-[#64748B]">{r.technician}</td>
                      <td className="py-2.5 px-3 text-[#172033]">{r.action_taken}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                          {r.status || "COMPLETED"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Preventive Schedule */}
        {activeTab === "SCHEDULE" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="flex items-center justify-between text-blue-700 font-bold">
                <span>INSTRUMENTATION DIAGNOSTICS</span>
                <span className="text-[10px] text-[#64748B]">30 DAYS</span>
              </div>
              <p className="text-[#64748B] text-[11px]">
                Periodic diagnostic check of signal integrity across all 4 analog channels.
              </p>
              <div className="text-[10px] text-[#94A3B8]">Assigned: Electrical Lead</div>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="flex items-center justify-between text-emerald-700 font-bold">
                <span>RELAY CONTACT INSPECTION</span>
                <span className="text-[10px] text-[#64748B]">60 DAYS</span>
              </div>
              <p className="text-[#64748B] text-[11px]">
                Measure contact resistance on Main &amp; Aux relay terminals under full bulb load.
              </p>
              <div className="text-[10px] text-[#94A3B8]">Assigned: Safety Engineer</div>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="flex items-center justify-between text-amber-700 font-bold">
                <span>INSULATION RESISTANCE TEST</span>
                <span className="text-[10px] text-[#64748B]">90 DAYS</span>
              </div>
              <p className="text-[#64748B] text-[11px]">
                High-voltage 500V DC insulation test between common live bus and neutral return line.
              </p>
              <div className="text-[10px] text-[#94A3B8]">Assigned: Master Electrician</div>
            </div>
          </div>
        )}

        {/* Tab 3: Biometric Audit Trail */}
        {activeTab === "AUDIT" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Operator</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Target</th>
                  <th className="py-2.5 px-3">Result</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-[#64748B]">
                      No maintenance audit entries found in log.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((l, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-[#64748B]">{new Date(l.timestamp).toLocaleTimeString()}</td>
                      <td className="py-2.5 px-3 text-[#172033] font-semibold">{l.user_id}</td>
                      <td className="py-2.5 px-3 text-blue-700 font-medium">{l.action}</td>
                      <td className="py-2.5 px-3 text-amber-700 font-medium">{l.target}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${l.status === "SUCCESS" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#64748B] text-[11px] truncate max-w-xs">{l.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Multi-Channel Maintenance Trip Modal */}
      <MaintenanceTripModal
        selectedChannels={Array.from(selectedChannels).sort((a, b) => a - b)}
        isOpen={isTripModalOpen}
        onClose={() => setIsTripModalOpen(false)}
        onSuccess={() => {
          setIsTripModalOpen(false);
          refresh();
          loadData();
        }}
      />

      {/* Multi-Channel Maintenance Reset Modal */}
      {isResetModalOpen && (
        <FaceResetModal
          channels={Array.from(selectedChannels).sort((a, b) => a - b)}
          isOpen={true}
          onClose={() => setIsResetModalOpen(false)}
          onSuccess={() => {
            setIsResetModalOpen(false);
            refresh();
            loadData();
          }}
        />
      )}

      {/* Log Maintenance Record Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs font-mono text-xs">
          <div className="w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <span className="font-bold text-[#172033] uppercase text-sm">LOG SERVICE RECORD</span>
              <button onClick={() => setShowAddModal(false)} className="text-[#64748B] hover:text-[#172033]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[#64748B] font-semibold block mb-1">Target Channel:</label>
                <select
                  value={newRec.channel}
                  onChange={(e) => setNewRec({ ...newRec, channel: parseInt(e.target.value, 10) })}
                  className="w-full p-2.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033]"
                >
                  <option value="1">Channel 01 (Bulb 1)</option>
                  <option value="2">Channel 02 (Bulb 2)</option>
                  <option value="3">Channel 03 (Bulb 3)</option>
                  <option value="4">Channel 04 (Bulb 4)</option>
                </select>
              </div>

              <div>
                <label className="text-[#64748B] font-semibold block mb-1">Service Type:</label>
                <select
                  value={newRec.maintenance_type}
                  onChange={(e) => setNewRec({ ...newRec, maintenance_type: e.target.value })}
                  className="w-full p-2.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033]"
                >
                  <option value="ROUTINE_INSPECTION">Routine Inspection</option>
                  <option value="RELAY_CONTACT_TEST">Relay Contact Test</option>
                  <option value="POST_TRIP_INSPECTION">Post-Trip Inspection</option>
                </select>
              </div>

              <div>
                <label className="text-[#64748B] font-semibold block mb-1">Description:</label>
                <input
                  type="text"
                  value={newRec.description}
                  onChange={(e) => setNewRec({ ...newRec, description: e.target.value })}
                  className="w-full p-2.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033]"
                />
              </div>

              <div>
                <label className="text-[#64748B] font-semibold block mb-1">Action Taken:</label>
                <textarea
                  value={newRec.action_taken}
                  onChange={(e) => setNewRec({ ...newRec, action_taken: e.target.value })}
                  rows={2}
                  className="w-full p-2.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3.5 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#64748B] hover:text-[#172033]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateRecord}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs"
              >
                {saving ? "Saving..." : "Save Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
