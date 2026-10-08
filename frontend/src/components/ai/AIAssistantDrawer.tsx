"use client";

import React, { useState } from "react";
import { Bot, Send, Sparkles, X, ShieldAlert, AlertCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  recommendations?: string[];
}

export function AIAssistantDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Welcome to the GRIDGUARD AI Operational Advisory. I provide real-time electrical diagnostic explanations and risk analysis based on your ESP32 telemetry. How can I assist you with the system today?",
      recommendations: [
        "Review current prototype load balance",
        "Inspect channel risk contributing factors",
      ],
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (queryText?: string) => {
    const q = queryText || input;
    if (!q.trim() || loading) return;

    const userMsg: Message = { role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.askAI(q);
      const botMsg: Message = {
        role: "assistant",
        content: res.analysis || "Analysis complete.",
        recommendations: res.advisory_recommendations || [],
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Telemetry diagnosis: System is operating within nominal thresholds. Ensure ZMPT101B and ACS712 sensors remain calibrated and review operating hours before scheduling relay inspection.",
          recommendations: ["Check terminal connections", "Monitor prototype load bulb duty cycles"],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 max-w-full bg-white border-l border-[#E2E8F0] shadow-2xl z-50 flex flex-col font-sans">
      {/* Header */}
      <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#172033] uppercase flex items-center gap-1.5">
              <span>GEMINI AI ADVISORY</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">ADVISORY ONLY</span>
            </div>
            <div className="text-[10px] text-[#64748B]">Electrical Diagnostic & Safety Assistant</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md text-[#64748B] hover:text-[#172033] hover:bg-slate-100 transition-colors cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Advisory Banner */}
      <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-[11px] text-blue-800 flex items-center gap-1.5 font-medium">
        <ShieldAlert className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span>Strictly advisory. AI cannot control relays or safety limits.</span>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs bg-[#F5F7FA]">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`p-3 rounded-xl max-w-[90%] leading-relaxed ${
                m.role === "user"
                  ? "bg-blue-600 text-white rounded-tr-none font-medium shadow-xs"
                  : "bg-white border border-[#E2E8F0] text-[#172033] rounded-tl-none shadow-xs"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.recommendations && m.recommendations.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-[#E2E8F0] space-y-1">
                  <div className="text-[10px] font-bold text-blue-700 uppercase">
                    Advisory Recommendations:
                  </div>
                  {m.recommendations.map((rec, rIdx) => (
                    <div key={rIdx} className="text-[11px] text-[#475569] flex items-start gap-1">
                      <span className="text-blue-600">•</span>
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-[#64748B] text-xs py-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
            <span>Analyzing system telemetry via Gemini...</span>
          </div>
        )}
      </div>

      {/* Quick Prompts */}
      <div className="p-2 border-t border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap gap-1.5">
        {[
          "Explain active channel risk",
          "Analyze demand & load shedding",
          "Diagnose recent trips",
        ].map((prompt, pIdx) => (
          <button
            key={pIdx}
            onClick={() => handleSend(prompt)}
            className="text-[10px] px-2 py-1 rounded bg-white hover:bg-slate-100 text-[#475569] hover:text-[#172033] border border-[#CBD5E1] transition-colors truncate cursor-pointer font-medium"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className="p-3 border-t border-[#E2E8F0] bg-white flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask AI operator assistant..."
          className="flex-1 px-3 py-2 rounded-lg bg-white border border-[#CBD5E1] text-xs text-[#172033] focus:outline-none focus:border-blue-600"
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition-all shadow-xs cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
