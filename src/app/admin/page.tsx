"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  totalUsers: number;
  verifiedUsers: number;
  pendingUsers: number;
  rejectedUsers: number;
  activePods: number;
  pendingMatches: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [usersRes, podsRes, matchesRes] = await Promise.all([
          fetch("/api/admin/waitlist"),
          fetch("/api/admin/pods"),
          fetch("/api/admin/match-suggestions?status=pending_host_approval&limit=1"),
        ]);

        const usersData = await usersRes.json();
        const podsData = await podsRes.json();
        const matchesData = await matchesRes.json();

        const entries = usersData.entries || [];
        setStats({
          totalUsers: entries.length,
          verifiedUsers: entries.filter((u: any) => u.email_verified === true).length,
          pendingUsers: entries.filter((u: any) => u.email_verified !== true && u.institutional_email !== "REJECTED").length,
          rejectedUsers: entries.filter((u: any) => u.institutional_email === "REJECTED").length,
          activePods: podsData.pods?.length || 0,
          pendingMatches: matchesData.total || 0,
        });
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
          <p className="text-gray-500 mt-1">Overview of your ride-sharing platform</p>
        </div>

        {/* Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-8">
            <StatCard
              label="Total Users"
              value={stats.totalUsers}
              color="bg-blue-500"
              icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
            <StatCard
              label="Verified Users"
              value={stats.verifiedUsers}
              color="bg-green-500"
              icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
            <StatCard
              label="Pending Review"
              value={stats.pendingUsers}
              color="bg-amber-500"
              icon="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
            <StatCard
              label="Rejected"
              value={stats.rejectedUsers}
              color="bg-red-500"
              icon="M6 18L18 6M6 6l12 12"
            />
            <StatCard
              label="Active Pods"
              value={stats.activePods}
              color="bg-purple-500"
              icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <StatCard
              label="Pending Matches"
              value={stats.pendingMatches}
              color="bg-rose-500"
              icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center mb-8">
            <p className="text-gray-500">Unable to load statistics</p>
          </div>
        )}

        {/* Navigation Cards */}
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Access</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          <NavCard
            href="/admin/users"
            title="Manage Users"
            description="Review, approve, or reject user verification requests"
            icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            color="text-blue-600"
            bgColor="bg-blue-50"
          />
          <NavCard
            href="/admin/pods"
            title="View Pods"
            description="Browse active ride-sharing pods and their members"
            icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            color="text-purple-600"
            bgColor="bg-purple-50"
          />
          <NavCard
            href="/admin/match-suggestions"
            title="Match Suggestions"
            description="Review and monitor ride match suggestions"
            icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            color="text-rose-600"
            bgColor="bg-rose-50"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <div className={`w-10 h-10 ${color} bg-opacity-10 rounded-xl flex items-center justify-center`}>
          <svg className={`w-5 h-5 ${color.replace("bg-", "text-")}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
          </svg>
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-800">{value.toLocaleString()}</p>
    </div>
  );
}

function NavCard({ href, title, description, icon, color, bgColor }: { href: string; title: string; description: string; icon: string; color: string; bgColor: string }) {
  return (
    <Link href={href} className="block group">
      <div className="bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:border-[#6675FF]/20 transition-all">
        <div className={`w-12 h-12 ${bgColor} rounded-xl flex items-center justify-center mb-4`}>
          <svg className={`w-6 h-6 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-800 group-hover:text-[#6675FF] transition-colors">{title}</h3>
        <p className="text-sm text-gray-500 mt-2">{description}</p>
      </div>
    </Link>
  );
}
