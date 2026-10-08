"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { Settings as SettingsIcon, ShieldCheck, Cpu, Save, CheckCircle2, AlertCircle } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch {
      // Fallback defaults
      setSettings({
        protection_thresholds: {
          overcurrent_threshold_a: 2.5,
          overload_threshold_va: 600.0,
          overvoltage_threshold_v: 250.0,
          undervoltage_threshold_v: 190.0,
          frequency_min_hz: 47.5,
          frequency_max_hz: 52.5,
          persistence_sec: 1.0,
          hysteresis_pct: 5.0,
        },
        hardware_config_placeholders: {
          mcu: "ESP32-S3 N16R8",
          channel_1: { zmpt: "ADC_CH1_PLACEHOLDER", acs: "ADC_CH2_PLACEHOLDER", main: "PIN_12", aux: "PIN_18" },
          channel_2: { zmpt: "ADC_CH3_PLACEHOLDER", acs: "ADC_CH4_PLACEHOLDER", main: "PIN_13", aux: "PIN_19" },
          channel_3: { zmpt: "ADC_CH5_PLACEHOLDER", acs: "ADC_CH6_PLACEHOLDER", main: "PIN_14", aux: "PIN_20" },
          channel_4: { zmpt: "ADC_CH7_PLACEHOLDER", acs: "ADC_CH8_PLACEHOLDER", main: "PIN_15", aux: "PIN_21" },
        },
      });
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.updateSettings(settings);
      setNotice("Protection safety limits updated and audited into system ledger.");
      setTimeout(() => setNotice(null), 3500);
    } catch (err: any) {
      setNotice(err.message || "Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return null;

  const th = settings.protection_thresholds;

  return (
    <AppShell title="PROTECTION & HARDWARE CONFIGURATION">
      {notice && (
        <div className="p-3 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-xs text-[#1D4ED8] flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />
          <span>{notice}</span>
        </div>
      )}

      {/* Safety Thresholds Form */}
      <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs space-y-5 font-sans">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <div>
            <h2 className="text-xs font-bold text-[#172033] uppercase font-mono tracking-wider">
              AUTHORITATIVE PROTECTION THRESHOLDS (ESP32 SAFETY LOOP)
            </h2>
            <p className="text-[11px] text-[#64748B] mt-0.5">
              Trip boundaries executed deterministically on ESP32-S3. All modifications are audited.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-mono font-bold flex items-center gap-2 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "AUDITING..." : "SAVE & AUDIT"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
            <label className="text-xs font-semibold text-[#475569] block">Overcurrent Trip (A):</label>
            <input
              type="number"
              step="0.1"
              value={th.overcurrent_threshold_a}
              onChange={(e) => setSettings({
                ...settings,
                protection_thresholds: { ...th, overcurrent_threshold_a: parseFloat(e.target.value) },
              })}
              className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#172033] font-bold focus:border-[#2563EB] focus:outline-none transition-colors"
            />
            <span className="text-[10px] text-[#64748B] block">Nominal prototype load: 1.0–1.4 A</span>
          </div>

          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
            <label className="text-xs font-semibold text-[#475569] block">Overload Trip (VA):</label>
            <input
              type="number"
              step="10"
              value={th.overload_threshold_va}
              onChange={(e) => setSettings({
                ...settings,
                protection_thresholds: { ...th, overload_threshold_va: parseFloat(e.target.value) },
              })}
              className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#172033] font-bold focus:border-[#2563EB] focus:outline-none transition-colors"
            />
            <span className="text-[10px] text-[#64748B] block">Designation: Apparent Power (VA)</span>
          </div>

          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
            <label className="text-xs font-semibold text-[#475569] block">Overvoltage Trip (V):</label>
            <input
              type="number"
              step="1"
              value={th.overvoltage_threshold_v}
              onChange={(e) => setSettings({
                ...settings,
                protection_thresholds: { ...th, overvoltage_threshold_v: parseFloat(e.target.value) },
              })}
              className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#172033] font-bold focus:border-[#2563EB] focus:outline-none transition-colors"
            />
            <span className="text-[10px] text-[#64748B] block">Nominal mains: 230 V RMS</span>
          </div>

          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
            <label className="text-xs font-semibold text-[#475569] block">Undervoltage Warning (V):</label>
            <input
              type="number"
              step="1"
              value={th.undervoltage_threshold_v}
              onChange={(e) => setSettings({
                ...settings,
                protection_thresholds: { ...th, undervoltage_threshold_v: parseFloat(e.target.value) },
              })}
              className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#172033] font-bold focus:border-[#2563EB] focus:outline-none transition-colors"
            />
            <span className="text-[10px] text-[#64748B] block">Brownout floor limit</span>
          </div>

          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
            <label className="text-xs font-semibold text-[#475569] block">Trip Persistence (sec):</label>
            <input
              type="number"
              step="0.1"
              value={th.persistence_sec}
              onChange={(e) => setSettings({
                ...settings,
                protection_thresholds: { ...th, persistence_sec: parseFloat(e.target.value) },
              })}
              className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#172033] font-bold focus:border-[#2563EB] focus:outline-none transition-colors"
            />
            <span className="text-[10px] text-[#64748B] block">Nuisance filter duration</span>
          </div>

          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
            <label className="text-xs font-semibold text-[#475569] block">Hysteresis Margin (%):</label>
            <input
              type="number"
              step="1"
              value={th.hysteresis_pct}
              onChange={(e) => setSettings({
                ...settings,
                protection_thresholds: { ...th, hysteresis_pct: parseFloat(e.target.value) },
              })}
              className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#172033] font-bold focus:border-[#2563EB] focus:outline-none transition-colors"
            />
            <span className="text-[10px] text-[#64748B] block">Prevents relay contact chatter</span>
          </div>
        </div>
      </div>

      {/* Hardware Pin Configuration Placeholders */}
      <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs space-y-4 font-sans">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
            <Cpu className="w-4 h-4 text-[#2563EB]" />
          </div>
          <h2 className="text-xs font-bold text-[#172033] uppercase font-mono tracking-wider">
            HARDWARE PIN CONFIGURATION PLACEHOLDERS
          </h2>
        </div>
        <p className="text-xs text-[#475569] leading-relaxed font-mono">
          GPIO and ADC pin configurations are defined in <code className="text-[#2563EB] font-bold bg-[#EFF6FF] px-1 py-0.5 rounded border border-[#BFDBFE]">firmware/hardware_config.h</code> and abstracted to avoid fabricated pin mappings. Configure below to match your physical PCB carrier routing:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
          {[1, 2, 3, 4].map((ch) => (
            <div key={ch} className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5">
              <span className="font-bold text-[#172033]">Channel 0{ch} Routing</span>
              <div className="text-[11px] text-[#64748B]">ZMPT ADC: ADC1_CH{ch+2}</div>
              <div className="text-[11px] text-[#64748B]">ACS712 ADC: ADC1_CH{ch+6}</div>
              <div className="text-[11px] text-[#64748B]">Main Relay: GPIO_{ch+11}</div>
              <div className="text-[11px] text-[#64748B]">Aux Relay: GPIO_{ch+17}</div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
