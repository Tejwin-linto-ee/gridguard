"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ChannelData } from "@/types/telemetry";
import { api } from "@/lib/api";
import {
  CheckSquare,
  Square,
  PowerOff,
  UserCheck,
  X,
  ArrowRight,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface ChannelStatusGridProps {
  channels: ChannelData[];
  hasLiveData: boolean;
  esp32Status?: "ONLINE" | "OFFLINE";
  selectedChannels: Set<number>;
  onToggleSelect: (channelId: number) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onRequestTrip?: (channelId?: number) => void;
  onRequestReset?: (channelId?: number) => void;
  riskScores?: Record<number, number>;
}

type CommandState =
  | "IDLE"
  | "REQUESTED"
  | "SENT"
  | "CONFIRMED"
  | "FAILED"
  | "OFFLINE";

interface ChannelCommandStatus {
  state: CommandState;
  message: string;
  correlationId?: string;
}

export function ChannelStatusGrid({
  channels,
  hasLiveData,
  esp32Status = "OFFLINE",
  selectedChannels,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onRequestTrip,
  onRequestReset,
  riskScores = {},
}: ChannelStatusGridProps) {
  const selectedCount = selectedChannels.size;
  const selectedList = Array.from(selectedChannels).sort((a, b) => a - b);

  // Per-channel command tracking
  const [channelCommands, setChannelCommands] = useState<Record<number, ChannelCommandStatus>>({});
  const timeoutRefs = useRef<Record<number, NodeJS.Timeout>>({});

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(timeoutRefs.current).forEach((t) => clearTimeout(t));
    };
  }, []);

  // Listen for WebSocket command status updates
  useEffect(() => {
    const handleCommandEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail;
      if (!detail) return;

      const ch = detail.channel;
      const correlationId = detail.correlation_id;
      const status = detail.status;

      if (ch && channelCommands[ch]) {
        if (
          status === "TRIP_CONFIRMED" ||
          status === "RESET_CONFIRMED" ||
          status === "EXECUTED" ||
          status === "CONFIRMED"
        ) {
          if (timeoutRefs.current[ch]) clearTimeout(timeoutRefs.current[ch]);
          setChannelCommands((prev) => ({
            ...prev,
            [ch]: {
              state: "CONFIRMED",
              message: status === "RESET_CONFIRMED" ? "RESET CONFIRMED" : "TRIP CONFIRMED",
              correlationId,
            },
          }));
          setTimeout(() => {
            setChannelCommands((prev) => {
              const updated = { ...prev };
              delete updated[ch];
              return updated;
            });
          }, 4000);
        } else if (
          status === "TRIP_REJECTED" ||
          status === "RESET_REJECTED" ||
          status === "SAFETY_PRECHECK_FAILED" ||
          status === "FAILED"
        ) {
          if (timeoutRefs.current[ch]) clearTimeout(timeoutRefs.current[ch]);
          setChannelCommands((prev) => ({
            ...prev,
            [ch]: {
              state: "FAILED",
              message: detail.message || detail.reason || "TRIP REJECTED",
              correlationId,
            },
          }));
          setTimeout(() => {
            setChannelCommands((prev) => {
              const updated = { ...prev };
              delete updated[ch];
              return updated;
            });
          }, 5000);
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("gridguard_command_event", handleCommandEvent);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("gridguard_command_event", handleCommandEvent);
      }
    };
  }, [channelCommands]);

  // Execute Individual Channel Trip
  const handleSingleTrip = async (channelId: number) => {
    // Check ESP32 online state
    if (esp32Status === "OFFLINE" || !hasLiveData) {
      setChannelCommands((prev) => ({
        ...prev,
        [channelId]: {
          state: "OFFLINE",
          message: "ESP32 OFFLINE — Trip command could not be delivered.",
        },
      }));
      setTimeout(() => {
        setChannelCommands((prev) => {
          const updated = { ...prev };
          delete updated[channelId];
          return updated;
        });
      }, 4000);
      return;
    }

    const correlationId = `CH${channelId}-TRIP-${Date.now().toString().slice(-6)}`;

    // Set REQUESTED state
    setChannelCommands((prev) => ({
      ...prev,
      [channelId]: {
        state: "REQUESTED",
        message: "TRIP REQUESTED...",
        correlationId,
      },
    }));

    try {
      const response = await api.tripChannel(channelId, {
        command: "TRIP_CHANNEL",
        channel: channelId,
        authorized_by: "WEBSITE_OPERATOR",
        authorization_id: `TRIP-${channelId}`,
        correlation_id: correlationId,
      });

      if (response && (response.status === "SENT" || response.status === "ACCEPTED")) {
        setChannelCommands((prev) => ({
          ...prev,
          [channelId]: {
            state: "SENT",
            message: "COMMAND SENT — AWAITING ESP32 CONFIRMATION",
            correlationId,
          },
        }));

        // Set 8-second confirmation timeout
        if (timeoutRefs.current[channelId]) clearTimeout(timeoutRefs.current[channelId]);
        timeoutRefs.current[channelId] = setTimeout(async () => {
          try {
            // Check status once more
            const stat = await api.getCommandStatus(correlationId);
            if (stat && stat.status === "CONFIRMED") {
              setChannelCommands((prev) => ({
                ...prev,
                [channelId]: {
                  state: "CONFIRMED",
                  message: "TRIP CONFIRMED",
                  correlationId,
                },
              }));
              setTimeout(() => {
                setChannelCommands((prev) => {
                  const updated = { ...prev };
                  delete updated[channelId];
                  return updated;
                });
              }, 4000);
              return;
            }
          } catch {
            // Ignore
          }

          setChannelCommands((prev) => ({
            ...prev,
            [channelId]: {
              state: "FAILED",
              message: "TRIP FAILED — NO ESP32 CONFIRMATION",
              correlationId,
            },
          }));
          setTimeout(() => {
            setChannelCommands((prev) => {
              const updated = { ...prev };
              delete updated[channelId];
              return updated;
            });
          }, 5000);
        }, 8000);
      } else {
        setChannelCommands((prev) => ({
          ...prev,
          [channelId]: {
            state: "FAILED",
            message: response?.message || "TRIP FAILED — DISPATCH ERROR",
            correlationId,
          },
        }));
      }
    } catch (err: any) {
      setChannelCommands((prev) => ({
        ...prev,
        [channelId]: {
          state: "FAILED",
          message: err.message || "Failed to dispatch trip command.",
          correlationId,
        },
      }));
      setTimeout(() => {
        setChannelCommands((prev) => {
          const updated = { ...prev };
          delete updated[channelId];
          return updated;
        });
      }, 5000);
    }
  };

  return (
    <div className="space-y-3 font-sans">
      {/* Header and Batch Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 font-mono">
        <div>
          <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-2">
            <span>PROTOTYPE LOAD CHANNELS (CH1 – CH4)</span>
          </h3>
          <p className="text-[11px] text-[#64748B]">
            Four independent prototype load circuits (Prototype load channels) • Dual Relays (Main + Aux Pair)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onSelectAll && (
            <button
              onClick={onSelectAll}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-bold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
            >
              SELECT ALL
            </button>
          )}
          {selectedCount > 0 && onClearSelection && (
            <button
              onClick={onClearSelection}
              className="text-[11px] text-[#64748B] hover:text-[#172033] font-bold px-2 py-1 rounded hover:bg-slate-100 transition-colors"
            >
              CLEAR
            </button>
          )}
          <Link
            href="/maintenance"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-bold pl-2 border-l border-slate-200"
          >
            <span>Operations Center</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Floating Batch Action Bar */}
      {selectedCount > 0 && (
        <div className="p-3 rounded-xl bg-[#EFF6FF] border border-[#2563EB] flex flex-wrap items-center justify-between gap-3 font-mono text-xs shadow-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-[#172033]">
            <CheckSquare className="w-4 h-4 text-blue-600" />
            <span>
              SELECTED: <strong>{selectedList.map((c) => `CH${c}`).join(", ")}</strong> ({selectedCount} channel{selectedCount > 1 ? "s" : ""})
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onRequestTrip && (
              <button
                onClick={() => onRequestTrip()}
                className="px-3 py-1.5 rounded-lg bg-[#DC2626] hover:bg-red-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <PowerOff className="w-3.5 h-3.5 text-white" />
                <span>TRIP SELECTED</span>
              </button>
            )}

            {onRequestReset && (
              <button
                onClick={() => onRequestReset()}
                className="px-3 py-1.5 rounded-lg bg-[#16A34A] hover:bg-green-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <UserCheck className="w-3.5 h-3.5 text-white" />
                <span>RESET SELECTED</span>
              </button>
            )}

            {onClearSelection && (
              <button
                onClick={onClearSelection}
                className="p-1.5 rounded-md text-[#64748B] hover:text-[#172033] hover:bg-blue-100 transition-colors"
                title="Clear Selection"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4 Prototype Load Channel Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {channels.map((ch) => {
          const isSelected = selectedChannels.has(ch.channel);
          const cmdStatus = channelCommands[ch.channel];

          // Determine authoritative Active Power (W)
          const activePowerVal = ch.active_power;
          const hasActivePower = hasLiveData && activePowerVal != null && !isNaN(activePowerVal);

          // Calculate apparent power strictly in VA: S = V * I (or ch.apparent_power)
          const apparentPowerVal =
            ch.apparent_power != null
              ? ch.apparent_power
              : ch.voltage != null && ch.current != null
              ? ch.voltage * ch.current
              : null;
          const hasApparentPower = hasLiveData && apparentPowerVal != null && !isNaN(apparentPowerVal);

          // Determine Protection Status strictly per requirements:
          // NORMAL: Active Power <= 7 W
          // HIGH LOAD: Active Power > 7 W and <= 12 W
          // TRIPPED: Active Power > 12 W or fault latched
          // SENSOR INVALID
          // OFFLINE
          let protectionStatus: "NORMAL" | "HIGH LOAD" | "TRIPPED" | "SENSOR INVALID" | "OFFLINE";
          let faultDescription: string | null = null;
          let latchActive = false;

          if (!hasLiveData || esp32Status === "OFFLINE") {
            protectionStatus = "OFFLINE";
          } else if (ch.status === "FAULT LATCHED" || ch.status === "TRIPPED" || ch.fault_latched) {
            protectionStatus = "TRIPPED";
            faultDescription = ch.fault || (activePowerVal && activePowerVal > 12 ? "OVERLOAD > 12 W" : "FAULT LATCHED");
            latchActive = true;
          } else if (hasActivePower) {
            if (activePowerVal > 12.0) {
              protectionStatus = "TRIPPED";
              faultDescription = "OVERLOAD > 12 W";
              latchActive = true;
            } else if (activePowerVal > 7.0) {
              protectionStatus = "HIGH LOAD";
            } else {
              protectionStatus = "NORMAL";
            }
          } else if (ch.status === "SENSOR INVALID") {
            protectionStatus = "SENSOR INVALID";
          } else {
            protectionStatus = "NORMAL";
          }

          const isTripped = protectionStatus === "TRIPPED";
          const isHighLoad = protectionStatus === "HIGH LOAD";
          const isNormal = protectionStatus === "NORMAL";

          // Relays Command State:
          // <= 7 W: Main ON, Aux OFF
          // 7-12 W: Main ON, Aux ON
          // > 12 W: Main OFF, Aux OFF
          const mainOn = ch.main_relay ?? (isTripped ? false : true);
          const auxOn = ch.aux_relay ?? (isHighLoad ? true : false);

          return (
            <div
              key={ch.channel}
              className={`bg-white p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 shadow-xs ${
                isSelected
                  ? "border-[#2563EB] ring-2 ring-[#2563EB]/20 bg-[#EFF6FF]/10"
                  : isTripped
                  ? "border-red-300 bg-red-50/10"
                  : "border-[#E2E8F0] hover:border-[#CBD5E1]"
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onToggleSelect(ch.channel)}
                    className="cursor-pointer text-[#2563EB] hover:scale-110 transition-transform"
                    aria-label={`Select CH${ch.channel}`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 fill-blue-50" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  <div>
                    <span className="font-bold text-sm text-[#172033] font-mono block">
                      CH{ch.channel}
                    </span>
                    <span className="text-[10px] text-[#64748B] block font-mono">
                      Prototype Load Channel
                    </span>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="text-right">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                      isTripped
                        ? "bg-red-50 text-red-700 border-red-300"
                        : isHighLoad
                        ? "bg-amber-50 text-amber-800 border-amber-300"
                        : isNormal
                        ? "bg-green-50 text-green-700 border-green-300"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isTripped
                          ? "bg-red-600 animate-pulse"
                          : isHighLoad
                          ? "bg-amber-500 animate-pulse"
                          : isNormal
                          ? "bg-green-600"
                          : "bg-slate-400"
                      }`}
                    />
                    <span>{protectionStatus}</span>
                  </span>
                </div>
              </div>

              {/* Telemetry Metrics Grid */}
              <div className="space-y-1.5 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2 bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0]">
                  <div>
                    <span className="text-[9px] text-[#64748B] block uppercase">Voltage</span>
                    <span className="text-xs font-bold text-[#172033] tabular-nums">
                      {hasLiveData && ch.voltage != null ? `${ch.voltage.toFixed(1)} V` : "---"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[9px] text-[#64748B] block uppercase">Current</span>
                    <span className="text-xs font-bold text-[#172033] tabular-nums">
                      {hasLiveData && ch.current != null ? `${ch.current.toFixed(3)} A` : "---"}
                    </span>
                  </div>

                  <div className="pt-1 border-t border-slate-200/60">
                    <span className="text-[9px] text-[#64748B] block uppercase font-bold text-blue-700">
                      Active Power
                    </span>
                    <span className="text-xs font-bold text-[#172033] tabular-nums">
                      {hasActivePower ? `${activePowerVal!.toFixed(1)} W` : "---"}
                    </span>
                  </div>

                  <div className="pt-1 border-t border-slate-200/60">
                    <span className="text-[9px] text-[#64748B] block uppercase">Apparent</span>
                    <span className="text-xs font-bold text-[#172033] tabular-nums">
                      {hasApparentPower ? `${apparentPowerVal!.toFixed(1)} VA` : "---"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Relay Command States & Feedback Disclaimer */}
              <div className="space-y-1 text-[11px] font-mono bg-slate-50 p-2.5 rounded-lg border border-[#E2E8F0]">
                <div className="flex justify-between items-center">
                  <span className="text-[#64748B]">Main Relay:</span>
                  <span className="text-[#172033] font-bold">
                    COMMAND:{" "}
                    <span className={mainOn ? "text-green-700" : "text-red-700"}>
                      {mainOn ? "ON" : "OFF"}
                    </span>
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[#64748B]">Aux Relay:</span>
                  <span className="text-[#172033] font-bold">
                    COMMAND:{" "}
                    <span className={auxOn ? "text-green-700" : "text-slate-500"}>
                      {auxOn ? "ON" : "OFF"}
                    </span>
                  </span>
                </div>

                <div className="flex justify-between items-center text-[9px] text-[#94A3B8] pt-0.5 border-t border-slate-200">
                  <span>Feedback:</span>
                  <span className="font-semibold text-slate-500">NOT AVAILABLE</span>
                </div>

                <div className="flex justify-between items-center text-[9px] text-[#94A3B8] pt-0.5 border-t border-slate-200">
                  <span>Sensor Health:</span>
                  <span className={`font-semibold ${ch.sensor_health === "SENSOR_INVALID" ? "text-red-600 font-bold" : "text-emerald-700 font-bold"}`}>
                    {ch.sensor_health || "VALID"}
                  </span>
                </div>
              </div>

              {/* Fault & Latch Status Box (When Tripped) */}
              {isTripped && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between text-red-900 font-bold">
                    <span>Fault:</span>
                    <span>{faultDescription || "OVERLOAD > 12 W"}</span>
                  </div>
                  <div className="flex items-center justify-between text-red-700 text-[11px]">
                    <span>Latch:</span>
                    <span className="font-bold uppercase">ACTIVE</span>
                  </div>
                </div>
              )}

              {/* Command Flow Message Banner */}
              {cmdStatus && (
                <div
                  className={`p-2 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1.5 border animate-in fade-in duration-150 ${
                    cmdStatus.state === "CONFIRMED"
                      ? "bg-green-50 text-green-800 border-green-300"
                      : cmdStatus.state === "FAILED" || cmdStatus.state === "OFFLINE"
                      ? "bg-red-50 text-red-800 border-red-300"
                      : "bg-blue-50 text-blue-800 border-blue-300"
                  }`}
                >
                  {cmdStatus.state === "REQUESTED" || cmdStatus.state === "SENT" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-blue-600" />
                  ) : cmdStatus.state === "CONFIRMED" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-green-600" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                  )}
                  <span className="leading-tight">{cmdStatus.message}</span>
                </div>
              )}

              {/* Operational Action Controls: [TRIP] or [RESET] */}
              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between gap-2 font-mono">
                {isTripped ? (
                  <button
                    onClick={() => {
                      if (onRequestReset) {
                        onRequestReset(ch.channel);
                      }
                    }}
                    className="w-full py-1.5 px-3 rounded-lg bg-[#16A34A] hover:bg-green-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-white" />
                    <span>RESET</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (onRequestTrip) {
                        onRequestTrip(ch.channel);
                      } else {
                        handleSingleTrip(ch.channel);
                      }
                    }}
                    disabled={cmdStatus?.state === "REQUESTED" || cmdStatus?.state === "SENT"}
                    className="w-full py-1.5 px-3 rounded-lg bg-[#DC2626] hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <PowerOff className="w-3.5 h-3.5 text-white" />
                    <span>TRIP</span>
                  </button>
                )}

                <Link
                  href={`/channels/${ch.channel}`}
                  className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-[#172033] hover:bg-slate-50 text-xs font-bold shrink-0 transition-colors flex items-center gap-0.5"
                  title="View Channel Details"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
