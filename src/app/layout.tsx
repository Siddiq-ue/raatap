import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import Header from "@/components/header/page";
import Footer from "@/components/footer/page";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500"], // Regular for subheadings, Medium for headings
});

const siteUrl = "https://raatap.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Raatap - Community Ride Sharing | Share Rides, Save Costs",
    template: "%s | Raatap",
  },
  description:
    "Join Raatap, India's trusted community ride-sharing platform. Share rides with verified members, save on commuting costs, and build meaningful connections.",
  keywords: [
    "ride sharing",
    "carpool",
    "community rides",
    "commute sharing",
    "cost saving transport",
    "trusted carpooling",
    "college ride sharing",
    "institutional carpooling",
    "Hyderabad ride sharing",
    "India ride sharing",
  ],
  authors: [{ name: "Raatap", url: siteUrl }],
  creator: "Raatap",
  publisher: "Raatap",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: siteUrl,
    siteName: "Raatap",
    title: "Raatap - Community Ride Sharing | Share Rides, Save Costs",
    description:
      "Join India's trusted community ride-sharing platform. Share rides with verified members, save costs, and build connections.",
    images: [
      {
        url: "/landingpage_one.png",
        width: 1200,
        height: 630,
        alt: "Raatap - Community Ride Sharing Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Raatap - Community Ride Sharing",
    description:
      "Share rides with trusted community members. Save costs, build connections.",
    images: ["/landingpage_one.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  category: "Transportation",
};

// JSON-LD Structured Data
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Raatap",
  url: siteUrl,
  logo: `${siteUrl}/favicon.png`,
  description:
    "India's trusted community ride-sharing platform for verified institutional members.",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Hyderabad",
    addressRegion: "Telangana",
    addressCountry: "IN",
  },
  contactPoint: {
    "@type": "ContactPoint",
    email: "raatap1@gmail.com",
    contactType: "customer service",
  },
  sameAs: [],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Raatap",
  url: siteUrl,
  description:
    "Community ride-sharing platform connecting verified members for safe, affordable commuting.",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${siteUrl}/search?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteSchema),
          }}
        />
      </head>
      <body className={`${poppins.variable} antialiased min-h-screen flex flex-col`}>
        <Header />
        <div className="flex-1">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
