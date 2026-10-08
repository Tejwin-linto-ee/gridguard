"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, PlayCircle, LogOut, Wifi, Server, RefreshCw, Camera, AlertOctagon, User, Info, CheckCircle2, Shield
} from "lucide-react";

import { useSystemHealth } from "@/context/SystemHealthContext";

interface TopbarProps {
  title?: string;
  dataSource?: string;
  onRefresh?: () => void;
  hasActiveFault?: boolean;
}

export function Topbar({
  title = "SYSTEM OVERVIEW",
  dataSource,
  onRefresh,
  hasActiveFault = false,
}: TopbarProps) {
  const pathname = usePathname();
  const isDemoRoute = pathname === "/demo";
  const {
    device,
    physicalEsp32,
    simulator,
    deviceMode,
    telemetrySource,
    mqtt,
    nodeRed,
    fastApi,
    postgres,
    websocket,
    globalBadge,
    refresh,
  } = useSystemHealth();
  const [showStatusPopover, setShowStatusPopover] = useState(false);

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    void refresh();
  };

  return (
    <header className="h-14 bg-white border-b border-[#E2E8F0] px-5 flex items-center justify-between sticky top-0 z-30 shrink-0 font-sans shadow-xs">
      {/* Brand & Page Identity */}
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-xs group-hover:bg-blue-700 transition-colors">
            G
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-[#172033] tracking-wider font-mono">GRIDGUARD</span>
            <span className="text-[10px] text-[#64748B] hidden sm:inline truncate">
              Smart Transformer Protection &amp; Assistive Load Device
            </span>
          </div>
        </Link>
        {title && (
          <div className="hidden xl:flex items-center gap-2 pl-3 border-l border-slate-200">
            <span className="text-xs font-bold text-[#172033] uppercase tracking-wide">
              {title}
            </span>
          </div>
        )}
      </div>

      {/* Center: Search Input / Quick Action */}
      <div className="hidden md:flex items-center flex-1 max-w-xs mx-4">
        <div className="relative w-full">
          <input
            type="text"
            placeholder="Search channels, faults, telemetry..."
            className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#172033] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB] transition-colors"
          />
          <svg
            className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Right Controls - One Consolidated Header Bar */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Consolidated LIVE SYSTEM Indicator with Status Popover */}
        <div className="relative">
          <button
            onClick={() => setShowStatusPopover(!showStatusPopover)}
            className="flex items-center gap-2 bg-[#F8FAFC] hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-[11px] text-[#172033] transition-colors cursor-pointer"
            title="Click for System Health & Broker Details"
          >
            <span className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  globalBadge.color === "green"
                    ? "bg-[#16A34A]"
                    : globalBadge.color === "amber"
                    ? "bg-[#D97706] animate-pulse"
                    : globalBadge.color === "red"
                    ? "bg-[#DC2626] animate-pulse"
                    : "bg-[#64748B]"
                }`}
              />
              <span className="font-bold">
                {globalBadge.text}
              </span>
            </span>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <span className="text-[10px] text-[#64748B] hidden sm:inline">
              {globalBadge.subtext}
            </span>
            <Info className="w-3 h-3 text-[#94A3B8] ml-0.5" />
          </button>

          {/* Detailed System Health Popover */}
          {showStatusPopover && (
            <div className="absolute right-0 mt-2 w-84 p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xl z-50 text-xs space-y-2.5 animate-in fade-in duration-150 font-mono">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <span className="font-bold text-[#172033] uppercase text-[11px] block">Live System Health</span>
                  <span className="text-[10px] text-[#64748B]">Zero-Fabricated Telemetry Policy</span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                    physicalEsp32.isLive
                      ? "bg-green-50 text-green-700 border-green-200"
                      : simulator.isLive
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : globalBadge.color === "amber"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                >
                  {physicalEsp32.isLive
                    ? "ESP32 LIVE"
                    : simulator.isLive
                    ? "SIMULATOR LIVE"
                    : "WAITING FOR DEVICE"}
                </span>
              </div>
              <div className="space-y-2 text-[11px] text-[#475569]">
                {/* 1. Device Mode */}
                <div className="flex justify-between items-center">
                  <span>DEVICE MODE:</span>
                  <span className="font-bold text-purple-700 uppercase">
                    {deviceMode}
                  </span>
                </div>

                {/* 2. Physical ESP32 */}
                <div className="flex justify-between items-center">
                  <span>Physical ESP32:</span>
                  <span
                    className={`font-bold ${
                      physicalEsp32.isOnline
                        ? "text-green-700"
                        : "text-slate-600"
                    }`}
                  >
                    {physicalEsp32.displayStatus}
                  </span>
                </div>

                {/* 3. Hardware Simulator */}
                <div className="flex justify-between items-center">
                  <span>Hardware Simulator:</span>
                  <span
                    className={`font-bold ${
                      simulator.isRunning
                        ? "text-blue-700"
                        : "text-slate-500"
                    }`}
                  >
                    {simulator.displayStatus}
                  </span>
                </div>

                {/* 4. Telemetry Source */}
                <div className="flex justify-between items-center">
                  <span>Telemetry:</span>
                  <span className="font-bold text-[#172033]">
                    {physicalEsp32.isLive
                      ? "LIVE — ESP32"
                      : simulator.isLive
                      ? "LIVE — SIMULATOR"
                      : "WAITING FOR DEVICE"}
                  </span>
                </div>

                {/* 5. MQTT Broker */}
                <div className="flex justify-between items-center">
                  <span>MQTT Broker:</span>
                  <span className="font-semibold text-[#172033]">
                    {mqtt.brokerHost} ({mqtt.brokerPort})
                  </span>
                </div>

                {/* 6. MQTT Connection State */}
                <div className="flex justify-between items-center">
                  <span>MQTT State:</span>
                  <span
                    className={`font-bold ${
                      mqtt.state === "CONNECTED" ? "text-green-700" : "text-red-600"
                    }`}
                  >
                    {mqtt.state}
                  </span>
                </div>

                {/* 7. Node-RED Service */}
                <div className="flex justify-between items-center">
                  <span>Node-RED Service:</span>
                  <span
                    className={`font-semibold ${
                      nodeRed.service?.status === "ONLINE" || nodeRed.state === "ONLINE" ? "text-green-700" : "text-slate-600"
                    }`}
                  >
                    {nodeRed.service?.status || nodeRed.state}
                  </span>
                </div>

                {/* 8. Node-RED MQTT Input */}
                <div className="flex justify-between items-center">
                  <span>Node-RED MQTT Input:</span>
                  <span
                    className={`font-semibold ${
                      nodeRed.mqtt?.status === "RECEIVING" || nodeRed.mqtt?.status === "CONNECTED"
                        ? "text-green-700"
                        : "text-slate-600"
                    }`}
                  >
                    {nodeRed.mqtt?.status === "RECEIVING" ? "LIVE" : (nodeRed.mqtt?.status || (nodeRed.state === "ONLINE" ? "CONNECTED" : "OFFLINE"))}
                  </span>
                </div>

                {/* 5. FastAPI */}
                <div className="flex justify-between items-center">
                  <span>FastAPI Backend:</span>
                  <span
                    className={`font-semibold ${
                      fastApi.state === "ONLINE" ? "text-green-700" : "text-red-600"
                    }`}
                  >
                    {fastApi.state}
                  </span>
                </div>

                {/* 6. PostgreSQL */}
                <div className="flex justify-between items-center">
                  <span>PostgreSQL Database:</span>
                  <span
                    className={`font-semibold ${
                      postgres.state === "CONNECTED" ? "text-green-700" : "text-red-600"
                    }`}
                  >
                    {postgres.state}
                  </span>
                </div>

                {/* 7. WebSocket */}
                <div className="flex justify-between items-center">
                  <span>WebSocket Feed:</span>
                  <span
                    className={`font-semibold ${
                      websocket.state === "ESTABLISHED" ? "text-green-700" : "text-slate-600"
                    }`}
                  >
                    {websocket.state}
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <Link
                  href="/system-health"
                  onClick={() => setShowStatusPopover(false)}
                  className="text-[10px] text-blue-600 font-bold hover:underline"
                >
                  View Full Diagnostics &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Biometric Face Auth Button */}
        <Link
          href="/maintenance"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border cursor-pointer ${
            hasActiveFault
              ? "bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
              : "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
          }`}
          title="Open Face Authentication Control"
        >
          {hasActiveFault ? (
            <>
              <AlertOctagon className="w-3.5 h-3.5 text-red-600" />
              <span>AUTHENTICATE RESET</span>
            </>
          ) : (
            <>
              <Camera className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">FACE AUTH</span>
            </>
          )}
        </Link>

        {/* Exhibition Demo Mode Toggle */}
        {isDemoRoute ? (
          <Link
            href="/"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 text-red-600" />
            <span className="hidden md:inline">EXIT DEMO</span>
          </Link>
        ) : (
          <Link
            href="/demo"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-bold transition-colors"
          >
            <PlayCircle className="w-3.5 h-3.5 text-orange-600" />
            <span className="hidden md:inline">EXHIBITION DEMO</span>
          </Link>
        )}

        {/* Telemetry Refresh */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Refresh Telemetry"
            className="p-1.5 rounded-lg bg-white hover:bg-slate-50 text-[#64748B] hover:text-[#172033] transition-colors border border-[#CBD5E1] cursor-pointer shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Notification Bell */}
        <Link
          href="/notifications"
          className="relative p-1.5 rounded-lg bg-white hover:bg-slate-50 text-[#64748B] hover:text-[#172033] transition-colors border border-[#CBD5E1] shadow-2xs"
          title="Notifications"
        >
          <Bell className="w-3.5 h-3.5" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-600" />
        </Link>

        {/* Authorized Operator Avatar */}
        <div className="flex items-center gap-1.5 pl-1.5 border-l border-[#E2E8F0] text-[11px] text-[#64748B]">
          <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-blue-200 flex items-center justify-center text-[#1D4ED8]">
            <User className="w-3.5 h-3.5" />
          </div>
          <span className="hidden lg:inline font-bold text-[#172033]">OPERATOR</span>
        </div>
      </div>
    </header>
  );
}
