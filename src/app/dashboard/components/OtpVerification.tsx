"use client";

import { useEffect } from "react";

interface OtpVerificationProps {
  institutionalEmail: string;
  setInstitutionalEmail: (email: string) => void;
  otpCode: string;
  setOtpCode: (code: string) => void;
  handleSendOTP: () => void;
  handleVerifyOTP: () => void;
  otpError: string;
  resendTimer: number;
  handleResendOTP: () => void;
  handleBack: () => void;
  handleRequestManualVerification: () => void;
  handleSendOTPProp: () => void;
  setOtpError: (error: string) => void;
  otpLoading: boolean;
}

export default function OtpVerification({
  institutionalEmail,
  setInstitutionalEmail,
  otpCode,
  setOtpCode,
  handleVerifyOTP,
  otpLoading,
  otpError,
  setOtpError,
  resendTimer,
  handleResendOTP,
  handleBack,
  handleRequestManualVerification,
  handleSendOTPProp,
}: OtpVerificationProps) {
  const handleSendOTP = async () => {
    // Validate institutional email
    if (!institutionalEmail) {
      setOtpError("Institutional email is required");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(institutionalEmail)) {
      setOtpError("Please enter a valid email address");
      return;
    }

    // Educational domain validation (from educational_mails.txt)
    const allowedDomains = [
      "vjit.ac.in",
      "cbit.org.in",
      "chaitanya.edu.in",
      "vce.ac.in",
      "lords.ac.in",
      "mgit.ac.in",
      "cvr.ac.in"
    ];
    const emailDomain = institutionalEmail.split("@")[1]?.toLowerCase();
    
    if (!emailDomain || !allowedDomains.includes(emailDomain)) {
      setOtpError("Unsupported college email. Please click 'I don't have an edu mail' below for manual verification.");
      return;
    }

    // ... [existing OTP send logic remains same below this point, but handled by the parent component]
    handleSendOTPProp();
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-gray-800">
          Verify Student Status
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Enter your institutional email to get a verification code
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
          Institutional Email
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            value={institutionalEmail}
            onChange={(e) => setInstitutionalEmail(e.target.value)}
            className="flex-1 px-4 py-3.5 border-2 border-gray-200 rounded-2xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#6675FF] focus:ring-4 focus:ring-[#6675FF]/10 transition-all"
            placeholder="your.name@college.edu"
          />
          <button
            onClick={handleSendOTP}
            disabled={otpLoading || resendTimer > 0}
            className="px-6 py-3.5 bg-[#6675FF] text-white font-semibold rounded-2xl hover:bg-[#5b6ae0] disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
          >
            {otpLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : resendTimer > 0 ? (
              `Resend (${resendTimer}s)`
            ) : (
              "Send OTP"
            )}
          </button>
        </div>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">
            Enter 6-digit Code
          </span>
        </div>
      </div>

      <div>
        <input
          type="text"
          value={otpCode}
          onChange={(e) =>
            setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          className="w-full text-center text-3xl tracking-[1em] font-bold px-4 py-4 border-2 border-gray-200 rounded-2xl bg-gray-50 text-gray-800 focus:outline-none focus:border-[#6675FF] focus:bg-white focus:ring-4 focus:ring-[#6675FF]/10 transition-all"
          placeholder="000000"
        />
      </div>

      {otpError && (
        <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl text-center border border-red-100">
          {otpError}
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button
          onClick={handleBack}
          className="flex-1 py-4 bg-gray-100 text-gray-700 font-semibold text-lg rounded-2xl hover:bg-gray-200 transition-all hover:-translate-y-0.5"
        >
          Back
        </button>
        <button
          onClick={handleVerifyOTP}
          disabled={otpLoading || otpCode.length !== 6}
          className="flex-1 py-4 bg-gradient-to-r from-[#6675FF] to-[#8892ff] text-white font-semibold text-lg rounded-2xl hover:shadow-xl hover:shadow-[#6675FF]/30 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          {otpLoading ? "Verifying..." : "Verify & Submit"}
        </button>
      </div>

      <div className="text-center pt-2">
        <button
          onClick={handleRequestManualVerification}
          className="text-sm font-medium text-[#6675FF] hover:text-[#5b6ae0] underline decoration-dotted transition-colors"
        >
          I don't have an edu mail (Request Manual Verification)
        </button>
      </div>
    </div>
  );
}
