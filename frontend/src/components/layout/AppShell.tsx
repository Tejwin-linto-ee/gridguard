"use client";

import React, { useState, useEffect } from "react";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [title]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  return (
    <div className="flex h-screen bg-[#F5F7FA] overflow-hidden text-[#172033]">

      {/* ── Desktop Sidebar (always visible on lg+) ── */}
      <div className="hidden lg:flex lg:shrink-0">
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      {/* ── Mobile Sidebar Overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer panel */}
          <div className="absolute left-0 top-0 h-full w-72 shadow-2xl animate-slide-in-left">
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Main Content Pane ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F5F7FA]">
        <Topbar
          title={title}
          dataSource={dataSource}
          onRefresh={onRefresh}
          hasActiveFault={hasActiveFault}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 bg-[#F5F7FA]">
          <div className="max-w-7xl mx-auto space-y-4 lg:space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* ── Floating AI Drawer Trigger ── */}
      <button
        onClick={() => setAiDrawerOpen(true)}
        className="fixed bottom-5 right-4 sm:bottom-6 sm:right-6 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-lg border border-[#1D4ED8] z-40 flex items-center gap-2 font-mono text-xs font-bold transition-colors cursor-pointer"
      >
        <Bot className="w-4 h-4" />
        <span className="hidden sm:inline">AI ADVISORY</span>
      </button>

      {/* ── AI Assistant Drawer ── */}
      <AIAssistantDrawer isOpen={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
    </div>
  );
}
