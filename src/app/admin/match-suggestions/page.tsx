"use client";

import { useEffect, useState, useCallback } from "react";

interface SuggestionHost {
  name: string;
  phone: string;
  institution: string;
  from_location: string;
  to_location: string;
  departure_time: string;
  available_seats: number;
  route_distance_meters: number | null;
}

interface SuggestionRider {
  name: string;
  phone: string;
  institution: string;
  pickup_location: string;
  destination_location: string;
  route_distance_meters: number | null;
}

interface MatchSuggestion {
  id: string;
  status: string;
  route_match_score: number;
  schedule_match_score: number;
  overall_score: number;
  detour_distance_meters: number;
  pickup_distance_meters: number;
  overlapping_distance_meters: number;
  expires_at: string;
  shown_to_host_at: string | null;
  host_action_at: string | null;
  created_at: string;
  updated_at: string;
  host: SuggestionHost | null;
  rider: SuggestionRider | null;
}

export default function AdminMatchSuggestionsPage() {
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100", offset: "0" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/match-suggestions?${params}`);
      const data = await res.json();
      setSuggestions(data.suggestions || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch match suggestions:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending_host_approval": return "bg-blue-100 text-blue-700";
      case "pending_rider_approval": return "bg-amber-100 text-amber-700";
      case "accepted": return "bg-green-100 text-green-700";
      case "rejected": return "bg-red-100 text-red-700";
      case "expired": return "bg-gray-100 text-gray-600";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Match Suggestions</h1>
          <p className="text-gray-500 mt-1">Review and monitor ride match suggestions ({total} total)</p>
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
                placeholder="Search by host or rider name/phone..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#6675FF] focus:ring-2 focus:ring-[#6675FF]/20 outline-none text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#6675FF] focus:ring-2 focus:ring-[#6675FF]/20 outline-none text-sm bg-white"
            >
              <option value="all">All Status</option>
              <option value="pending_host_approval">Pending Host Approval</option>
              <option value="pending_rider_approval">Pending Rider Approval</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>

        {/* Suggestions List */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-3" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No match suggestions found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="space-y-4">
            {suggestions.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold ${getScoreColor(s.overall_score)} bg-gray-50`}>
                      {Math.round(s.overall_score)}
                    </div>
                    <div>
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${getStatusColor(s.status)}`}>
                        {s.status.replace(/_/g, " ")}
                      </span>
                      <p className="text-xs text-gray-400 mt-1.5">
                        Created {new Date(s.created_at).toLocaleDateString()}
                        {s.expires_at && ` · Expires ${new Date(s.expires_at).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    {s.host_action_at && <p>Actioned: {new Date(s.host_action_at).toLocaleDateString()}</p>}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Host Info */}
                  <div className="bg-blue-50/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="text-sm font-semibold text-blue-800">Host</span>
                    </div>
                    {s.host ? (
                      <div className="text-sm space-y-1">
                        <p className="font-medium text-gray-800">{s.host.name}</p>
                        <p className="text-gray-500">{s.host.phone} · {s.host.institution}</p>
                        <p className="text-gray-500 text-xs">
                          📍 {s.host.from_location} → {s.host.to_location}
                        </p>
                        <p className="text-gray-500 text-xs">🕐 {s.host.departure_time} · {s.host.available_seats} seats</p>
                        <p className="text-gray-500 text-xs">
                          🛣️ Host total distance: {s.host.route_distance_meters != null ? `${(s.host.route_distance_meters / 1000).toFixed(1)}km` : "—"}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Host data unavailable</p>
                    )}
                  </div>

                  {/* Rider Info */}
                  <div className="bg-emerald-50/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      <span className="text-sm font-semibold text-emerald-800">Rider</span>
                    </div>
                    {s.rider ? (
                      <div className="text-sm space-y-1">
                        <p className="font-medium text-gray-800">{s.rider.name}</p>
                        <p className="text-gray-500">{s.rider.phone} · {s.rider.institution}</p>
                        <p className="text-gray-500 text-xs">
                          📍 Pickup: {s.rider.pickup_location}
                        </p>
                        <p className="text-gray-500 text-xs">
                          🏁 Destination: {s.rider.destination_location}
                        </p>
                        <p className="text-gray-500 text-xs">
                          🛣️ Rider total distance: {s.rider.route_distance_meters != null ? `${(s.rider.route_distance_meters / 1000).toFixed(1)}km` : "—"}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Rider data unavailable</p>
                    )}
                  </div>
                </div>

                {/* Score Details */}
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
                  <span>Route match: <strong>{Math.round(s.route_match_score)}%</strong></span>
                  <span>Schedule match: <strong>{Math.round(s.schedule_match_score)}%</strong></span>
                  <span>Detour: <strong>{(s.detour_distance_meters / 1000).toFixed(1)}km</strong></span>
                  <span>Pickup distance: <strong>{(s.pickup_distance_meters / 1000).toFixed(1)}km</strong></span>
                  <span>Overlap: <strong>{(s.overlapping_distance_meters / 1000).toFixed(1)}km</strong></span>
                  <span>Estimated cost: <strong>₹{Math.round((s.overlapping_distance_meters / 1000) * 4)}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
