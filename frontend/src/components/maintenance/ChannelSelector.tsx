"use client";

import React, { useMemo } from "react";
import { ChannelData } from "@/types/telemetry";
import { CheckSquare, Square, AlertOctagon, Wrench, ShieldCheck, PowerOff, Zap, AlertTriangle } from "lucide-react";

interface ChannelSelectorProps {
  channels: ChannelData[];
  selectedChannels: Set<number>;
  onSelectionChange: (updater: (prev: Set<number>) => Set<number>) => void;
  onTripClick?: () => void;
  onResetClick?: () => void;
  disabled?: boolean;
}

export function ChannelSelector({
  channels,
  selectedChannels,
  onSelectionChange,
  onTripClick,
  onResetClick,
  disabled = false,
}: ChannelSelectorProps) {
  // Normalize 4 channels 1..4 even if telemetry is still streaming
  const normalizedChannels = useMemo(() => {
    return [1, 2, 3, 4].map((chId) => {
      const found = channels.find((c) => c.channel === chId);
      if (found) return found;
      return {
        channel: chId,
        status: "NORMAL",
        voltage: null,
        current: null,
        apparent_power: null,
        main_relay: true,
        aux_relay: true,
        load_active: true,
      } as ChannelData;
    });
  }, [channels]);

  // Functional, immutable toggle: never replaces other channels!
  const toggleChannel = (channelId: number) => {
    if (disabled) return;
    onSelectionChange((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  };

  // Eligibility evaluation per channel
  const getEligibility = (ch: ChannelData) => {
    const isMaintenance = ch.status === "MAINTENANCE";
    const isFaulted = ch.status === "FAULT LATCHED" || ch.status === "TRIPPED" || ch.status === "CRITICAL";
    const isOffline = ch.status === "OFFLINE";
    const isNormal = ch.status === "NORMAL" || (!isMaintenance && !isFaulted && !isOffline);

    const eligibleForTrip = !isOffline && !isMaintenance;
    const eligibleForReset = isFaulted || isMaintenance;

    let tripIneligibilityReason = "";
    if (isOffline) tripIneligibilityReason = "Channel is OFFLINE";
    else if (isMaintenance) tripIneligibilityReason = "Already de-energized in MAINTENANCE";

    let resetIneligibilityReason = "";
    if (isNormal && !isFaulted) resetIneligibilityReason = "Channel already NORMAL (Relays closed)";
    else if (isOffline) resetIneligibilityReason = "Channel is OFFLINE";

    return {
      eligibleForTrip,
      eligibleForReset,
      tripIneligibilityReason,
      resetIneligibilityReason,
      isNormal,
      isFaulted,
      isMaintenance,
      isOffline,
    };
  };

  const selectedList = Array.from(selectedChannels).sort((a, b) => a - b);
  const selectedCount = selectedChannels.size;

  // Check how many selected channels are eligible for trip / reset
  const eligibleSelectedForTrip = selectedList.filter((id) => {
    const ch = normalizedChannels.find((c) => c.channel === id);
    return ch ? getEligibility(ch).eligibleForTrip : false;
  });

  const eligibleSelectedForReset = selectedList.filter((id) => {
    const ch = normalizedChannels.find((c) => c.channel === id);
    return ch ? getEligibility(ch).eligibleForReset : false;
  });

  // Select all eligible handlers
  const handleSelectAll = () => {
    if (disabled) return;
    onSelectionChange(() => new Set([1, 2, 3, 4]));
  };

  const handleClearSelection = () => {
    if (disabled) return;
    onSelectionChange(() => new Set());
  };

  return (
    <div className="scada-panel p-5 border border-[#E2E8F0] space-y-4 font-mono bg-white shadow-2xs rounded-xl">
      {/* Component Header & Selection Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider">
              MULTI-CHANNEL MAINTENANCE CONTROL (MAIN + AUX PAIR)
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">
              RELAY PAIR ISOLATION
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Select any combination of channels. Maintenance operations switch both Main and Auxiliary relays simultaneously.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={disabled}
            className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-700 font-bold text-xs transition-colors border border-blue-200 cursor-pointer shadow-2xs"
          >
            SELECT ALL (4)
          </button>
          <button
            type="button"
            onClick={handleClearSelection}
            disabled={disabled || selectedCount === 0}
            className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-600 hover:text-slate-900 font-semibold text-xs transition-colors border border-slate-300 cursor-pointer shadow-2xs"
          >
            CLEAR SELECTION
          </button>
        </div>
      </div>

      {/* 4 Multi-Channel Selection Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {normalizedChannels.map((channel) => {
          const isSelected = selectedChannels.has(channel.channel);
          const eligibility = getEligibility(channel);

          let statusBg = "bg-slate-100 text-slate-700 border-slate-200";
          const statusText = channel.status || "NORMAL";

          if (eligibility.isMaintenance) {
            statusBg = "bg-blue-50 text-blue-700 border-blue-200";
          } else if (eligibility.isFaulted) {
            statusBg = "bg-red-50 text-red-700 border-red-200";
          } else if (eligibility.isNormal) {
            statusBg = "bg-green-50 text-green-700 border-green-200";
          }

          return (
            <div
              key={channel.channel}
              role="checkbox"
              aria-checked={isSelected}
              tabIndex={disabled ? -1 : 0}
              onClick={() => toggleChannel(channel.channel)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  toggleChannel(channel.channel);
                }
              }}
              className={`p-3.5 rounded-xl border text-xs transition-all cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs ${
                isSelected
                  ? "bg-[#EFF6FF] border-2 border-[#2563EB]"
                  : "bg-white border-[#CBD5E1] hover:bg-[#F8FAFC]"
              } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {/* Card Top: Checkbox and Channel ID */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="text-blue-600">
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-[#2563EB]" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <span className="font-bold text-[#172033] tracking-wider text-sm">
                    CH 0{channel.channel}
                  </span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${statusBg}`}>
                  {statusText}
                </span>
              </div>

              {/* Sub-label: Main + Aux Pair Notice */}
              <div className="text-[11px] text-slate-500 mb-2 font-medium">
                Main Relay + Aux Relay Pair
              </div>

              {/* Commanded States & Disclaimer */}
              <div className="space-y-1 text-[10px] text-slate-600 bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0]">
                <div className="flex justify-between items-center">
                  <span>Main Commanded:</span>
                  <span className={`font-bold ${channel.main_relay ? "text-green-700" : "text-red-600"}`}>
                    {channel.main_relay ? "ON" : "OFF"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Aux Commanded:</span>
                  <span className={`font-bold ${channel.aux_relay ? "text-green-700" : "text-red-600"}`}>
                    {channel.aux_relay ? "ON" : "OFF"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-200">
                  <span>Physical Feedback:</span>
                  <span className="text-slate-500 font-bold">NOT AVAILABLE</span>
                </div>
              </div>

              {/* Eligibility Warning / Note */}
              <div className="mt-2 text-[10px] min-h-[16px]">
                {!eligibility.eligibleForTrip && (
                  <span className="text-amber-700 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                    <span>{eligibility.tripIneligibilityReason}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Footer Bar */}
      <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600">
            Selected:{" "}
            <strong className="text-[#172033]">
              {selectedCount === 0
                ? "0 channels"
                : selectedCount === 1
                ? `1 channel (CH${selectedList[0]})`
                : `${selectedCount} channels (${selectedList.map((c) => `CH${c}`).join(", ")})`}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Trip Selected Button */}
          {onTripClick && (
            <button
              type="button"
              onClick={onTripClick}
              disabled={disabled || eligibleSelectedForTrip.length === 0}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs"
              title={
                eligibleSelectedForTrip.length === 0
                  ? "Select at least one eligible channel to trip"
                  : `De-energize ${eligibleSelectedForTrip.length} channel(s) for maintenance`
              }
            >
              <PowerOff className="w-3.5 h-3.5" />
              <span>TRIP SELECTED ({eligibleSelectedForTrip.length})</span>
            </button>
          )}

          {/* Reset Selected Button */}
          {onResetClick && (
            <button
              type="button"
              onClick={onResetClick}
              disabled={disabled || eligibleSelectedForReset.length === 0}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs"
              title={
                eligibleSelectedForReset.length === 0
                  ? "Select at least one faulted or maintenance channel to reset"
                  : `Restore ${eligibleSelectedForReset.length} channel(s)`
              }
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>RESET SELECTED ({eligibleSelectedForReset.length})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
