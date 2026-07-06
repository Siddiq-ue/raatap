"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface UnverifiedUser {
  id: string;
  full_name: string;
  institutional_email: string;
  phone_number: string;
  created_at: string;
}

export default function CampusLeaderDashboard() {
  const [users, setUsers] = useState<UnverifiedUser[]>([]);
  const [institution, setInstitution] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/campus-leader/users", {
        headers: {
          "Authorization": session ? `Bearer ${session.access_token}` : ""
        }
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch users");
      }
      
      setUsers(data.users);
      setInstitution(data.institution);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (userId: string, name: string) => {
    if (!confirm(`Are you sure you want to verify ${name}?`)) return;
    
    setVerifyingId(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch("/api/campus-leader/verify", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": session ? `Bearer ${session.access_token}` : ""
        },
        body: JSON.stringify({ userIdToVerify: userId }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to verify user");
      }
      
      // Remove verified user from list
      setUsers(users.filter(u => u.id !== userId));
      alert(`Successfully verified ${name}!`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setVerifyingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-[#6675FF] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 md:p-12">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-red-100 p-8 text-center">
          <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button onClick={() => window.location.href = "/"} className="px-6 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors">
            Return Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 bg-gradient-to-r from-[#6675FF] to-[#8892ff] rounded-3xl p-8 text-white shadow-lg">
          <h1 className="text-3xl font-bold mb-2">Campus Leader Dashboard</h1>
          <p className="text-white/80 text-lg">Managing verifications for <span className="font-semibold text-white">{institution}</span></p>
        </div>
        
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h2 className="text-xl font-bold text-gray-800">Pending Verifications</h2>
            <div className="bg-[#6675FF]/10 text-[#6675FF] font-semibold px-4 py-1.5 rounded-full text-sm">
              {users.length} Users waiting
            </div>
          </div>
          
          {users.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">All caught up!</h3>
              <p className="text-gray-500 max-w-sm mx-auto">There are no pending verifications for your institution at the moment.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-sm font-semibold text-gray-500">
                    <th className="p-4 pl-6">Name</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Phone</th>
                    <th className="p-4">Joined</th>
                    <th className="p-4 pr-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="font-semibold text-gray-800">{user.full_name}</div>
                      </td>
                      <td className="p-4 text-gray-600">{user.institutional_email}</td>
                      <td className="p-4 text-gray-600">{user.phone_number || "N/A"}</td>
                      <td className="p-4 text-gray-500 text-sm">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <button
                          onClick={() => handleVerify(user.id, user.full_name)}
                          disabled={verifyingId === user.id}
                          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                            verifyingId === user.id
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-green-100 text-green-700 hover:bg-green-200"
                          }`}
                        >
                          {verifyingId === user.id ? "Verifying..." : "Verify"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
