"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, ShieldCheck, ArrowRight, AlertOctagon } from "lucide-react";
import { ChannelData } from "@/types/telemetry";

interface ActiveAlertsCardProps {
  channels: ChannelData[];
  onAuthorizeReset?: (channelId: number) => void;
}

export function ActiveAlertsCard({
  channels,
  onAuthorizeReset,
}: ActiveAlertsCardProps) {
  // Find all active tripped or latched channels
  const activeFaults = channels.filter(
    (c) => c.status === "FAULT LATCHED" || c.status === "TRIPPED"
  );

  return (
    <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between space-y-4 font-sans text-[#172033]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-1.5 rounded-lg border ${
              activeFaults.length > 0
                ? "bg-red-50 text-red-600 border-red-200"
                : "bg-green-50 text-green-600 border-green-200"
            }`}
          >
            {activeFaults.length > 0 ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wide font-mono">
              Active Protection Alerts
            </h3>
            <p className="text-[11px] text-[#64748B]">
              Real-Time Hardware Fault Interlocks • Biometric Reset Required
            </p>
          </div>
        </div>

        <Link
          href="/faults"
          className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 font-mono transition-colors"
        >
          <span>FAULT CENTER</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Body: Real Alerts or Clear State */}
      <div className="flex-1 flex flex-col justify-center">
        {activeFaults.length > 0 ? (
          <div className="space-y-2.5 font-mono">
            {activeFaults.map((ch) => (
              <div
                key={ch.channel}
                className="p-3 bg-red-50/70 border border-red-200 rounded-xl space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
                    <span className="font-bold text-red-950 uppercase">
                      CH0{ch.channel} — {ch.fault || "Overcurrent Fault"}
                    </span>
                  </div>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                    HIGH SEVERITY
                  </span>
                </div>
                <p className="text-[11px] text-red-800 font-sans">
                  Dual relay pair locked open by local FreeRTOS hardware protection task.
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-red-200 text-[10px] text-red-700">
                  <span>Current: {ch.current != null ? `${ch.current.toFixed(2)} A` : "---"}</span>
                  {onAuthorizeReset && (
                    <button
                      onClick={() => onAuthorizeReset(ch.channel)}
                      className="text-xs font-bold underline hover:text-red-900 cursor-pointer"
                    >
                      Authorize Reset &rarr;
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-green-50 border border-green-200 text-[#16A34A] flex items-center justify-center mx-auto">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-[#172033] font-mono tracking-wider uppercase">
              NO ACTIVE ALERTS
            </h4>
            <p className="text-[11px] text-[#64748B] max-w-xs mx-auto">
              All 4 prototype load channels operating within nominal current and voltage thresholds.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
