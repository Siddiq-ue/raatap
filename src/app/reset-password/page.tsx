import type { Metadata } from "next";
import ResetPasswordContent from "./ResetPasswordContent";

export const metadata: Metadata = {
  title: "Reset Password - Raatap",
  description: "Create a new password for your Raatap account.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordContent />;
}
