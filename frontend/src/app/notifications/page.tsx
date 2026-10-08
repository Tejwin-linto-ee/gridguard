"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { api } from "@/lib/api";
import { Bell, Mail, ShieldAlert, CheckCircle2, AlertOctagon, Check } from "lucide-react";

export default function NotificationsPage() {
  const { system, refresh } = useLiveTelemetry();
  const [notifications, setNotifications] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const data = await api.getNotifications();
      if (Array.isArray(data)) setNotifications(data);
    } catch {
      setNotifications([]);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const markRead = async (id: number) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch (e) {
      console.warn("Failed to mark read", e);
    }
  };

  return (
    <AppShell title="REAL-TIME NOTIFICATION & DISPATCH CENTER" dataSource={system.data_source} onRefresh={() => { refresh(); loadData(); }}>
      <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs space-y-4 font-sans">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
              <Bell className="w-5 h-5 text-[#2563EB]" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-[#172033] uppercase font-mono tracking-wider">
                SAFETY ALERTS &amp; DISPATCH NOTIFICATIONS
              </h2>
              <p className="text-[11px] text-[#64748B]">
                Automated email alerts dispatched via secure backend relay
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-[#64748B]">
            <strong className="text-[#172033]">{notifications.filter((n) => !n.is_read).length}</strong> Unread Alerts
          </span>
        </div>

        <div className="space-y-3">
          {notifications.map((n) => {
            const isCrit = n.severity === "CRITICAL";
            const isWarn = n.severity === "WARNING";
            return (
              <div
                key={n.id}
                className={`p-4 rounded-xl border flex items-start justify-between gap-4 transition-all shadow-xs ${
                  isCrit
                    ? "bg-[#FEF2F2] border-[#FECACA]"
                    : isWarn
                    ? "bg-[#FFFBEB] border-[#FDE68A]"
                    : "bg-[#F8FAFC] border-[#E2E8F0]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs mt-0.5">
                    {isCrit ? (
                      <AlertOctagon className="w-4 h-4 text-[#DC2626]" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-[#2563EB]" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#172033] font-mono">{n.title}</span>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase font-mono border ${
                          isCrit
                            ? "bg-white text-[#B91C1C] border-[#FECACA]"
                            : isWarn
                            ? "bg-white text-[#B45309] border-[#FDE68A]"
                            : "bg-white text-[#2563EB] border-[#BFDBFE]"
                        }`}
                      >
                        {n.severity}
                      </span>
                    </div>
                    <p className="text-xs text-[#475569] mt-1">{n.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-[#64748B] font-mono">
                      <span>{new Date(n.timestamp).toLocaleString()}</span>
                      {n.email_dispatched && (
                        <span className="flex items-center gap-1 text-[#15803D] font-semibold">
                          <Mail className="w-3 h-3" /> Email Dispatched
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {!n.is_read && (
                  <button
                    onClick={() => markRead(n.id)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#475569] hover:text-[#172033] border border-[#CBD5E1] text-xs font-mono shrink-0 shadow-2xs transition-colors cursor-pointer"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
