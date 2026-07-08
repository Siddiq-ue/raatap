"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

export default function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const resolvedParams = use(params);
  const userId = resolvedParams.userId;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "history" | "logs">("active");

  useEffect(() => {
    fetchUserDetails();
  }, [userId]);

  const fetchUserDetails = async () => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load user");
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCampusLeader = async () => {
    try {
      if (data.isCampusLeader) {
        if (!confirm("Are you sure you want to revoke Campus Leader status?")) return;
        const res = await fetch(`/api/admin/campus-leaders?userId=${userId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to revoke");
        setData({ ...data, isCampusLeader: false });
        alert("Campus Leader status revoked.");
      } else {
        const institution = prompt("Enter institution for this Campus Leader:", data.profile.institution || "");
        if (!institution) return;
        const res = await fetch(`/api/admin/campus-leaders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, institution })
        });
        if (!res.ok) throw new Error("Failed to promote");
        setData({ ...data, isCampusLeader: true });
        alert("User promoted to Campus Leader successfully.");
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading user data...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  if (!data || !data.profile) return <div className="p-8 text-center text-gray-500">User not found</div>;

  const { profile, rideTemplates, rideRequests, podMemberships, activityLogs, isCampusLeader } = data;

  // Split into active vs history
  const activeTemplates = rideTemplates.filter((t: any) => t.status === "active");
  const historyTemplates = rideTemplates.filter((t: any) => t.status !== "active");
  
  const activeRequests = rideRequests.filter((r: any) => r.status === "pending" || r.status === "matched");
  const historyRequests = rideRequests.filter((r: any) => r.status !== "pending" && r.status !== "matched");
  
  const activePods = podMemberships.filter((p: any) => p.status === "active" || p.status === "pending_host" || p.status === "pending_rider");
  const historyPods = podMemberships.filter((p: any) => p.status !== "active" && p.status !== "pending_host" && p.status !== "pending_rider");

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <Link href="/admin/users" className="text-[#6675FF] hover:underline flex items-center gap-1 text-sm font-medium">
        &larr; Back to Users
      </Link>
      
      {/* Profile Header */}
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-start gap-6 relative">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#6675FF] to-[#8892ff] flex items-center justify-center text-white text-3xl font-bold shrink-0">
          {profile.full_name?.charAt(0) || "?"}
        </div>
        <div className="flex-1">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              {profile.full_name}
              {profile.email_verified && (
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {isCampusLeader && (
                <span className="bg-purple-100 text-purple-700 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-purple-200">
                  Campus Leader
                </span>
              )}
            </h1>
            
            <button
              onClick={toggleCampusLeader}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border shadow-sm ${
                isCampusLeader 
                  ? "bg-white text-red-600 border-red-200 hover:bg-red-50" 
                  : "bg-purple-600 text-white border-transparent hover:bg-purple-700"
              }`}
            >
              {isCampusLeader ? "Revoke Campus Leader" : "Make Campus Leader"}
            </button>
          </div>
          <p className="text-gray-500 mt-1">{profile.institutional_email}</p>
          <div className="flex flex-wrap gap-2 mt-3 text-sm">
            <span className="bg-gray-100 px-3 py-1 rounded-full text-gray-700 font-medium">Phone: {profile.phone_number || "N/A"}</span>
            <span className="bg-gray-100 px-3 py-1 rounded-full text-gray-700 font-medium">Inst: {profile.institution || "N/A"}</span>
            <span className="bg-gray-100 px-3 py-1 rounded-full text-gray-700 font-medium">Gender: {profile.gender}</span>
            <span className="bg-gray-100 px-3 py-1 rounded-full text-gray-700 font-medium">
              Academic Years: {profile.academic_start_year || "N/A"}–{profile.academic_end_year || "N/A"}
            </span>
            {profile.is_pursuing === false ? (
              <span className="bg-red-100 px-3 py-1 rounded-full text-red-700 font-medium">Graduated (not pursuing)</span>
            ) : (
              <span className="bg-green-100 px-3 py-1 rounded-full text-green-700 font-medium">Pursuing</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["active", "history", "logs"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2.5 rounded-xl font-medium transition-colors capitalize ${
              activeTab === tab
                ? "bg-[#6675FF] text-white shadow-md shadow-[#6675FF]/20"
                : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            {tab === "logs" ? "Activity Logs" : `${tab} Data`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === "active" && (
          <>
            <Section title="Active Host Templates" items={activeTemplates} type="template" />
            <Section title="Active Ride Requests" items={activeRequests} type="request" />
            <Section title="Active Pod Memberships" items={activePods} type="pod" />
          </>
        )}
        
        {activeTab === "history" && (
          <>
            <Section title="Historical Host Templates" items={historyTemplates} type="template" />
            <Section title="Historical Ride Requests" items={historyRequests} type="request" />
            <Section title="Historical Pod Memberships" items={historyPods} type="pod" />
          </>
        )}

        {activeTab === "logs" && (
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Activity Logs ({activityLogs.length})</h3>
            <div className="space-y-3">
              {activityLogs.map((log: any) => (
                <div key={log.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="font-semibold text-gray-800 capitalize">{log.action.replace(/_/g, " ")}</p>
                  <p className="text-sm text-gray-500">Entity: {log.entity_type} | ID: {log.entity_id}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(log.created_at).toLocaleString()}</p>
                </div>
              ))}
              {activityLogs.length === 0 && <p className="text-gray-500">No activity logs found.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, items, type }: { title: string, items: any[], type: "template" | "request" | "pod" }) {
  if (items.length === 0) return null;
  return (
    <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
      <h3 className="text-lg font-bold text-gray-800 mb-4">{title} ({items.length})</h3>
      <div className="grid md:grid-cols-2 gap-4">
        {items.map(item => (
          <div key={item.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                item.status === "active" || item.status === "matched" 
                  ? "bg-green-100 text-green-700" 
                  : "bg-gray-200 text-gray-700"
              }`}>
                {item.status}
              </span>
              <span className="text-xs text-gray-400">{new Date(item.created_at).toLocaleDateString()}</span>
            </div>
            
            {type === "template" && (
              <>
                <p className="font-semibold">{item.from_location} &rarr; {item.to_location}</p>
                <p className="text-sm text-gray-600 mt-1">Time: {item.departure_time} | Seats: {item.available_seats}</p>
              </>
            )}
            {type === "request" && (
              <>
                <p className="font-semibold">{item.pickup_location} &rarr; {item.destination_location}</p>
                <p className="text-sm text-gray-600 mt-1">Time: {item.preferred_arrival_time}</p>
              </>
            )}
            {type === "pod" && (
              <>
                <p className="font-semibold">Pod ID: {item.pod_id.slice(0,8)}...</p>
                <p className="text-sm text-gray-600 mt-1">
                  Route: {item.pods?.ride_template?.from_location} &rarr; {item.pods?.ride_template?.to_location}
                </p>
                {(item.left_at || item.rejected_at) && (
                  <p className="text-xs text-red-500 mt-1">
                    {item.left_at ? `Left: ${new Date(item.left_at).toLocaleDateString()}` : `Rejected: ${new Date(item.rejected_at).toLocaleDateString()}`}
                  </p>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
