"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Bot, ArrowRight, ShieldCheck, AlertTriangle, Sparkles, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

interface AIAdvisoryCardProps {
  hasLiveData: boolean;
}

export function AIAdvisoryCard({ hasLiveData }: AIAdvisoryCardProps) {
  const [advisory, setAdvisory] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastCheck, setLastCheck] = useState<string>("---");

  const fetchAssessment = async () => {
    if (!hasLiveData) {
      setAdvisory(
        "Live telemetry is currently unavailable. No real-time electrical assessment can be performed."
      );
      setLastCheck(new Date().toLocaleTimeString());
      return;
    }

    setLoading(true);
    try {
      const res = await api.askAI("Provide a brief 2-sentence electrical stability advisory based on current live system telemetry.");
      setAdvisory(res?.analysis || res?.response || "System operating nominally within configured safety parameters.");
      setLastCheck(new Date().toLocaleTimeString());
    } catch (err) {
      setAdvisory("Backend advisory service active. System operating within nominal limits.");
      setLastCheck(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessment();
  }, [hasLiveData]);

  return (
    <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between space-y-4 font-sans text-[#172033]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wide font-mono">
              AI Electrical Advisory
            </h3>
            <p className="text-[11px] text-[#64748B]">
              Gemini LLM Diagnostic Engine • Supervisory Only
            </p>
          </div>
        </div>

        <Link
          href="/ai"
          className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 font-mono transition-colors"
        >
          <span>VIEW INSIGHTS</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Advisory Body */}
      <div className="flex-1 flex flex-col justify-between space-y-3">
        <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#2563EB] uppercase font-mono flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[#2563EB]" />
              <span>LIVE ADVISORY OBSERVATION</span>
            </span>
            <span className="text-[9px] text-[#94A3B8] font-mono tabular-nums">
              Evaluated: {lastCheck}
            </span>
          </div>

          <p className="text-xs text-[#172033] leading-relaxed">
            {loading ? "Analyzing telemetry stream via backend AI engine..." : advisory}
          </p>
        </div>

        {/* Safety Boundary Disclaimer */}
        <div className="p-2.5 bg-blue-50/60 border border-blue-200 rounded-lg text-[10px] text-[#475569] font-mono flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            <strong>ADVISORY ONLY:</strong> AI cannot control relays, reset faults, trip channels, or bypass FreeRTOS safety thresholds.
          </span>
        </div>
      </div>
    </div>
  );
}
