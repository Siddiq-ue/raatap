import type { Metadata } from "next";
import VerifyEmailContent from "./VerifyEmailContent";

export const metadata: Metadata = {
  title: "Verify Your Email - Raatap",
  description: "Please verify your email address to access your Raatap account.",
};

export default function VerifyEmailPage() {
  return <VerifyEmailContent />;
}
