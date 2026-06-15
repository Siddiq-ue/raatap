"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export default function Header() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<"host" | "rider" | "both" | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check auth state and user role
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const checkUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user || null);

      // Fetch user role from profiles
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("prefer_hosting, prefer_taking_ride")
          .eq("id", session.user.id)
          .single();

        if (profile) {
          if (profile.prefer_hosting && profile.prefer_taking_ride) {
            setUserRole("both");
          } else if (profile.prefer_hosting) {
            setUserRole("host");
          } else if (profile.prefer_taking_ride) {
            setUserRole("rider");
          }
        }
      }
    };

    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setDropdownOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setDropdownOpen(false);
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-50 w-full px-4 sm:px-6 md:px-12 py-3 sm:py-4 bg-white/90 backdrop-blur-xl border-b border-gray-100 shadow-sm">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Logo and Brand Name */}
        <Link href="/" className="flex items-center gap-1 no-underline group">
          <div className="relative">
            <Image
              src="/favicon.png"
              alt="Raatap Logo"
              width={40}
              height={40}
              className="w-9 h-9 sm:w-10 sm:h-10 object-contain"
            />
          </div>
          <span className="text-xl sm:text-2xl font-semibold tracking-tight text-[#1a1a1a]">
            Raatap
          </span>
        </Link>

        {/* Right Side - Profile */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="relative flex items-center gap-2 p-1.5 rounded-full hover:bg-gray-50 transition-colors"
            aria-label="Open menu"
          >
            {/* User avatar/icon */}
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden">
              {user?.user_metadata?.avatar_url ? (
                <Image
                  src={user.user_metadata.avatar_url}
                  alt="Profile"
                  width={40}
                  height={40}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-gradient-to-br from-[#6675FF] to-[#8892ff] flex items-center justify-center text-white font-medium text-sm sm:text-base">
                  {user?.email?.charAt(0).toUpperCase() || "?"}
                </div>
              )}
            </div>

            {/* Verification Badge */}
            {user && (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                <svg
                  className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )}

            {/* Role Badge */}
            {userRole && (
              <div className="absolute -top-0.5 -right-0.5 px-1.5 py-0.5 rounded-full bg-[#6675FF] text-white text-[9px] font-semibold shadow-sm">
                {userRole === "host" ? "H" : userRole === "rider" ? "R" : "B"}
              </div>
            )}
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <>
              {/* Backdrop for mobile */}
              <div
                className="fixed inset-0 bg-black/20 sm:hidden z-40"
                onClick={() => setDropdownOpen(false)}
              />

              {/* Dropdown */}
              <div className="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-16 sm:top-full sm:mt-2 sm:w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-slideIn">
                {/* User Info Header */}
                <div className="p-4 bg-gradient-to-br from-[#6675FF]/5 to-transparent border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      {user?.user_metadata?.avatar_url ? (
                        <Image
                          src={user.user_metadata.avatar_url}
                          alt="Profile"
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6675FF] to-[#8892ff] flex items-center justify-center text-white font-semibold text-lg">
                          {user?.email?.charAt(0).toUpperCase() || "?"}
                        </div>
                      )}
                      {user && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {user ? (
                        <>
                          <p className="font-semibold text-gray-900 truncate">
                            {user.user_metadata?.full_name || "User"}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            {user.email}
                          </p>
                          {userRole && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                userRole === "host" 
                                  ? "bg-blue-100 text-blue-700" 
                                  : userRole === "rider"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-purple-100 text-purple-700"
                              }`}>
                                {userRole === "host" && (
                                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                                  </svg>
                                )}
                                {userRole === "rider" && (
                                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                                  </svg>
                                )}
                                {userRole === "both" && (
                                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                                  </svg>
                                )}
                                {userRole === "host" ? "Host" : userRole === "rider" ? "Rider" : "Both"}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="font-semibold text-gray-900">Guest</p>
                          <p className="text-sm text-gray-500">Not signed in</p>
                        </>
                      )}
                    </div>
                  </div>
                  {user && (
                    <div className="flex items-center gap-1.5 mt-3 px-2.5 py-1 bg-green-50 rounded-full w-fit">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-green-700 font-medium">
                        Verified
                      </span>
                    </div>
                  )}
                  {!user && (
                    <div className="flex items-center gap-1.5 mt-3 px-2.5 py-1 bg-amber-50 rounded-full w-fit">
                      <span className="text-xs text-amber-700 font-medium">
                        Sign in to verify
                      </span>
                    </div>
                  )}
                </div>

                {/* Menu Items */}
                <div className="p-2">
                  {user ? (
                    <>
                      <Link
                        href="/dashboard"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                      >
                        <div className="w-9 h-9 rounded-lg bg-[#6675FF]/10 flex items-center justify-center">
                          <svg
                            className="w-5 h-5 text-[#6675FF]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                            />
                          </svg>
                        </div>
                        <span className="font-medium">Dashboard</span>
                      </Link>

                      <div className="my-2 border-t border-gray-100"></div>

                      <button
                        onClick={handleSignOut}
                        className="flex items-center gap-3 w-full px-3 py-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                      >
                        <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                          <svg
                            className="w-5 h-5 text-red-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            />
                          </svg>
                        </div>
                        <span className="font-medium">Sign out</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/signup"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 bg-[#6675FF] text-white hover:bg-[#5563e8] rounded-xl transition-colors"
                      >
                        <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                          <svg
                            className="w-5 h-5 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                            />
                          </svg>
                        </div>
                        <span className="font-medium">Sign Up</span>
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideIn {
          animation: slideIn 0.15s ease-out;
        }
      `}</style>
    </header>
  );
}
