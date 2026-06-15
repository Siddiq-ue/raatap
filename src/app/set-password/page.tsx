import type { Metadata } from "next";
import SetPasswordContent from "./SetPasswordContent";

export const metadata: Metadata = {
  title: "Set Your Password - Raatap",
  description: "Create a password for your verified Raatap account.",
};

export default function SetPasswordPage() {
  return <SetPasswordContent />;
}
