"use client";

import { useEffect, useState, useCallback } from "react";

interface PodMember {
  rider_id: string;
  rider_name: string;
  phone_number: string;
  pickup_location: string;
  status: string;
  joined_at: string;
  rider_confirmed_at: string | null;
}

interface Pod {
  id: string;
  host_name: string;
  host_phone: string;
  vehicle_type: string;
  from_location: string;
  to_location: string;
  departure_time: string;
  days_available: string[];
  available_seats: number;
  seats_taken: number;
  status: string;
  members: PodMember[];
  member_counts: {
    active: number;
    pending_host: number;
    pending_rider: number;
    dismissed: number;
    left: number;
    total: number;
  };
}

export default function AdminPodsPage() {
  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedPod, setExpandedPod] = useState<string | null>(null);

  const fetchPods = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pods");
      const data = await res.json();
      setPods(data.pods || []);
    } catch (err) {
      console.error("Failed to fetch pods:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPods();
  }, [fetchPods]);

  const filtered = pods.filter((pod) =>
    !search ||
    pod.host_name?.toLowerCase().includes(search.toLowerCase()) ||
    pod.host_phone?.includes(search) ||
    pod.from_location?.toLowerCase().includes(search.toLowerCase()) ||
    pod.to_location?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 text-green-700";
      case "pending_host": return "bg-blue-100 text-blue-700";
      case "pending_rider": return "bg-amber-100 text-amber-700";
      case "dismissed": return "bg-red-100 text-red-700";
      case "left": return "bg-gray-100 text-gray-600";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const getVehicleIcon = (type: string) => {
    return type === "2_wheeler" ? "🏍️" : "🚗";
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Ride Pods</h1>
          <p className="text-gray-500 mt-1">Browse active ride-sharing pods and their members</p>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by host name, phone, or route..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#6675FF] focus:ring-2 focus:ring-[#6675FF]/20 outline-none text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-3" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No pods found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your search</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((pod) => (
              <div key={pod.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                {/* Pod Header */}
                <div
                  className="p-5 cursor-pointer"
                  onClick={() => setExpandedPod(expandedPod === pod.id ? null : pod.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-800">{pod.host_name}</h3>
                        <span className="text-xs text-gray-400">{getVehicleIcon(pod.vehicle_type)} {pod.vehicle_type.replace("_", " ")}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="truncate">{pod.from_location} → {pod.to_location}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        <span>🕐 {pod.departure_time}</span>
                        <span>📅 {(pod.days_available || []).join(", ")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-800">{pod.seats_taken}/{pod.available_seats}</p>
                        <p className="text-xs text-gray-400">seats</p>
                      </div>
                      <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedPod === pod.id ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Expanded Members */}
                {expandedPod === pod.id && (
                  <div className="border-t border-gray-100">
                    <div className="px-5 py-3 bg-gray-50/50 flex items-center gap-3 text-xs text-gray-500">
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{pod.member_counts.active} active</span>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{pod.member_counts.pending_host} pending host</span>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{pod.member_counts.pending_rider} pending rider</span>
                      {pod.member_counts.dismissed > 0 && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">{pod.member_counts.dismissed} dismissed</span>}
                      {pod.member_counts.left > 0 && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{pod.member_counts.left} left</span>}
                    </div>
                    {pod.members.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100">
                              <th className="text-left px-5 py-3 font-semibold text-gray-600">Rider</th>
                              <th className="text-left px-5 py-3 font-semibold text-gray-600">Phone</th>
                              <th className="text-left px-5 py-3 font-semibold text-gray-600">Pickup</th>
                              <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
                              <th className="text-left px-5 py-3 font-semibold text-gray-600">Joined</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pod.members.map((member) => (
                              <tr key={member.rider_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                <td className="px-5 py-3 font-medium text-gray-800">{member.rider_name}</td>
                                <td className="px-5 py-3 text-gray-600">{member.phone_number}</td>
                                <td className="px-5 py-3 text-gray-600 max-w-[150px] truncate">{member.pickup_location}</td>
                                <td className="px-5 py-3">
                                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${getStatusColor(member.status)}`}>
                                    {member.status.replace("_", " ")}
                                  </span>
                                </td>
                                <td className="px-5 py-3 text-gray-500 text-xs">
                                  {new Date(member.joined_at).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="px-5 py-4 text-sm text-gray-400 text-center">No members in this pod</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
