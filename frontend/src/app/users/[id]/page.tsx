"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import {
  User, ShieldCheck, ShieldAlert, KeyRound, ArrowLeft,
  Edit2, RefreshCw, Trash2, UserX, Clock, CheckCircle2,
  AlertTriangle, Shield, Check, X, Camera, Lock
} from "lucide-react";

interface OperatorDetail {
  id: number;
  user_id: string;
  display_name: string;
  role: string;
  status: string;
  biometric_status: string;
  enrollment_version: number;
  embedding_version: string;
  model_name: string;
  model_version: string;
  sample_count: number;
  average_quality_score: number;
  created_at: string;
  updated_at: string;
  enrolled_at?: string | null;
  last_verified_at?: string | null;
  verification_count: number;
  failed_attempts: number;
}

export default function OperatorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const operatorId = params.id as string;

  const [operator, setOperator] = useState<OperatorDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modals
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>("");
  const [editRole, setEditRole] = useState<string>("OPERATOR");
  const [editStatus, setEditStatus] = useState<string>("ACTIVE");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchDetail = async () => {
    try {
      setIsLoading(true);
      const data = await api.getUserDetail(operatorId);
      setOperator(data);
      setEditName(data.display_name);
      setEditRole(data.role);
      setEditStatus(data.status);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load operator profile.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (operatorId) {
      fetchDetail();
    }
  }, [operatorId]);

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operator) return;
    try {
      setIsSubmitting(true);
      await api.updateUser(operator.user_id, {
        display_name: editName.trim(),
        role: editRole,
        status: editStatus,
      });
      setShowEditModal(false);
      setNotice("Operator profile updated successfully.");
      await fetchDetail();
    } catch (err: any) {
      alert(err.message || "Failed to update profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!operator) return;
    try {
      setIsSubmitting(true);
      if (operator.status === "ACTIVE") {
        await api.disableUser(operator.user_id);
        setNotice("Operator disabled.");
      } else {
        await api.enableUser(operator.user_id);
        setNotice("Operator enabled.");
      }
      await fetchDetail();
    } catch (err: any) {
      alert(err.message || "Failed to toggle status.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!operator) return;
    try {
      setIsSubmitting(true);
      await api.deleteUser(operator.user_id);
      router.push("/users");
    } catch (err: any) {
      alert(err.message || "Failed to delete operator.");
      setIsSubmitting(false);
    }
  };

  const handleReenroll = async () => {
    if (!operator) return;
    try {
      await api.reenrollUser(operator.user_id);
      router.push(`/users/enroll?user_id=${encodeURIComponent(operator.user_id)}&name=${encodeURIComponent(operator.display_name)}&role=${operator.role}&reenroll=true`);
    } catch (err: any) {
      alert(err.message || "Failed to start re-enrollment.");
    }
  };

  return (
    <AppShell title="OPERATOR PROFILE" dataSource="LIVE DATABASE">
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/users"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white font-mono transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>← Back to Authorized Operators</span>
          </Link>

          {notice && (
            <div className="text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/40 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{notice}</span>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="scada-panel p-12 text-center text-slate-400 font-mono text-xs border border-slate-800">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-400" />
            Loading operator profile...
          </div>
        ) : errorMessage || !operator ? (
          <div className="scada-panel p-8 text-center text-red-400 font-mono text-xs border border-red-500/40 bg-red-950/20">
            {errorMessage || "Operator not found."}
          </div>
        ) : (
          <>
            {/* Header Card */}
            <div className="bg-white p-6 border border-[#E2E8F0] rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4 font-sans">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center border border-[#BFDBFE] font-mono font-bold text-lg">
                  {operator.display_name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-xl font-bold text-[#172033] font-mono">{operator.display_name}</h1>
                    <span className="text-xs font-mono text-[#2563EB] font-bold bg-[#EFF6FF] px-2 py-0.5 rounded border border-[#BFDBFE]">
                      {operator.user_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs font-mono text-[#64748B]">
                    <span>Role: <strong className="text-[#172033]">{operator.role}</strong></span>
                    <span>•</span>
                    <span>Status: <strong className={operator.status === "ACTIVE" ? "text-[#15803D]" : "text-[#B45309]"}>{operator.status}</strong></span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <button
                  onClick={() => setShowEditModal(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#475569] hover:text-[#172033] border border-[#CBD5E1] flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Edit2 className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>EDIT USER</span>
                </button>

                <button
                  onClick={handleReenroll}
                  className="px-3.5 py-1.5 rounded-lg bg-[#EFF6FF] hover:bg-blue-100 text-[#2563EB] border border-[#BFDBFE] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>RE-ENROLL FACE</span>
                </button>

                <button
                  onClick={handleToggleStatus}
                  className={`px-3.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    operator.status === "ACTIVE"
                      ? "bg-[#FFFBEB] hover:bg-amber-100 text-[#B45309] border-[#FDE68A]"
                      : "bg-[#F0FDF4] hover:bg-green-100 text-[#15803D] border-[#BBF7D0]"
                  }`}
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>{operator.status === "ACTIVE" ? "DISABLE USER" : "ENABLE USER"}</span>
                </button>

                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#FEF2F2] hover:bg-red-100 text-[#B91C1C] border border-[#FECACA] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[#B91C1C]" />
                  <span>DELETE USER</span>
                </button>
              </div>
            </div>

            {/* Profile & Biometric Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
              {/* User Profile Card */}
              <div className="bg-white p-6 border border-[#E2E8F0] rounded-xl shadow-xs font-mono">
                <div className="flex items-center gap-2.5 pb-3 border-b border-[#E2E8F0] text-xs font-bold text-[#172033] uppercase tracking-wider">
                  <User className="w-4 h-4 text-[#2563EB]" />
                  <span>User Profile Information</span>
                </div>

                <div className="divide-y divide-[#E2E8F0] text-xs mt-3">
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">Full Name</span>
                    <span className="font-bold text-[#172033]">{operator.display_name}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">Operator ID</span>
                    <span className="font-bold text-[#2563EB]">{operator.user_id}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">System Role</span>
                    <span className="font-bold text-[#172033]">{operator.role}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">Account Status</span>
                    <span className={operator.status === "ACTIVE" ? "font-bold text-[#15803D]" : "font-bold text-[#B45309]"}>
                      {operator.status}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">Registered On</span>
                    <span className="text-[#172033]">{new Date(operator.created_at).toLocaleString()}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">Last Profile Update</span>
                    <span className="text-[#172033]">{new Date(operator.updated_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Biometric Profile Card */}
              <div className="bg-white p-6 border border-[#E2E8F0] rounded-xl shadow-xs font-mono">
                <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-[#172033] uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4 text-[#15803D]" />
                    <span>Biometric Profile (FaceNet512)</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    operator.biometric_status === "ENROLLED"
                      ? "bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0]"
                      : "bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1]"
                  }`}>
                    {operator.biometric_status.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="divide-y divide-[#E2E8F0] text-xs mt-3">
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">Embedding Model</span>
                    <span className="font-bold text-[#2563EB]">{operator.model_name}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">Model Version</span>
                    <span className="text-[#172033]">{operator.model_version}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">Embedding Dimension</span>
                    <span className="text-[#172033]">512-D L2-Normalized Centroid</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">Enrollment Samples</span>
                    <span className="text-[#172033]">{operator.sample_count} Guided Live Samples</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">Average Quality Score</span>
                    <span className="text-[#15803D] font-bold">{(operator.average_quality_score * 100).toFixed(1)}%</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">Enrollment Date</span>
                    <span className="text-[#172033]">
                      {operator.enrolled_at ? new Date(operator.enrolled_at).toLocaleString() : "Not enrolled yet"}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">Last Verified</span>
                    <span className="text-[#172033]">
                      {operator.last_verified_at ? new Date(operator.last_verified_at).toLocaleString() : "Never"}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-[#64748B]">Verification Attempts</span>
                    <span className="text-[#172033] font-bold">{operator.verification_count} attempts ({operator.failed_attempts} failed)</span>
                  </div>
                </div>

                {/* Privacy & Template Protection Notice */}
                <div className="mt-4 p-3 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[11px] text-[#1D4ED8] flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 text-[#2563EB] shrink-0 mt-0.5" />
                  <span>
                    <strong>Biometric Invariant:</strong> Raw camera frames and 512-D mathematical vectors are protected and never transmitted to frontend client browsers.
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Edit Modal */}
        {showEditModal && operator && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 font-sans">
            <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl p-6 shadow-2xl font-mono text-xs">
              <h3 className="text-sm font-bold text-[#172033] uppercase tracking-wider mb-4 pb-2 border-b border-[#E2E8F0]">
                Edit Operator Profile
              </h3>
              <form onSubmit={handleEdit} className="space-y-4">
                <div>
                  <label className="block text-[#475569] font-semibold mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-[#475569] font-semibold mb-1">Role</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value="OPERATOR">OPERATOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#475569] font-semibold mb-1">Account Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DISABLED">DISABLED</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#475569] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && operator && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 font-sans">
            <div className="w-full max-w-sm bg-white border border-[#CBD5E1] rounded-2xl p-6 shadow-2xl font-mono text-xs">
              <h3 className="text-sm font-bold text-[#B91C1C] uppercase tracking-wider mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Delete Authorized Operator?</span>
              </h3>
              <p className="text-[#475569] mb-4">
                This action will permanently revoke biometric reset authorization for <strong className="text-[#172033]">{operator.display_name}</strong> ({operator.user_id}).
              </p>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#475569] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold cursor-pointer"
                >
                  DELETE USER
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
