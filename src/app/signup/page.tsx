import type { Metadata } from "next";
import SignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign Up",
  description:
    "Create your Raatap account and join India's trusted community ride-sharing platform. Share rides with verified college and institutional members.",
  keywords: [
    "Raatap signup",
    "join ride sharing",
    "create carpool account",
    "college ride sharing registration",
    "community carpooling signup",
  ],
  openGraph: {
    title: "Join Raatap - Community Ride Sharing",
    description:
      "Create your account to share rides with trusted community members. Save costs and build connections.",
    url: "https://raatap.com/signup",
  },
  twitter: {
    card: "summary",
    title: "Join Raatap - Community Ride Sharing",
    description: "Create your account to start sharing rides with trusted members.",
  },
  alternates: {
    canonical: "https://raatap.com/signup",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function SignupPage() {
  return <SignupForm />;
}
