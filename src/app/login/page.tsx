import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Log In - Raatap",
  description:
    "Sign in to your Raatap account. Access your dashboard and connect with trusted ride-sharing community members.",
  keywords: [
    "Raatap login",
    "ride sharing sign in",
    "carpool login",
    "community carpooling access",
  ],
  openGraph: {
    title: "Log In - Raatap",
    description:
      "Sign in to access your Raatap dashboard and connect with ride-sharing community.",
    url: "https://raatap.com/login",
  },
  twitter: {
    card: "summary",
    title: "Log In - Raatap",
    description: "Sign in to your Raatap account.",
  },
  alternates: {
    canonical: "https://raatap.com/login",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function LoginPage() {
  return <LoginForm />;
}
