"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import {
  Users, UserPlus, ShieldAlert, ShieldCheck, UserCheck, Search,
  Filter, MoreVertical, Edit2, Trash2, UserX, RefreshCw, KeyRound,
  AlertTriangle, CheckCircle2, Clock, Eye, AlertOctagon, Sparkles
} from "lucide-react";

interface Operator {
  id: number;
  user_id: string;
  display_name: string;
  role: "ADMIN" | "OPERATOR";
  status: "ACTIVE" | "DISABLED" | "REVOKED";
  biometric_status: "ENROLLED" | "NOT_ENROLLED" | "RE_ENROLLMENT_PENDING" | "DISABLED";
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

/**
 * Normalizes a raw API response object into a safe Operator record.
 * Guards against field name variations and null/undefined values that
 * would cause runtime TypeErrors (e.g. .toLowerCase() on undefined).
 */
function normalizeOperator(raw: any): Operator {
  const safeStr = (v: any, fallback = ""): string =>
    typeof v === "string" && v.length > 0 ? v : fallback;
  const safeNum = (v: any, fallback = 0): number =>
    typeof v === "number" && isFinite(v) ? v : fallback;

  // Resolve display_name from multiple possible field names (API contract variance)
  const display_name =
    safeStr(raw?.display_name) ||
    safeStr(raw?.name) ||
    safeStr(raw?.username) ||
    "Unknown Operator";

  // Resolve user_id from multiple possible field names
  const user_id =
    safeStr(raw?.user_id) ||
    safeStr(raw?.username) ||
    safeStr(String(raw?.id ?? ""));

  const role = (raw?.role === "ADMIN" || raw?.role === "OPERATOR")
    ? raw.role as "ADMIN" | "OPERATOR"
    : "OPERATOR";

  const status = (["ACTIVE", "DISABLED", "REVOKED"] as const).includes(raw?.status)
    ? raw.status as "ACTIVE" | "DISABLED" | "REVOKED"
    : raw?.is_active === false ? "DISABLED" : "ACTIVE";

  const biometric_status = (
    ["ENROLLED", "NOT_ENROLLED", "RE_ENROLLMENT_PENDING", "DISABLED"] as const
  ).includes(raw?.biometric_status)
    ? raw.biometric_status as "ENROLLED" | "NOT_ENROLLED" | "RE_ENROLLMENT_PENDING" | "DISABLED"
    : "NOT_ENROLLED";

  return {
    id: safeNum(raw?.id, 0),
    user_id,
    display_name,
    role,
    status,
    biometric_status,
    enrollment_version: safeNum(raw?.enrollment_version, 1),
    embedding_version: safeStr(raw?.embedding_version, "—"),
    model_name: safeStr(raw?.model_name, "FaceNet512"),
    model_version: safeStr(raw?.model_version, "—"),
    sample_count: safeNum(raw?.sample_count, 0),
    average_quality_score: safeNum(raw?.average_quality_score, 0),
    created_at: safeStr(raw?.created_at, new Date().toISOString()),
    updated_at: safeStr(raw?.updated_at, new Date().toISOString()),
    enrolled_at: raw?.enrolled_at ?? null,
    last_verified_at: raw?.last_verified_at ?? null,
    verification_count: safeNum(raw?.verification_count, 0),
    failed_attempts: safeNum(raw?.failed_attempts, 0),
  };
}

export default function AuthorizedOperatorsPage() {
  const router = useRouter();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [biometricFilter, setBiometricFilter] = useState<string>("ALL");

  // Active action menu operator ID
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [showStatusModal, setShowStatusModal] = useState<boolean>(false);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);

  // Form states
  const [formUserId, setFormUserId] = useState<string>("");
  const [formName, setFormName] = useState<string>("");
  const [formRole, setFormRole] = useState<"ADMIN" | "OPERATOR">("OPERATOR");
  const [formStatus, setFormStatus] = useState<"ACTIVE" | "DISABLED">("ACTIVE");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchOperators = async () => {
    try {
      setIsLoading(true);
      const raw = await api.getUsers();
      // Normalize ALL items through the contract-safe normalizer.
      // This is the authoritative defense against field-name mismatches and null values.
      const normalized = Array.isArray(raw)
        ? raw.map((item: any) => normalizeOperator(item))
        : [];
      setOperators(normalized);
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load authorized operators.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOperators();
  }, []);

  const showNotice = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(null), 4000);
  };

  const filteredOperators = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return operators.filter((op) => {
      // Safe: normalizeOperator guarantees display_name and user_id are non-empty strings
      const matchSearch =
        !q ||
        op.display_name.toLowerCase().includes(q) ||
        op.user_id.toLowerCase().includes(q);

      const matchRole = roleFilter === "ALL" || op.role === roleFilter;
      const matchStatus = statusFilter === "ALL" || op.status === statusFilter;
      const matchBio =
        biometricFilter === "ALL" ||
        (biometricFilter === "ENROLLED" && op.biometric_status === "ENROLLED") ||
        (biometricFilter === "NOT_ENROLLED" && op.biometric_status === "NOT_ENROLLED") ||
        (biometricFilter === "RE_ENROLLMENT_REQUIRED" && op.biometric_status === "RE_ENROLLMENT_PENDING");

      return matchSearch && matchRole && matchStatus && matchBio;
    });
  }, [operators, searchQuery, roleFilter, statusFilter, biometricFilter]);

  // Handle Add Operator
  const handleCreateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUserId.trim() || !formName.trim()) {
      alert("Please provide both Operator ID and Full Name.");
      return;
    }

    try {
      setIsSubmitting(true);
      await api.createUser({
        user_id: formUserId.trim(),
        display_name: formName.trim(),
        role: formRole,
      });
      setShowAddModal(false);
      showNotice(`Authorized operator '${formName}' created.`);
      await fetchOperators();
      // Redirect to guided live camera enrollment
      router.push(`/users/enroll?user_id=${encodeURIComponent(formUserId.trim())}&name=${encodeURIComponent(formName.trim())}&role=${formRole}`);
    } catch (err: any) {
      alert(err.message || "Failed to register operator.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit Operator
  const handleEditOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOperator) return;

    try {
      setIsSubmitting(true);
      await api.updateUser(selectedOperator.user_id, {
        display_name: formName.trim(),
        role: formRole,
        status: formStatus,
      });
      setShowEditModal(false);
      showNotice("Operator profile updated.");
      await fetchOperators();
    } catch (err: any) {
      alert(err.message || "Failed to update operator profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Status Toggle (Enable/Disable)
  const handleToggleStatus = async () => {
    if (!selectedOperator) return;
    try {
      setIsSubmitting(true);
      if (selectedOperator.status === "ACTIVE") {
        await api.disableUser(selectedOperator.user_id);
        showNotice("Operator access disabled.");
      } else {
        await api.enableUser(selectedOperator.user_id);
        showNotice("Operator access restored.");
      }
      setShowStatusModal(false);
      await fetchOperators();
    } catch (err: any) {
      alert(err.message || "Failed to toggle operator status.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Operator
  const handleDeleteOperator = async () => {
    if (!selectedOperator) return;
    try {
      setIsSubmitting(true);
      await api.deleteUser(selectedOperator.user_id);
      setShowDeleteModal(false);
      showNotice("Authorized operator removed.");
      await fetchOperators();
    } catch (err: any) {
      alert(err.message || "Failed to delete operator.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Re-enroll
  const handleStartReenrollment = async (op: Operator) => {
    try {
      await api.reenrollUser(op.user_id);
      showNotice("Biometric re-enrollment initialized.");
      router.push(`/users/enroll?user_id=${encodeURIComponent(op.user_id)}&name=${encodeURIComponent(op.display_name)}&role=${op.role}&reenroll=true`);
    } catch (err: any) {
      alert(err.message || "Failed to start re-enrollment.");
    }
  };

  return (
    <AppShell title="AUTHORIZED OPERATORS" dataSource="LIVE DATABASE">
      {/* Toast Notice */}
      {successNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 text-xs font-mono flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-xs font-mono flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-[#B91C1C] shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Header & Primary Admin Action */}
      <div className="bg-white p-6 border border-[#E2E8F0] rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4 font-sans">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
              <Users className="w-5 h-5 text-[#2563EB]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#172033] font-mono uppercase tracking-wider">
                AUTHORIZED OPERATORS
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Manage authorized personnel and biometric access permissions.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setFormUserId(`OP-${Math.floor(100 + Math.random() * 900)}`);
              setFormName("");
              setFormRole("OPERATOR");
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-mono font-bold text-xs tracking-wide transition-colors shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ ADD AUTHORIZED OPERATOR</span>
          </button>
        </div>
      </div>

      {/* Search & Filter SCADA Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 font-sans">
        <div className="relative md:col-span-1">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search operators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-[#CBD5E1] text-xs text-[#172033] placeholder-[#94A3B8] font-mono focus:outline-none focus:border-[#2563EB] shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-mono shadow-2xs">
          <span className="text-[#64748B] text-[11px] font-semibold">Role:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-transparent text-[#172033] text-xs focus:outline-none cursor-pointer flex-1"
          >
            <option value="ALL">ALL</option>
            <option value="ADMIN">ADMIN</option>
            <option value="OPERATOR">OPERATOR</option>
          </select>
        </div>

        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-mono shadow-2xs">
          <span className="text-[#64748B] text-[11px] font-semibold">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-[#172033] text-xs focus:outline-none cursor-pointer flex-1"
          >
            <option value="ALL">ALL</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DISABLED">DISABLED</option>
          </select>
        </div>

        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-mono shadow-2xs">
          <span className="text-[#64748B] text-[11px] font-semibold">Biometric:</span>
          <select
            value={biometricFilter}
            onChange={(e) => setBiometricFilter(e.target.value)}
            className="bg-transparent text-[#172033] text-xs focus:outline-none cursor-pointer flex-1"
          >
            <option value="ALL">ALL</option>
            <option value="ENROLLED">ENROLLED</option>
            <option value="NOT_ENROLLED">NOT ENROLLED</option>
            <option value="RE_ENROLLMENT_REQUIRED">RE-ENROLLMENT REQUIRED</option>
          </select>
        </div>
      </div>

      {/* Operators Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569] uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Operator Name</th>
                <th className="py-3 px-4">Operator ID</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Biometric Status</th>
                <th className="py-3 px-4">Enrollment Date</th>
                <th className="py-3 px-4">Last Verification</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#64748B]">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#2563EB]" />
                    Loading authorized operators...
                  </td>
                </tr>
              ) : filteredOperators.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#64748B]">
                    No operators match the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredOperators.map((op) => (
                  <tr key={op.user_id} className="hover:bg-[#F8FAFC] transition-colors group">
                    <td className="py-3.5 px-4">
                      <Link
                        href={`/users/${op.user_id}`}
                        className="font-bold text-[#172033] hover:text-[#2563EB] transition-colors flex items-center gap-2"
                      >
                        <span>{op.display_name}</span>
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#2563EB] font-bold">
                      {op.user_id}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          op.role === "ADMIN"
                            ? "bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]"
                            : "bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1]"
                        }`}
                      >
                        {op.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                          op.status === "ACTIVE"
                            ? "bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0]"
                            : "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${op.status === "ACTIVE" ? "bg-[#16A34A]" : "bg-[#D97706]"}`} />
                        {op.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                          op.biometric_status === "ENROLLED"
                            ? "bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0]"
                            : op.biometric_status === "RE_ENROLLMENT_PENDING"
                            ? "bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]"
                            : op.biometric_status === "DISABLED"
                            ? "bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]"
                            : "bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1]"
                        }`}
                      >
                        {op.biometric_status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-[#64748B] text-[11px]">
                      {op.enrolled_at ? new Date(op.enrolled_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3.5 px-4 text-[#64748B] text-[11px]">
                      {op.last_verified_at ? new Date(op.last_verified_at).toLocaleDateString() : "Never"}
                    </td>
                    <td className="py-3.5 px-4 text-right relative">
                      <div className="inline-block text-left">
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === op.user_id ? null : op.user_id)}
                          className="p-1.5 rounded hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#172033] transition-colors cursor-pointer"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Action Menu [ ⋮ ] */}
                        {activeMenuId === op.user_id && (
                          <div className="absolute right-4 mt-1 w-48 rounded-xl bg-white border border-[#CBD5E1] shadow-xl z-30 py-1 font-mono text-xs">
                            <Link
                              href={`/users/${op.user_id}`}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-[#F8FAFC] text-[#172033]"
                              onClick={() => setActiveMenuId(null)}
                            >
                              <Eye className="w-3.5 h-3.5 text-[#2563EB]" />
                              <span>View Profile</span>
                            </Link>

                            <button
                              onClick={() => {
                                setSelectedOperator(op);
                                setFormName(op.display_name);
                                setFormRole(op.role);
                                setFormStatus(op.status as any);
                                setShowEditModal(true);
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-[#F8FAFC] text-[#172033] cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-[#2563EB]" />
                              <span>Edit User</span>
                            </button>

                            <button
                              onClick={() => {
                                handleStartReenrollment(op);
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-[#F8FAFC] text-[#172033] cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-[#2563EB]" />
                              <span>Re-enroll Face</span>
                            </button>

                            <button
                              onClick={() => {
                                setSelectedOperator(op);
                                setShowStatusModal(true);
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-[#F8FAFC] text-[#172033] cursor-pointer"
                            >
                              <UserX className="w-3.5 h-3.5 text-[#B45309]" />
                              <span>{op.status === "ACTIVE" ? "Disable User" : "Enable User"}</span>
                            </button>

                            <div className="h-px bg-[#E2E8F0] my-1" />

                            <button
                              onClick={() => {
                                setSelectedOperator(op);
                                setShowDeleteModal(true);
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-[#FEF2F2] text-[#B91C1C] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete User</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD AUTHORIZED OPERATOR MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <h3 className="text-sm font-bold text-[#172033] font-mono uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#2563EB]" />
                <span>Add Authorized Operator</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[#64748B] hover:text-[#172033] text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOperator} className="space-y-4 mt-4 text-xs font-mono">
              <div>
                <label className="block text-[#475569] font-semibold mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. John Doe / Lead Operator"
                  className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#475569] font-semibold mb-1">Operator ID</label>
                <input
                  type="text"
                  required
                  value={formUserId}
                  onChange={(e) => setFormUserId(e.target.value)}
                  placeholder="e.g. OP-042"
                  className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#2563EB] font-bold focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#475569] font-semibold mb-1">System Role</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="OPERATOR">OPERATOR (Protection Control & Reset)</option>
                  <option value="ADMIN">ADMIN (Full System & User Governance)</option>
                </select>
              </div>

              <div className="p-3 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[11px] text-[#1D4ED8] space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
                  Live Camera Biometric Enrollment
                </p>
                <p className="text-[#475569]">
                  Registering the user will initialize browser-camera 5-sample live capture with FaceNet512 centroid creation.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#475569] text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <span>START FACE ENROLLMENT →</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {showEditModal && selectedOperator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <h3 className="text-sm font-bold text-[#172033] font-mono uppercase tracking-wider flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#2563EB]" />
                <span>Edit Operator Profile</span>
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-[#64748B] hover:text-[#172033] text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditOperator} className="space-y-4 mt-4 text-xs font-mono">
              <div>
                <label className="block text-[#475569] font-semibold mb-1">Operator ID</label>
                <input
                  type="text"
                  disabled
                  value={selectedOperator.user_id}
                  className="w-full px-3 py-2 rounded-lg bg-[#F1F5F9] border border-[#CBD5E1] text-[#64748B] font-bold"
                />
              </div>

              <div>
                <label className="block text-[#475569] font-semibold mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#475569] font-semibold mb-1">System Role</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="OPERATOR">OPERATOR</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              <div>
                <label className="block text-[#475569] font-semibold mb-1">Account Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="DISABLED">DISABLED</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#475569] text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DISABLE / ENABLE CONFIRMATION MODAL */}
      {showStatusModal && selectedOperator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white border border-[#CBD5E1] rounded-2xl p-6 shadow-2xl font-mono">
            <div className="flex items-center gap-3 text-[#B45309] mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#172033]">
                {selectedOperator.status === "ACTIVE" ? "Disable Operator?" : "Enable Operator?"}
              </h3>
            </div>
            <p className="text-xs text-[#475569] mb-4 leading-relaxed">
              {selectedOperator.status === "ACTIVE"
                ? `Disabling '${selectedOperator.display_name}' (${selectedOperator.user_id}) will immediately prevent biometric authorization and fault reset access.`
                : `Restore biometric authentication privileges for '${selectedOperator.display_name}' (${selectedOperator.user_id})?`}
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowStatusModal(false)}
                className="px-3.5 py-1.5 rounded-lg bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#475569] text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleToggleStatus}
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                {selectedOperator.status === "ACTIVE" ? "Confirm Disable" : "Confirm Enable"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE OPERATOR CONFIRMATION MODAL */}
      {showDeleteModal && selectedOperator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white border border-[#CBD5E1] rounded-2xl p-6 shadow-2xl font-mono">
            <div className="flex items-center gap-3 text-[#B91C1C] mb-3">
              <AlertOctagon className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#172033]">
                DELETE AUTHORIZED OPERATOR?
              </h3>
            </div>
            <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs space-y-1 mb-3">
              <p className="text-[#64748B]">Name: <span className="text-[#172033] font-bold">{selectedOperator.display_name}</span></p>
              <p className="text-[#64748B]">Operator ID: <span className="text-[#2563EB] font-bold">{selectedOperator.user_id}</span></p>
              <p className="text-[#64748B]">Role: <span className="text-[#475569] font-bold">{selectedOperator.role}</span></p>
            </div>
            <p className="text-xs text-[#B91C1C] mb-4 leading-relaxed font-semibold">
              This action will revoke this operator&apos;s biometric authorization. They will be permanently barred from safety reset execution.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-3.5 py-1.5 rounded-lg bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#475569] text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteOperator}
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                DELETE USER
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
