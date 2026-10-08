"use client";

import React, { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { AIAssistantDrawer } from "@/components/ai/AIAssistantDrawer";
import { Bot } from "lucide-react";

interface AppShellProps {
  title: string;
  dataSource?: string;
  onRefresh?: () => void;
  hasActiveFault?: boolean;
  children: React.ReactNode;
}

export function AppShell({ title, dataSource = "DEMO DATA", onRefresh, hasActiveFault = false, children }: AppShellProps) {
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[#F5F7FA] overflow-hidden text-[#172033]">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F5F7FA]">
        <Topbar title={title} dataSource={dataSource} onRefresh={onRefresh} hasActiveFault={hasActiveFault} />

        <main className="flex-1 overflow-y-auto p-6 bg-[#F5F7FA]">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* Floating AI Diagnostic Drawer Trigger */}
      <button
        onClick={() => setAiDrawerOpen(true)}
        className="fixed bottom-6 right-6 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-md border border-[#1D4ED8] z-40 flex items-center gap-2 font-mono text-xs font-bold transition-colors cursor-pointer"
      >
        <Bot className="w-4 h-4" />
        <span className="hidden sm:inline">AI ADVISORY</span>
      </button>

      {/* Slide-over AI Assistant Drawer */}
      <AIAssistantDrawer isOpen={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
    </div>
  );
}
