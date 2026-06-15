import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Raatap Privacy Policy - Learn how we collect, use, and protect your personal data. We respect your privacy and are committed to safeguarding your information.",
  keywords: [
    "Raatap privacy policy",
    "ride sharing privacy",
    "data protection India",
    "DPDP Act compliance",
    "user data privacy",
  ],
  openGraph: {
    title: "Privacy Policy - Raatap",
    description:
      "Learn how Raatap collects, uses, and protects your personal data.",
    url: "https://raatap.com/privacy_policy",
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy - Raatap",
    description: "Learn how Raatap protects your personal data.",
  },
  alternates: {
    canonical: "https://raatap.com/privacy_policy",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-[#fcfcfd]">
      <section className="w-full px-6 md:px-12 lg:px-20 py-16 md:py-24">
        <div className="max-w-4xl mx-auto">

          {/* Page Header */}
          <div className="mb-16">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-[1px] w-8 bg-[#6675FF]"></div>
              <span className="text-[#6675FF] font-medium tracking-wider text-sm uppercase">Privacy Protection</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-semibold text-[#1a1a1a] mb-6 tracking-tight">
              Privacy Policy
            </h1>
            <p className="text-gray-500 text-sm">Last Updated: March 2026</p>
          </div>

          <div className="space-y-12">
            {/* Introduction */}
            <div className="prose prose-slate max-w-none">
              <p className="text-lg text-gray-700 leading-relaxed font-medium italic">
                Raatap (&ldquo;Raatap&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, store, share, and safeguard your information when you access or use the Raatap platform (website, mobile application, or related services).
              </p>
              <p className="text-gray-600 leading-relaxed mt-4">
                By using Raatap, you consent to the practices described in this Privacy Policy.
              </p>
            </div>

            <div className="grid gap-12 border-t border-gray-100 pt-12 text-gray-600">
              {/* 1. About Raatap */}
              <section id="about">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">1. ABOUT RAATAP</h2>
                <p className="leading-relaxed">
                  Raatap is a closed-community ride coordination platform operating in India. We act solely as a technology platform to enable coordination among verified users and do not provide transportation services.
                </p>
              </section>

              {/* 2. Information We Collect */}
              <section id="collection">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-6">2. INFORMATION WE COLLECT</h2>

                <div className="space-y-8">
                  <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100">
                    <h3 className="text-lg font-bold text-[#1a1a1a] mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#6675FF]"></span>
                      Personal Information
                    </h3>
                    <p className="text-sm text-gray-600 mb-3">When you register or use Raatap, we may collect:</p>
                    <ul className="grid md:grid-cols-2 gap-2 list-none text-sm">
                      <li className="flex gap-2"><span>•</span> Full name</li>
                      <li className="flex gap-2"><span>•</span> Phone number</li>
                      <li className="flex gap-2"><span>•</span> Email address</li>
                      <li className="flex gap-2"><span>•</span> Profile photograph</li>
                      <li className="flex gap-2"><span>•</span> Date of birth</li>
                      <li className="flex gap-2"><span>•</span> Institutional ID & verification details</li>
                    </ul>
                    <p className="text-sm text-gray-600 mt-3">This information is collected to verify users as bona fide members of an institute or organization and to maintain platform integrity.</p>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-[#1a1a1a] mb-3">Vehicle Information (Hosts Only)</h3>
                    <p className="mb-3">If you register as a Host, we may collect:</p>
                    <ul className="space-y-1 list-disc pl-5 marker:text-[#6675FF] text-sm md:columns-2">
                      <li>Driving license details</li>
                      <li>Vehicle details and photographs</li>
                      <li>Insurance and compliance information</li>
                    </ul>
                  </div>

                  <div className="p-6 rounded-2xl bg-[#6675FF]/5 border border-[#6675FF]/10">
                    <h3 className="text-lg font-bold text-[#4d5ce6] mb-2">Location Information</h3>
                    <p className="text-sm text-[#6675FF] leading-relaxed mb-3">
                      We collect pickup and drop location details related to rides and ride history linked to locations.
                    </p>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#6675FF]">
                      We do not collect real-time live location tracking and do not collect background location data.
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-bold text-[#1a1a1a] mb-2">Usage Information</h4>
                      <ul className="space-y-1 text-sm">
                        <li>• Ride and pod participation history</li>
                        <li>• Platform interactions and activity logs</li>
                        <li>• Basic operational data necessary to maintain platform functionality</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-bold text-[#1a1a1a] mb-2">Payments</h4>
                      <p className="text-sm">Raatap does not store sensitive payment information. If payments are enabled, they are processed through third-party payment service providers.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* 3. Pod-Based Access */}
              <section id="visibility">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">3. POD-BASED ACCESS & DATA VISIBILITY</h2>
                <div className="space-y-4">
                  <p>Raatap operates a pod-based coordination system:</p>
                  <div className="space-y-3">
                    <div className="flex gap-3 items-start">
                      <div className="mt-1 w-5 h-5 rounded-full bg-[#6675FF]/10 text-[#6675FF] flex items-center justify-center text-[10px] font-bold">1</div>
                      <p className="text-sm">Before pod confirmation, users may view limited profile information of other pod members (such as name, profile photo, and institutional affiliation).</p>
                    </div>
                    <div className="flex gap-3 items-start">
                      <div className="mt-1 w-5 h-5 rounded-full bg-[#6675FF]/10 text-[#6675FF] flex items-center justify-center text-[10px] font-bold">2</div>
                      <p className="text-sm">Contact details and direct communication information are restricted by default.</p>
                    </div>
                    <div className="flex gap-3 items-start">
                      <div className="mt-1 w-5 h-5 rounded-full bg-[#6675FF]/10 text-[#6675FF] flex items-center justify-center text-[10px] font-bold">3</div>
                      <p className="text-sm">Full contact information of pod members is shared only after pod confirmation, which may require completion of a one-time payment, as defined by the platform.</p>
                    </div>
                  </div>
                  <p className="text-sm italic">This access control is designed to protect user privacy and prevent misuse of personal data.</p>
                </div>
              </section>

              {/* 4. How We Use */}
              <section id="usage">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">4. HOW WE USE YOUR INFORMATION</h2>
                <p className="mb-3">We use collected information to:</p>
                <ul className="grid md:grid-cols-2 gap-x-8 gap-y-3 list-disc pl-5 marker:text-[#6675FF]">
                  <li>Verify user identity and institutional affiliation</li>
                  <li>Facilitate pod formation and ride coordination</li>
                  <li>Enable secure access to platform features</li>
                  <li>Communicate service-related updates</li>
                  <li>Respond to user support requests</li>
                  <li>Improve platform safety, reliability, and user experience</li>
                  <li>Prevent misuse, fraud, and policy violations</li>
                </ul>
                <p className="mt-4 text-sm italic">Promotional communications, if introduced, will be subject to user consent and applicable laws.</p>
              </section>

              {/* 5. Data Sharing */}
              <section id="sharing">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">5. DATA SHARING & DISCLOSURE</h2>
                <p className="mb-4 font-bold text-[#1a1a1a] text-lg">We do not sell personal data.</p>
                <p className="mb-4">We may share information:</p>
                <ul className="space-y-2 list-disc pl-5 marker:text-[#6675FF]">
                  <li>Between Riders and Hosts to enable ride coordination</li>
                  <li>With Campus Admins / Moderators for verification and moderation</li>
                  <li>With trusted service providers supporting platform operations</li>
                  <li>If required by law, regulation, or legal process</li>
                  <li>In connection with a business transfer, restructuring, or acquisition</li>
                </ul>
                <p className="mt-4 italic">All sharing is limited to what is necessary for the stated purpose.</p>
              </section>

              {/* 6. Campus Admins */}
              <section id="moderation">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">6. CAMPUS ADMINS & MODERATION</h2>
                <p className="mb-3">Campus Admins and Moderators may have access to:</p>
                <ul className="space-y-1 list-disc pl-5 marker:text-[#6675FF]">
                  <li>User profiles</li>
                  <li>Verification details</li>
                  <li>Ride and pod participation history</li>
                  <li>Contact information, where required for moderation</li>
                </ul>
                <p className="mt-3 text-sm">They act under platform guidelines and are expected to maintain confidentiality.</p>
              </section>

              {/* 7. Data Retention */}
              <section id="retention">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">7. DATA RETENTION</h2>
                <p>We retain personal data:</p>
                <ul className="space-y-2 list-disc pl-5 marker:text-[#6675FF]">
                  <li>For as long as your account remains active</li>
                  <li>For a reasonable period after account deletion to meet legal, regulatory, security, or operational requirements</li>
                </ul>
                <p className="mt-3 text-sm italic">Retention duration may vary depending on the type of data and applicable obligations.</p>
              </section>

              {/* 8. Your Rights */}
              <section id="rights" className="p-6 rounded-3xl border border-emerald-100 bg-emerald-50/20">
                <h2 className="text-2xl font-bold text-emerald-900 mb-4">8. YOUR RIGHTS (INDIA DPDP ACT COMPLIANT)</h2>
                <p className="mb-3 text-emerald-800">You have the right to:</p>
                <ul className="space-y-2 list-disc pl-5 marker:text-emerald-700 mb-4">
                  <li>Access and update your personal information</li>
                  <li>Request deletion of your account</li>
                  <li>Withdraw consent where applicable</li>
                </ul>
                <p className="text-emerald-800 mb-2">Certain information may be retained where required by law or for legitimate purposes.</p>
                <p className="text-emerald-800 mb-2">Requests can be submitted at:</p>
                <a href="mailto:raatap1@gmail.com" className="text-emerald-700 font-bold underline decoration-2 underline-offset-4">
                  raatap1@gmail.com
                </a>
              </section>

              {/* 9-11 General Sections */}
              <div className="grid md:grid-cols-3 gap-8 text-sm">
                <section>
                  <h3 className="font-bold text-[#1a1a1a] mb-2 uppercase tracking-tight">9. DATA SECURITY</h3>
                  <p>We implement reasonable technical and organizational measures to protect your data against unauthorized access, loss, or misuse. However, no digital system is completely secure. Users are responsible for maintaining the confidentiality of their account credentials.</p>
                </section>
                <section>
                  <h3 className="font-bold text-[#1a1a1a] mb-2 uppercase tracking-tight">10. THIRD-PARTY LINKS</h3>
                  <p>Raatap may include links to third-party services. We are not responsible for their privacy practices, and users should review third-party policies independently.</p>
                </section>
                <section>
                  <h3 className="font-bold text-[#1a1a1a] mb-2 uppercase tracking-tight">11. CHILDREN&apos;S PRIVACY</h3>
                  <p>Raatap is intended for users who are legally eligible to be members of educational institutions or organizations. We do not knowingly collect personal data from minors outside permitted usage.</p>
                </section>
              </div>

              {/* 12. Changes */}
              <section id="changes">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-2">12. CHANGES TO THIS PRIVACY POLICY</h2>
                <p>We may update this Privacy Policy from time to time. Updates will be communicated through the platform or other appropriate means. Continued use of Raatap constitutes acceptance of the revised policy.</p>
              </section>

              {/* 13. Contact Information */}
              <section id="contact" className="bg-[#1a1a1a] text-white p-8 rounded-3xl mt-12 overflow-hidden relative">
                <div className="relative z-10">
                  <h2 className="text-2xl font-bold mb-6 text-white uppercase tracking-wide">13. CONTACT INFORMATION</h2>
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <p className="text-gray-400 text-sm mb-4">For privacy-related inquiries, please reach out to our team:</p>
                      <div className="space-y-4">
                        <div>
                          <p className="font-bold text-white uppercase tracking-wider text-[10px] mb-1 opacity-50">Entity</p>
                          <p className="text-gray-300">Raatap (Proprietorship)</p>
                        </div>
                        <div>
                          <p className="font-bold text-white uppercase tracking-wider text-[10px] mb-1 opacity-50">Location</p>
                          <p className="text-gray-300">Hyderabad, Telangana, India</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col justify-end">
                      <p className="font-bold text-white uppercase tracking-wider text-[10px] mb-1 opacity-50">Email Address</p>
                      <a href="mailto:team@raatap.com" className="text-[#6675FF] text-2xl font-bold hover:text-[#5566FF] transition-all underline decoration-1 underline-offset-8">
                        team@raatap.com
                      </a>
                    </div>
                  </div>
                </div>
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#6675FF] opacity-10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
              </section>
            </div>
          </div>

        </div>
      </section>
    </main>
  );
}
