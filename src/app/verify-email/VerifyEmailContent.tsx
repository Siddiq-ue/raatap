"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default function VerifyEmailContent() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const checkUser = async () => {
      if (!isSupabaseConfigured()) {
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // No user, redirect to login
        router.push("/login");
        return;
      }

      if (user.email_confirmed_at) {
        // Email already verified, redirect to dashboard
        router.push("/dashboard");
        return;
      }

      setEmail(user.email || null);
      setLoading(false);
    };

    checkUser();

    // Listen for auth state changes (in case user verifies in another tab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "USER_UPDATED" && session?.user?.email_confirmed_at) {
        router.push("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleResendEmail = async () => {
    if (!email) return;
    
    setResending(true);
    setError("");
    setResendSuccess(false);

    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to resend verification link");
      } else {
        setResendSuccess(true);
      }
    } catch (err) {
      console.error("Error resending email:", err);
      setError("Failed to resend verification email");
    } finally {
      setResending(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#f0f2ff] via-[#f8f9fc] to-[#e8ebff] flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#6675FF]/20"></div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f0f2ff] via-[#f8f9fc] to-[#e8ebff] flex items-center justify-center px-4 py-8">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#6675FF]/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#6675FF]/10 rounded-full blur-3xl"></div>
      </div>
      
      <div className="relative w-full max-w-lg">
        {/* Card Container */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-[#6675FF]/10 p-8 md:p-10 border border-white/50 text-center">
          
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute -inset-3 bg-gradient-to-r from-[#6675FF]/20 to-[#8892ff]/20 rounded-full blur-xl"></div>
              <Image
                src="/favicon.png"
                alt="Raatap Logo"
                width={56}
                height={56}
                className="relative w-14 h-14 object-contain"
              />
            </div>
          </div>

          {/* Email Icon */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h1 className="text-2xl md:text-3xl font-medium text-[#171717] mb-3">
            Verify Your Email
          </h1>
          
          <p className="text-gray-500 mb-6">
            We&apos;ve sent a verification link to{" "}
            <strong className="text-[#171717]">{email}</strong>.
            <br />
            Click the link to verify your email, then you&apos;ll set your password to complete signup.
          </p>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {resendSuccess && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm text-green-600">
                ✓ Verification email sent! Check your inbox.
              </p>
            </div>
          )}

          {/* Tips */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6 text-left">
            <p className="text-sm text-amber-700 font-medium mb-2">💡 Tips:</p>
            <ul className="text-xs text-amber-600 space-y-1">
              <li>• Check your spam/junk folder</li>
              <li>• Make sure you entered the correct email</li>
              <li>• The link expires in 24 hours</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleResendEmail}
              disabled={resending}
              className="w-full py-3.5 bg-gradient-to-r from-[#6675FF] to-[#8892ff] text-white font-medium rounded-2xl transition-all duration-300 hover:shadow-xl hover:shadow-[#6675FF]/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending...
                </span>
              ) : (
                "Resend Verification Email"
              )}
            </button>

            <button
              onClick={handleSignOut}
              className="w-full py-3.5 border-2 border-gray-200 text-gray-600 font-medium rounded-2xl transition-all duration-300 hover:border-[#6675FF]/50 hover:text-[#6675FF]"
            >
              Sign Out & Try Different Email
            </button>
          </div>

          {/* Help Link */}
          <p className="text-center text-sm text-gray-500 mt-6">
            Need help?{" "}
            <Link href="mailto:support@raatap.com" className="text-[#6675FF] font-medium hover:underline">
              Contact Support
            </Link>
          </p>
        </div>
        
        {/* Bottom Security Badge */}
        <div className="flex justify-center mt-6">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Email verification protects your account</span>
          </div>
        </div>
      </div>
    </main>
  );
}
