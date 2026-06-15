"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default function ForgotPasswordContent() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!isSupabaseConfigured()) {
      setError("⚠️ Supabase is not configured yet!");
      setLoading(false);
      return;
    }

    try {
      // Call custom API to bypass Supabase native rate limiting
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to send reset link");
        return;
      }

      setSuccess(true);
      setEmail("");
    } catch (err) {
      console.error("Error sending reset email:", err);
      setError("Failed to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#f0f2ff] via-[#f8f9fc] to-[#e8ebff] flex items-center justify-center px-4 py-8">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#6675FF]/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#6675FF]/10 rounded-full blur-3xl"></div>
        </div>

        <div className="relative w-full max-w-lg">
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-[#6675FF]/10 p-8 md:p-10 border border-white/50 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 flex items-center justify-center">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl md:text-3xl font-medium text-[#171717] mb-3">
              Check Your Email
            </h1>
            <p className="text-gray-500 mb-6">
              We&apos;ve sent a password reset link to <strong className="text-[#171717]">{email}</strong>
            </p>
            <p className="text-sm text-gray-400 mb-8">
              Didn&apos;t receive the email? Check your spam folder or try again.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setSuccess(false)}
                className="w-full py-4 bg-gradient-to-r from-[#6675FF] to-[#8892ff] text-white font-medium rounded-2xl transition-all hover:shadow-lg hover:-translate-y-0.5"
              >
                Try Another Email
              </button>
              <button
                onClick={() => router.push("/login")}
                className="w-full py-4 bg-white border-2 border-gray-200 text-[#171717] font-medium rounded-2xl transition-all hover:border-[#6675FF]/50 hover:shadow-lg"
              >
                Back to Login
              </button>
            </div>
          </div>
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
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-[#6675FF]/10 p-8 md:p-10 border border-white/50">

          {/* Logo & Brand */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div className="absolute -inset-3 bg-gradient-to-r from-[#6675FF]/20 to-[#8892ff]/20 rounded-full blur-xl"></div>
              <Image
                src="/favicon.png"
                alt="Raatap Logo"
                width={56}
                height={56}
                className="relative w-14 h-14 object-contain"
              />
            </div>
            <h1 className="text-2xl md:text-3xl font-medium text-[#171717]">
              Forgot Password?
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              No worries! Enter your email and we&apos;ll send you reset instructions.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-600 text-center">{error}</p>
            </div>
          )}

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Email Address
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 border-2 border-gray-200 rounded-2xl bg-white/50 text-[#171717] placeholder-gray-400 focus:outline-none focus:border-[#6675FF] focus:bg-white transition-all duration-300"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !email}
              className="group relative w-full py-4 bg-gradient-to-r from-[#6675FF] to-[#8892ff] text-white font-medium rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-[#6675FF]/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent"></span>
              <span className="relative flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Send Reset Link
                  </>
                )}
              </span>
            </button>
          </form>

          {/* Back to Login */}
          <div className="mt-6 text-center">
            <button
              onClick={() => router.push("/login")}
              className="text-sm text-gray-600 hover:text-[#6675FF] transition-colors"
            >
              ← Back to Login
            </button>
          </div>
        </div>

        {/* Bottom Security Badge */}
        <div className="flex justify-center mt-6">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Secured with Supabase</span>
          </div>
        </div>
      </div>
    </main>
  );
}
