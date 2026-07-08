"use client";

import { useEffect, useState, useCallback } from "react";

interface Profile {
  id: string;
  full_name: string;
  phone_number: string;
  age: number;
  gender: string;
  institution: string;
  academic_start_year: number | null;
  academic_end_year: number | null;
  is_pursuing: boolean | null;
  institutional_email: string | null;
  rejection_reason: string | null;
  from_location: string;
  to_location: string;
  leave_home_time: string;
  leave_college_time: string;
  days_of_commute: string[];
  prefer_hosting: boolean;
  prefer_taking_ride: boolean;
  vehicle_type: string | null;
  comfortable_with: string;
  email_verified: boolean | null;
  created_at: string;
  campus_leaders?: { id: string }[];
}

type FilterType = "all" | "pending" | "verified" | "rejected";

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Rejection modal state
  const [rejectModal, setRejectModal] = useState<{ open: boolean; userId: string; userName: string }>({ open: false, userId: "", userName: "" });
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/waitlist");
      const data = await res.json();
      setProfiles(data.entries || []);
    } catch (err) {
      console.error("Failed to fetch profiles:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleApprove = async (userId: string) => {
    setActionLoading(userId);
    try {
      const res = await fetch("/api/admin/verify-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "approve" }),
      });
      const data = await res.json();
      if (data.success) {
        setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, email_verified: true, institutional_email: "Manual Approval" } : p)));
      } else {
        alert(data.error || "Failed to approve user");
      }
    } catch {
      alert("Network error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) return;
    setRejecting(true);
    try {
      const res = await fetch("/api/admin/verify-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: rejectModal.userId, action: "reject", rejectionReason }),
      });
      const data = await res.json();
      if (data.success) {
        setProfiles((prev) => prev.map((p) => (p.id === rejectModal.userId ? { ...p, email_verified: false, institutional_email: "REJECTED", rejection_reason: rejectionReason } : p)));
        setRejectModal({ open: false, userId: "", userName: "" });
        setRejectionReason("");
      } else {
        alert(data.error || "Failed to reject user");
      }
    } catch {
      alert("Network error");
    } finally {
      setRejecting(false);
    }
  };

  const isCampusLeader = (profile: Profile) => {
    return !!profile.campus_leaders && (Array.isArray(profile.campus_leaders) ? profile.campus_leaders.length > 0 : true);
  };

  const handleToggleCampusLeader = async (userId: string, isLeader: boolean, institution: string) => {
    try {
      if (isLeader) {
        if (!confirm("Are you sure you want to revoke Campus Leader status?")) return;
        setActionLoading(`cl-${userId}`);
        const res = await fetch(`/api/admin/campus-leaders?userId=${userId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to revoke");
        setProfiles(prev => prev.map(p => p.id === userId ? { ...p, campus_leaders: [] } : p));
      } else {
        const inst = prompt("Enter institution for this Campus Leader:", institution || "");
        if (!inst) return;
        setActionLoading(`cl-${userId}`);
        const res = await fetch(`/api/admin/campus-leaders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, institution: inst })
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to promote");
        }
        setProfiles(prev => prev.map(p => p.id === userId ? { ...p, campus_leaders: [{ id: "new" }] } : p));
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = profiles.filter((p) => {
    const matchesSearch =
      !search ||
      p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.phone_number?.includes(search) ||
      p.institution?.toLowerCase().includes(search.toLowerCase()) ||
      p.institutional_email?.toLowerCase().includes(search.toLowerCase());

    const matchesFilter =
      filter === "all" ||
      (filter === "verified" && p.email_verified === true) ||
      (filter === "pending" && p.email_verified !== true && p.institutional_email !== "REJECTED") ||
      (filter === "rejected" && p.institutional_email === "REJECTED");

    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (profile: Profile) => {
    if (profile.email_verified === true) return <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Verified</span>;
    if (profile.institutional_email === "REJECTED") return <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">Rejected</span>;
    return <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">Pending</span>;
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">User Management</h1>
          <p className="text-gray-500 mt-1">Review, approve, or reject user verification requests</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone, institution..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#6675FF] focus:ring-2 focus:ring-[#6675FF]/20 outline-none text-sm"
              />
            </div>
            <div className="flex gap-2">
              {(["all", "pending", "verified", "rejected"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors capitalize ${
                    filter === f
                      ? "bg-[#6675FF] text-white"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No users found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3.5 font-semibold text-gray-600">Name</th>
                    <th className="text-left px-4 py-3.5 font-semibold text-gray-600">Phone</th>
                    <th className="text-left px-4 py-3.5 font-semibold text-gray-600">Institution</th>
                    <th className="text-left px-4 py-3.5 font-semibold text-gray-600">Student?</th>
                    <th className="text-left px-4 py-3.5 font-semibold text-gray-600">Role</th>
                    <th className="text-left px-4 py-3.5 font-semibold text-gray-600">Route</th>
                    <th className="text-left px-4 py-3.5 font-semibold text-gray-600">Status</th>
                    <th className="text-right px-4 py-3.5 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((profile) => (
                    <tr key={profile.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-gray-800">{profile.full_name}</p>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600">{profile.phone_number}</td>
                      <td className="px-4 py-3.5 text-gray-600">{profile.institution}</td>
                      <td className="px-4 py-3.5">
                        {profile.is_pursuing === false ? (
                          <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">Graduated</span>
                        ) : (
                          <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Pursuing</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1 items-start">
                          <div className="flex gap-1">
                            {profile.prefer_hosting && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">Host</span>}
                            {profile.prefer_taking_ride && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">Rider</span>}
                          </div>
                          {isCampusLeader(profile) && (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold uppercase rounded border border-purple-200">
                              Leader
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 max-w-[200px] truncate" title={`${profile.from_location} → ${profile.to_location}`}>
                        {profile.from_location} → {profile.to_location}
                      </td>
                      <td className="px-4 py-3.5">{getStatusBadge(profile)}</td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/admin/users/${profile.id}`}
                            className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium rounded-lg transition-colors border border-gray-200"
                          >
                            View
                          </a>
                          
                          <button
                            onClick={() => handleToggleCampusLeader(profile.id, isCampusLeader(profile), profile.institution)}
                            disabled={actionLoading === `cl-${profile.id}`}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border disabled:opacity-50 ${
                              isCampusLeader(profile)
                                ? "bg-white text-red-600 border-red-200 hover:bg-red-50"
                                : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                            }`}
                          >
                            {actionLoading === `cl-${profile.id}` ? "..." : (isCampusLeader(profile) ? "- CL" : "+ CL")}
                          </button>

                          {profile.email_verified !== true && profile.institutional_email !== "REJECTED" && (
                            <>
                              <button
                                onClick={() => handleApprove(profile.id)}
                                disabled={actionLoading === profile.id}
                                className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                              >
                                {actionLoading === profile.id ? "..." : "Approve"}
                              </button>
                              <button
                                onClick={() => setRejectModal({ open: true, userId: profile.id, userName: profile.full_name })}
                                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium rounded-lg transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {profile.institutional_email === "REJECTED" && profile.rejection_reason && (
                            <span className="text-xs text-gray-400 italic" title={profile.rejection_reason}>
                              {profile.rejection_reason.length > 20 ? profile.rejection_reason.slice(0, 20) + "..." : profile.rejection_reason}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
              Showing {filtered.length} of {profiles.length} users
            </div>
          </div>
        )}

        {/* Rejection Modal */}
        {rejectModal.open && (
          <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-4" onClick={() => setRejectModal({ open: false, userId: "", userName: "" })}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Reject User</h3>
              <p className="text-sm text-gray-500 mb-4">Provide a reason for rejecting <strong>{rejectModal.userName}</strong></p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason..."
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#6675FF] focus:ring-2 focus:ring-[#6675FF]/20 outline-none resize-none text-sm"
              />
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => { setRejectModal({ open: false, userId: "", userName: "" }); setRejectionReason(""); }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={!rejectionReason.trim() || rejecting}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {rejecting ? "Rejecting..." : "Reject"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
