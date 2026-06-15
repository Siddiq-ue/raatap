import type { Metadata } from "next";
import DashboardContent from "./DashboardContent";

export const metadata: Metadata = {
  title: "Dashboard - Raatap",
  description: "Complete your profile to join the Raatap waitlist for community ride sharing.",
};

export default function DashboardPage() {
  return <DashboardContent />;
}
