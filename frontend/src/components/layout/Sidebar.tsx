"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSystemHealth } from "@/context/SystemHealthContext";
import {
  ShieldAlert, LayoutDashboard, Activity, Cpu, AlertTriangle, BarChart3,
  Sliders, Bot, TrendingUp, Wrench, Bell, HeartPulse, Settings, Users,
  ClipboardList, PlayCircle, LogOut, Radio, Timer, History
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "OPERATIONS",
    items: [
      { name: "Overview", href: "/", icon: LayoutDashboard },
      { name: "Live Monitoring", href: "/live", icon: Activity },
      { name: "Digital Twin", href: "/digital-twin", icon: Cpu },
      { name: "Fault Center", href: "/faults", icon: AlertTriangle },
    ]
  },
  {
    title: "CONTROL",
    items: [
      { name: "Load Management", href: "/load-management", icon: Sliders },
      { name: "Event Timeline", href: "/timeline", icon: History },
    ]
  },
  {
    title: "INTELLIGENCE",
    items: [
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Forecasting", href: "/forecasting", icon: TrendingUp },
      { name: "AI Intelligence", href: "/ai", icon: Bot, badge: "AI" },
    ]
  },
  {
    title: "SYSTEM",
    items: [
      { name: "System Health", href: "/system-health", icon: HeartPulse },
      { name: "Maintenance", href: "/maintenance", icon: Wrench },
      { name: "Notifications", href: "/notifications", icon: Bell },
    ]
  },
  {
    title: "ADMINISTRATION",
    items: [
      { name: "Authorized Operators", href: "/users", icon: Users },
      { name: "Biometric Security", href: "/security/biometric", icon: ShieldAlert, badge: "AUTH" },
      { name: "Audit Logs", href: "/audit-logs", icon: ClipboardList },
      { name: "Settings", href: "/settings", icon: Settings },
    ]
  },
  {
    title: "EXHIBITION",
    items: [
      { name: "Demo Simulator", href: "/demo", icon: PlayCircle, badge: "SIM" },
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname();
  const { physicalEsp32, simulator } = useSystemHealth();

  let telemetryLabel = "System Telemetry: WAITING FOR DEVICE";
  let esp32Badge = "Physical ESP32: NOT CONNECTED";

  if (physicalEsp32.isLive) {
    telemetryLabel = "System Telemetry: LIVE — ESP32";
    esp32Badge = "Physical ESP32: ONLINE";
  } else if (simulator.isLive) {
    telemetryLabel = "System Telemetry: LIVE — SIMULATOR";
    esp32Badge = "Physical ESP32: NOT CONNECTED";
  } else {
    telemetryLabel = "System Telemetry: WAITING FOR DEVICE";
    esp32Badge = "Physical ESP32: NOT CONNECTED";
  }

  return (
    <aside className="w-64 bg-white border-r border-[#E2E8F0] flex flex-col h-screen select-none shrink-0 sticky top-0 z-30 font-sans">
      {/* Platform Branding Header */}
      <div className="p-4 border-b border-[#E2E8F0] flex items-center gap-3 bg-white">
        <div className="w-9 h-9 rounded-lg bg-[#2563EB] flex items-center justify-center text-white shrink-0 shadow-xs">
          <ShieldAlert className="w-5 h-5 text-white" />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#172033] text-base tracking-wider font-mono">GRIDGUARD</span>
            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
              PRO
            </span>
          </div>
          <span className="text-[11px] text-[#64748B] truncate font-medium">Smart Transformer Protection</span>
        </div>
      </div>

      {/* Navigation Links Grouped by Operations, Control, Intelligence, System, Administration, Exhibition */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-0.5">
            <div className="px-3 py-1 text-[10px] font-bold tracking-wider text-[#94A3B8] uppercase font-mono">
              {group.title}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors group ${
                    isActive
                      ? "bg-[#EFF6FF] text-[#2563EB] font-semibold border-l-2 border-[#2563EB]"
                      : "text-[#475569] hover:text-[#172033] hover:bg-[#F8FAFC]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? "text-[#2563EB]" : "text-[#64748B] group-hover:text-[#172033]"
                      }`}
                    />
                    <span className="truncate">{item.name}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        isActive
                          ? "bg-[#2563EB] text-white"
                          : item.badge === "SIM"
                          ? "bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA]"
                          : "bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Operator & System Status Footer */}
      <div className="p-3 border-t border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="space-y-1 mb-2">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                physicalEsp32.isLive
                  ? "bg-[#16A34A]"
                  : simulator.isLive
                  ? "bg-blue-600"
                  : "bg-[#64748B]"
              }`}
            />
            <span className="text-[11px] text-[#475569] font-medium truncate" title={telemetryLabel}>
              {telemetryLabel}
            </span>
          </div>
          <div className="text-[10px] text-[#64748B] font-mono pl-4">
            {esp32Badge}
          </div>
        </div>

        <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[#172033]">Lead Operator</span>
            <span className="text-[10px] text-[#15803D] font-mono">ROLE: OPERATOR</span>
          </div>
          <Link
            href="/login"
            title="Log Out / Switch User"
            className="text-[#64748B] hover:text-[#DC2626] p-1.5 rounded transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
