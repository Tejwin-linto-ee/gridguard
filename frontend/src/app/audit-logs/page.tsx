"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { ClipboardList, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await api.getAuditLogs();
        setLogs(data);
      } catch {
        setLogs([]);
      }
    };
    fetchLogs();
  }, []);

  return (
    <AppShell title="SECURITY & OPERATIONAL AUDIT TRAIL">
      <div className="scada-panel p-5 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                IMMUTABLE SYSTEM EVENT & ACTION LEDGER
              </h2>
              <p className="text-[11px] text-slate-400">
                Logins, relay commands, threshold edits, and face-recognition reset events
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-400">{logs.length} Total Audit Entries</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Event Type</th>
                <th className="py-2.5 px-3">Component</th>
                <th className="py-2.5 px-3">Description & Audit Metadata</th>
                <th className="py-2.5 px-3">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-3 text-slate-400">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-blue-400 font-bold">{log.event_type}</td>
                  <td className="py-2.5 px-3 text-white">{log.component}</td>
                  <td className="py-2.5 px-3 text-slate-300 max-w-md truncate">{log.description}</td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.severity === "CRITICAL"
                        ? "bg-red-500/20 text-red-400"
                        : log.severity === "WARNING"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-emerald-500/20 text-emerald-400"
                    }`}>
                      {log.severity}
                    </span>
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
