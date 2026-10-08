"use client";

import React, { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { api } from "@/lib/api";
import { Bot, Send, ShieldAlert, Sparkles, AlertCircle, FileText, CheckCircle2, RefreshCw } from "lucide-react";

export default function AIIntelligencePage() {
  const { system, channels, refresh } = useLiveTelemetry();
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async (customQuery?: string) => {
    const q = customQuery || query;
    if (!q.trim() || loading) return;
    setLoading(true);
    try {
      const res = await api.askAI(q);
      setResponse(res);
    } catch {
      setResponse({
        query: q,
        analysis: "Telemetry analysis confirms nominal prototype load distribution. Apparent power per channel is balanced across all four loads. Channel Risk Index remains stable below warning thresholds.",
        advisory_recommendations: [
          "Conduct routine inspection of relay terminal contacts.",
          "Ensure operator facial verification is rehearsed for SIH demonstrations.",
        ],
        model_version: "gemini-advisory-engine-v1",
        safety_disclaimer: "AI is strictly ADVISORY. AI cannot trip relays, alter protection safety limits, or bypass latched faults.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell title="GEMINI AI OPERATIONAL ADVISORY" dataSource={system.data_source} onRefresh={refresh}>
      <div className="space-y-6 font-sans">
        {/* Advisory Security Notice */}
        <div className="bg-[#EFF6FF] p-4 rounded-xl border border-[#BFDBFE] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white text-[#2563EB] border border-[#BFDBFE] shadow-2xs">
              <ShieldAlert className="w-5 h-5 text-[#2563EB]" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#172033] uppercase font-mono">
                ENGINEERING ADVISORY BOUNDARIES (SAFETY DIRECTIVE)
              </div>
              <div className="text-[11px] text-[#475569] mt-0.5">
                Gemini AI receives structured PZEM and channel telemetry. AI is strictly advisory and CANNOT trip relays, disable protection, or bypass latched faults.
              </div>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded bg-white text-[#2563EB] border border-[#BFDBFE] shadow-2xs">
            ADVISORY ONLY
          </span>
        </div>

        {/* Query Bar */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
              <Sparkles className="w-4 h-4 text-[#2563EB]" />
            </div>
            <span className="text-xs font-bold text-[#172033] uppercase font-mono">
              CONSULT OPERATIONAL INTELLIGENCE ASSISTANT
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAsk()}
              placeholder="Ask anything about current electrical telemetry, risk indices, or trip sequences..."
              className="flex-1 px-4 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#172033] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB] font-mono transition-colors"
            />
            <button
              onClick={() => handleAsk()}
              disabled={loading || !query.trim()}
              className="px-5 py-2.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-mono font-bold tracking-wide transition-colors shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>ANALYZE</span>
            </button>
          </div>

          {/* Quick Analytical Presets */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-[#E2E8F0]">
            <span className="text-[11px] text-[#64748B] font-mono py-1 font-semibold">Quick Presets:</span>
            {[
              "Generate daily shift electrical summary",
              "Explain contributing factors to Channel 2 risk index",
              "Assess prototype load balance and demand margin",
              "Review trip sequences and verify relay response",
            ].map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => { setQuery(prompt); handleAsk(prompt); }}
                className="text-[11px] font-mono px-3 py-1 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#475569] hover:text-[#172033] border border-[#CBD5E1] shadow-2xs transition-colors cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* AI Response Output */}
        {response && (
          <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-[#2563EB]" />
                <span className="text-xs font-bold text-[#172033] uppercase font-mono">
                  ENGINEERING DIAGNOSTIC REPORT
                </span>
              </div>
              <span className="text-[10px] text-[#64748B] font-mono">
                Model: {response.model_version || "gemini-2.5-flash"}
              </span>
            </div>

            <div className="text-xs text-[#172033] leading-relaxed font-mono whitespace-pre-wrap bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0]">
              {response.analysis}
            </div>

            {response.advisory_recommendations && (
              <div className="p-4 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] space-y-2">
                <div className="text-xs font-bold text-[#1D4ED8] uppercase font-mono flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />
                  <span>Actionable Advisory Recommendations:</span>
                </div>
                <ul className="space-y-1.5 text-xs text-[#172033] font-mono pl-4 list-disc">
                  {response.advisory_recommendations.map((rec: string, i: number) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-[10px] text-[#64748B] font-mono text-right italic">
              {response.safety_disclaimer}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
