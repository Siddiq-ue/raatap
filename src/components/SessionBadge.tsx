"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

interface SessionBadgeProps {
  showDetails?: boolean;
  className?: string;
}

export default function SessionBadge({ showDetails = false, className = "" }: SessionBadgeProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenExpiry, setTokenExpiry] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      
      if (session?.expires_at) {
        const expiryDate = new Date(session.expires_at * 1000);
        setTokenExpiry(expiryDate.toLocaleString());
      }
      
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.expires_at) {
        const expiryDate = new Date(session.expires_at * 1000);
        setTokenExpiry(expiryDate.toLocaleString());
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 ${className}`}>
        <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
        <span className="text-xs text-gray-500">Checking session...</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 ${className}`}>
        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
        <span className="text-xs text-gray-500">Not authenticated</span>
      </div>
    );
  }

  // Calculate time until token expires
  const getTimeUntilExpiry = () => {
    if (!session.expires_at) return null;
    const now = Date.now();
    const expiry = session.expires_at * 1000;
    const diff = expiry - now;
    
    if (diff <= 0) return "Expired";
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const timeUntilExpiry = getTimeUntilExpiry();

  return (
    <div className={`${className}`}>
      {/* Compact Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
        <span className="text-xs text-green-700 font-medium">JWT Active</span>
        {timeUntilExpiry && (
          <span className="text-xs text-green-600">• {timeUntilExpiry}</span>
        )}
      </div>

      {/* Detailed View */}
      {showDetails && (
        <div className="mt-3 p-4 bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#6675FF] to-[#8892ff] flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-[#171717]">Session Active</p>
              <p className="text-xs text-gray-500">{session.user?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2 bg-gray-50 rounded-lg">
              <p className="text-gray-500 mb-1">Token Type</p>
              <p className="font-medium text-[#171717]">JWT Bearer</p>
            </div>
            <div className="p-2 bg-gray-50 rounded-lg">
              <p className="text-gray-500 mb-1">Provider</p>
              <p className="font-medium text-[#171717] capitalize">
                {session.user?.app_metadata?.provider || "Email"}
              </p>
            </div>
            <div className="p-2 bg-gray-50 rounded-lg">
              <p className="text-gray-500 mb-1">Expires</p>
              <p className="font-medium text-[#171717]">{timeUntilExpiry}</p>
            </div>
            <div className="p-2 bg-gray-50 rounded-lg">
              <p className="text-gray-500 mb-1">Token ID</p>
              <p className="font-medium text-[#171717] truncate" title={session.access_token}>
                ...{session.access_token.slice(-8)}
              </p>
            </div>
          </div>

          {/* Token Preview */}
          <div className="p-3 bg-gray-900 rounded-lg overflow-hidden">
            <p className="text-xs text-gray-400 mb-1">Access Token (preview)</p>
            <p className="text-xs text-green-400 font-mono break-all">
              {session.access_token.substring(0, 50)}...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
