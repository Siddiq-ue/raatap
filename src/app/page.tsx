import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import AuthRedirect from "@/components/AuthRedirect";

export const metadata: Metadata = {
  title: "Raatap - Community Ride Sharing | Share Rides, Save Costs",
  description:
    "Join Raatap to share rides with trusted community members. Make your daily commute easier, cheaper, and more enjoyable with India's trusted ride-sharing platform.",
  keywords: [
    "ride sharing India",
    "community carpooling",
    "trusted ride sharing",
    "college commute",
    "affordable transportation",
    "Hyderabad carpooling",
  ],
  openGraph: {
    title: "Raatap - Let's Go Together, Share Memories",
    description:
      "Share rides with trusted community members and make your daily commute easier, cheaper.",
    url: "https://raatap.com",
    images: [
      {
        url: "/landingpage.png",
        width: 1200,
        height: 630,
        alt: "Raatap - People sharing rides together",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Raatap - Let's Go Together, Share Memories",
    description:
      "Share rides with trusted community members. Save costs, build connections.",
  },
  alternates: {
    canonical: "https://raatap.com",
  },
};

// JSON-LD for homepage
const homePageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Raatap - Community Ride Sharing",
  description:
    "Join Raatap to share rides with trusted community members. Make your daily commute easier and cheaper.",
  url: "https://raatap.com",
  mainEntity: {
    "@type": "Service",
    name: "Raatap Ride Sharing",
    description:
      "Community-based ride coordination platform for verified institutional members.",
    provider: {
      "@type": "Organization",
      name: "Raatap",
    },
    areaServed: {
      "@type": "Country",
      name: "India",
    },
    serviceType: "Ride Sharing",
  },
};

export default function Home() {
  return (
    <>
      <AuthRedirect />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(homePageSchema),
        }}
      />
      <main className="min-h-screen bg-white">
        {/* Hero Section */}
        <section className="w-full px-4 sm:px-6 md:px-12 lg:px-20 py-12 sm:py-16 md:py-20 lg:py-24">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
            {/* Left Content */}
            <div className="flex-1 max-w-xl text-center lg:text-left">
              {/* Main Heading */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight tracking-tight text-[#1a1a1a]">
                Commute with
              </h1>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight tracking-tight text-[#6675FF] mt-1 sm:mt-2">
                Community
              </h2>

              {/* Tags */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 sm:gap-3 mt-5 sm:mt-6">
                <span className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-[#6675FF]/5 border border-[#6675FF]/20 rounded-full text-xs sm:text-sm font-medium text-[#6675FF]">
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#6675FF]"></span>
                  Closed Community
                </span>
                <span className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-[#6675FF]/5 border border-[#6675FF]/20 rounded-full text-xs sm:text-sm font-medium text-[#6675FF]">
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#6675FF]"></span>
                  Daily Commute
                </span>
              </div>

              {/* Description */}
              <p className="mt-6 sm:mt-8 text-base sm:text-lg text-gray-600 leading-relaxed max-w-lg mx-auto lg:mx-0">
                Raatap helps verified members coordinate daily rides with people
                from their community
              </p>

              {/* CTA Button */}
              <div className="flex items-center justify-center lg:justify-start gap-4 mt-8 sm:mt-10">
                <Link
                  href="/signup"
                  className="group relative px-6 sm:px-8 py-3 sm:py-3.5 rounded-full font-semibold text-base sm:text-lg transition-all duration-300 bg-[#6675FF] text-white hover:bg-[#5563e8] hover:shadow-lg hover:shadow-[#6675FF]/30 active:scale-[0.98]"
                >
                  <span className="relative">Become Member</span>
                </Link>
              </div>
            </div>

            {/* Right Content - Illustration */}
            <div className="flex-1 flex justify-center lg:justify-end w-full max-w-4xl lg:max-w-none">
              <div className="relative w-full max-w-lg sm:max-w-2xl lg:max-w-4xl">
                <Image
                  src="/landingpage.png"
                  alt="People sharing rides together - Raatap community ride sharing"
                  width={600}
                  height={500}
                  className="w-full h-auto object-contain"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        {/* How We Work Section */}
        <section className="w-full px-4 sm:px-6 md:px-12 lg:px-20 py-12 sm:py-16 md:py-20 bg-gradient-to-b from-gray-50/80 to-white">
          <div className="max-w-7xl mx-auto">
            {/* Section Title */}
            <div className="text-center mb-10 sm:mb-12 md:mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#1a1a1a]">
                How We Work
              </h2>
              <p className="mt-3 sm:mt-4 text-gray-500 text-sm sm:text-base max-w-md mx-auto">
                Get started in three simple steps
              </p>
            </div>

            {/* Three Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 lg:gap-8">
              {/* Card 1: Verify Yourself */}
              <div className="group flex flex-col items-center p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-white border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-[#6675FF]/10 hover:border-[#6675FF]/30 transition-all duration-300">
                {/* Image */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 mb-5 sm:mb-6 group-hover:scale-105 transition-transform duration-300">
                  <Image
                    src="/verify.png"
                    alt="Verify Yourself"
                    width={96}
                    height={96}
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Content */}
                <h3 className="text-xl sm:text-2xl font-semibold text-[#1a1a1a] mb-2 sm:mb-3 text-center">
                  Verify Yourself
                </h3>
                <p className="text-gray-500 text-sm sm:text-base text-center leading-relaxed">
                  Verify your account using your email address. Access will be
                  activated after admin verification.
                </p>
              </div>

              {/* Card 2: Set Your Commute */}
              <div className="group flex flex-col items-center p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-white border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-[#6675FF]/10 hover:border-[#6675FF]/30 transition-all duration-300">
                {/* Image */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 mb-5 sm:mb-6 group-hover:scale-105 transition-transform duration-300">
                  <Image
                    src="/set_commute.png"
                    alt="Set Your Commute"
                    width={96}
                    height={96}
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Content */}
                <h3 className="text-xl sm:text-2xl font-semibold text-[#1a1a1a] mb-2 sm:mb-3 text-center">
                  Set Your Commute
                </h3>
                <p className="text-gray-500 text-sm sm:text-base text-center leading-relaxed">
                  Share your regular commute information. It helps optimize
                  planning and improve efficiency.
                </p>
              </div>

              {/* Card 3: Form Your Pod */}
              <div className="group flex flex-col items-center p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-white border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-[#6675FF]/10 hover:border-[#6675FF]/30 transition-all duration-300 sm:col-span-2 md:col-span-1 sm:max-w-md sm:mx-auto md:max-w-none">
                {/* Image */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 mb-5 sm:mb-6 group-hover:scale-105 transition-transform duration-300">
                  <Image
                    src="/form_pod.png"
                    alt="Form Your Pod"
                    width={96}
                    height={96}
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Content */}
                <h3 className="text-xl sm:text-2xl font-semibold text-[#1a1a1a] mb-2 sm:mb-3 text-center">
                  Form Your Pod
                </h3>
                <p className="text-gray-500 text-sm sm:text-base text-center leading-relaxed">
                  Join a pod to connect with a focused group, enable better
                  collaboration and smoother planning.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
