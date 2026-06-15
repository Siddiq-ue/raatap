import type { Metadata } from "next";
import ForgotPasswordContent from "./ForgotPasswordContent";

export const metadata: Metadata = {
  title: "Forgot Password - Raatap",
  description: "Reset your Raatap account password. Enter your email to receive a password reset link.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordContent />;
}
