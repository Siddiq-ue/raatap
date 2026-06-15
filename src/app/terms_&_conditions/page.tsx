import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description:
    "Raatap Terms and Conditions - Read our platform usage terms, user responsibilities, and legal agreements governing the ride-sharing community.",
  keywords: [
    "Raatap terms",
    "ride sharing terms of service",
    "carpooling agreement",
    "platform usage terms",
    "user agreement India",
  ],
  openGraph: {
    title: "Terms and Conditions - Raatap",
    description:
      "Read Raatap's terms of service governing our community ride-sharing platform.",
    url: "https://raatap.com/terms_&_conditions",
  },
  twitter: {
    card: "summary",
    title: "Terms and Conditions - Raatap",
    description: "Terms governing Raatap's ride-sharing platform.",
  },
  alternates: {
    canonical: "https://raatap.com/terms_&_conditions",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsAndConditions() {
  return (
    <main className="min-h-screen bg-[#fcfcfd]">
      <section className="w-full px-6 md:px-12 lg:px-20 py-16 md:py-24">
        <div className="max-w-4xl mx-auto">

          {/* Page Header */}
          <div className="mb-16">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-[1px] w-8 bg-[#6675FF]"></div>
              <span className="text-[#6675FF] font-medium tracking-wider text-sm uppercase">Legal Agreement</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-semibold text-[#1a1a1a] mb-6 tracking-tight">
              Terms and Conditions
            </h1>
            <p className="text-gray-500 text-sm">Last Updated: March 2026</p>

          </div>

          <div className="space-y-12">
            {/* Introduction */}
            <div className="prose prose-slate max-w-none">
              <p className="text-lg text-gray-700 leading-relaxed font-medium">
                These Terms and Conditions (&ldquo;Terms&rdquo;) govern your access to and use of Raatap, a closed-community ride coordination platform operated by Raatap (Proprietorship), Hyderabad, Telangana, India (&ldquo;Raatap&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;).
              </p>
              <p className="text-gray-600 leading-relaxed mt-4">
                By accessing or using the Raatap platform (website, mobile application, or related services), you agree to be bound by these Terms. If you do not agree, you must not use the platform.
              </p>
            </div>

            <div className="grid gap-12 border-t border-gray-100 pt-12 text-gray-600">
              {/* 1. Nature of the Platform */}
              <section id="nature-of-platform">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">1. NATURE OF THE PLATFORM</h2>
                <p className="leading-relaxed mb-4">
                  Raatap is a technology platform that facilitates ride coordination within verified institutional or organizational communities.
                </p>
                <ul className="space-y-2 list-disc pl-5 marker:text-[#6675FF]">
                  <li>Raatap does not provide transportation services</li>
                  <li>Raatap does not own, operate, or control any vehicle</li>
                  <li>Raatap does not employ drivers or riders</li>
                </ul>
                <p className="mt-4 italic bg-[#6675FF]/5 p-4 rounded-xl border border-[#6675FF]/10">
                  All rides arranged through the platform are private, non-commercial arrangements between users. Any agreement, interaction, or transaction occurs solely between the participating users.
                </p>
              </section>

              {/* 2. Eligibility */}
              <section id="eligibility">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">2. ELIGIBILITY</h2>
                <p className="mb-3 font-medium text-gray-700">To use Raatap, you must:</p>
                <ul className="space-y-2 list-disc pl-5 marker:text-[#6675FF]">
                  <li>Be at least 18 years old</li>
                  <li>Be a bona fide student of an institute or organization approved on the platform</li>
                  <li>Provide accurate and complete information during registration</li>
                </ul>
                <p className="mt-4">Raatap reserves the right to deny access to any user who does not meet eligibility requirements.</p>
              </section>

              {/* 3. User Registration */}
              <section id="registration">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">3. USER REGISTRATION & VERIFICATION</h2>
                <p className="mb-3">Users may be required to provide:</p>
                <ul className="space-y-2 list-disc pl-5 marker:text-[#6675FF] columns-1 md:columns-2">
                  <li>Full name</li>
                  <li>Phone number and email address</li>
                  <li>Profile photograph</li>
                  <li>Institutional ID and verification details</li>
                  <li>Vehicle details (for Hosts), including driving license and insurance information</li>
                </ul>
                <div className="mt-6 p-5 bg-amber-50 rounded-2xl border border-amber-100">
                  <p className="text-amber-900 font-medium text-sm mb-2">IMPORTANT NOTICE</p>
                  <p className="text-amber-800 text-sm leading-relaxed">
                    Raatap performs limited verification to confirm institutional affiliation. Raatap does not conduct criminal background checks, driving skill assessments, or continuous monitoring of users. Users are solely responsible for the accuracy of information provided.
                  </p>
                </div>
              </section>

              {/* 4. User Roles */}
              <section id="user-roles">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">4. USER ROLES</h2>
                <p className="mb-3 italic">Raatap supports multiple user roles, including:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {['Riders', 'Hosts', 'Campus Admins / Moderators', 'Visitors'].map((role) => (
                    <div key={role} className="bg-gray-50 p-3 rounded-lg text-center font-medium border border-gray-100">{role}</div>
                  ))}
                </div>
                <p className="mt-4 text-sm">
                  Campus Admins and Moderators may have access to certain user information for verification and moderation purposes and act under platform guidelines.
                </p>
              </section>

              {/* 5. Pods & Matching */}
              <section id="pods">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">5. PODS, MATCHING & ACCESS CONTROL</h2>
                <p className="mb-4">Raatap uses a pod-based matching system to coordinate rides.</p>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#6675FF] text-white flex items-center justify-center text-xs">1</div>
                    <p>Users matched into a pod may view limited profile information of other pod members.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#6675FF] text-white flex items-center justify-center text-xs">2</div>
                    <p>Contact details and direct communication information are restricted by default.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#6675FF] text-white flex items-center justify-center text-xs">3</div>
                    <p>Access to full pod details, including contact information, is provided only after pod confirmation, which may require completion of a one-time fee, as determined by the platform. Pod creation or matching does not guarantee pod activation.</p>
                  </div>
                </div>
              </section>

              {/* 6. Fees */}
              <section id="fees">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">6. FEES, PAYMENTS & CONFIRMATION</h2>
                <div className="space-y-4">
                  <p>Certain features of Raatap, including pod confirmation, may require payment of a one-time fee.</p>
                  <ul className="space-y-2 list-disc pl-5 marker:text-[#6675FF]">
                    <li>The applicability, amount, and refundability of fees are governed by the rules in effect at the time of payment.</li>
                    <li>Payment signifies intent to participate in the pod.</li>
                    <li>Raatap does not store sensitive payment information.</li>
                  </ul>
                  <div className="bg-red-50 p-5 rounded-2xl border border-red-100 mt-4">
                    <p className="text-red-900 font-medium text-sm mb-2">PAYMENT FAILURE/DELAY</p>
                    <p className="text-red-800 text-sm">
                      If payment is not completed within the prescribed time, the pod may be deactivated, users may be reassigned, or new users may be matched. Raatap reserves the right to modify pricing prospectively.
                    </p>
                  </div>
                </div>
              </section>

              {/* 7. Pod Exit */}
              <section id="exit">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">7. POD EXIT, PRIOR NOTICE & USER BEHAVIOR</h2>
                <p className="mb-4 text-gray-700">Users may exit a confirmed pod by providing prior notice, where applicable.</p>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/30">
                    <h4 className="font-semibold text-emerald-900 mb-2">Proper Exit</h4>
                    <p className="text-sm text-emerald-800">Exiting with prior notice will not negatively impact future matching.</p>
                  </div>
                  <div className="p-4 rounded-xl border border-red-100 bg-red-50/30">
                    <h4 className="font-semibold text-red-900 mb-2">Repeated Exits / Misuse</h4>
                    <p className="text-sm text-red-800">Repeated exits without notice, misuse of the platform, or disruptive behavior may affect user score, matching eligibility, and account access. Raatap retains discretion in evaluating user behavior.</p>
                  </div>
                </div>
              </section>

              {/* 8. Responsibilities */}
              <section id="responsibilities">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">8. HOST & RIDER RESPONSIBILITIES</h2>
                <div className="grid md:grid-cols-2 gap-8 mt-6">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#6675FF] mb-4">Hosts Must</h3>
                    <ul className="space-y-3 text-sm">
                      <li className="flex gap-2"><span>•</span> Hold a valid driving license</li>
                      <li className="flex gap-2"><span>•</span> Ensure vehicles are insured, roadworthy, and legally compliant</li>
                      <li className="flex gap-2"><span>•</span> Follow traffic laws and safe driving practices</li>
                      <li className="flex gap-2"><span>•</span> Limit charges to cost-sharing (fuel/travel expenses only)</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#6675FF] mb-4">Riders Must</h3>
                    <ul className="space-y-3 text-sm">
                      <li className="flex gap-2"><span>•</span> Respect hosts, vehicles, and agreed schedules</li>
                      <li className="flex gap-2"><span>•</span> Avoid illegal, offensive, or disruptive behavior</li>
                    </ul>
                    <p className="text-sm mt-3 italic">All users are responsible for exercising judgment and caution when participating in rides.</p>
                  </div>
                </div>
              </section>

              {/* 9. Safety Disclaimer */}
              <section id="safety-disclaimer">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">9. SAFETY DISCLAIMER</h2>
                <div className="space-y-4">
                  <p>Raatap does not guarantee the safety, quality, or conduct of any ride.</p>
                  <p className="font-medium">Users acknowledge that:</p>
                  <ul className="space-y-2 list-disc pl-5 marker:text-[#6675FF]">
                    <li>Participation in rides is voluntary</li>
                    <li>Raatap does not provide insurance coverage</li>
                    <li>Users assume all risks associated with ride coordination</li>
                  </ul>
                  <p className="font-semibold text-[#1a1a1a]">Users are encouraged to take independent safety precautions.</p>
                </div>
              </section>

              {/* 10. Limitation of Liability */}
              <section id="liability">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">10. LIMITATION OF LIABILITY</h2>
                <p className="leading-relaxed mb-4">
                  To the maximum extent permitted by law:
                </p>
                <ul className="space-y-2 list-disc pl-5 marker:text-[#6675FF]">
                  <li>Raatap shall not be liable for any injury, loss, damage, theft, accident, or dispute arising from rides or user interactions</li>
                  <li>Raatap shall not be liable for indirect, incidental, or consequential damages</li>
                </ul>
                <p className="mt-4 italic">Nothing in these Terms limits liability that cannot be excluded under applicable law.</p>
              </section>

              {/* 11. Prohibited Activities */}
              <section id="prohibited">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">11. PROHIBITED ACTIVITIES</h2>
                <p className="mb-3">Users must not:</p>
                <ul className="space-y-2 list-disc pl-5 marker:text-[#6675FF]">
                  <li>Provide false or misleading information</li>
                  <li>Engage in illegal, fraudulent, or abusive behavior</li>
                  <li>Use the platform for commercial transportation</li>
                  <li>Harass, discriminate, or threaten other users</li>
                  <li>Circumvent platform controls or payment mechanisms</li>
                </ul>
                <p className="mt-4 text-sm">Violation may result in suspension or termination.</p>
              </section>

              {/* 12. Suspension & Termination */}
              <section id="termination">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">12. SUSPENSION & TERMINATION</h2>
                <p>Raatap may suspend or terminate access to the platform at its discretion, including without prior notice, for:</p>
                <ul className="space-y-2 list-disc pl-5 marker:text-[#6675FF] mt-3">
                  <li>Policy violations</li>
                  <li>Safety or legal concerns</li>
                  <li>Misuse of the platform</li>
                </ul>
                <p className="mt-4 text-sm">Termination does not entitle users to compensation unless required by law.</p>
              </section>

              {/* 13. Indemnification */}
              <section id="indemnification">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">13. INDEMNIFICATION</h2>
                <p>You agree to indemnify and hold harmless Raatap and its representatives from any claims, damages, or liabilities arising from:</p>
                <ul className="space-y-2 list-disc pl-5 marker:text-[#6675FF] mt-3">
                  <li>Your use of the platform</li>
                  <li>Your interactions with other users</li>
                  <li>Violation of these Terms</li>
                </ul>
              </section>

              {/* 14. Privacy */}
              <section id="privacy">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">14. PRIVACY</h2>
                <p>Personal data is handled in accordance with the Raatap Privacy Policy, which forms an integral part of these Terms.</p>
              </section>

              {/* 15. Force Majeure */}
              <section id="force-majeure">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">15. FORCE MAJEURE</h2>
                <p>Raatap shall not be liable for failure or delay caused by events beyond reasonable control, including natural disasters, system failures, or government actions.</p>
              </section>

              {/* 16. Governing Law */}
              <section id="governing-law">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">16. GOVERNING LAW & DISPUTE RESOLUTION</h2>
                <p className="mb-4">These Terms are governed by the laws of India. Any dispute shall be resolved by arbitration in accordance with the Arbitration and Conciliation Act, 1996.</p>
                <div className="mt-4 flex flex-col sm:flex-row gap-6 border-l-2 border-[#6675FF] pl-4">
                  <div>
                    <span className="block text-xs uppercase font-bold text-gray-400">Seat and Venue</span>
                    <span className="font-medium">Hyderabad, Telangana</span>
                  </div>
                  <div>
                    <span className="block text-xs uppercase font-bold text-gray-400">Language</span>
                    <span className="font-medium">English</span>
                  </div>
                </div>
              </section>

              {/* 17. Modifications */}
              <section id="modifications">
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-4">17. MODIFICATIONS TO TERMS</h2>
                <p>Raatap may update these Terms from time to time. Continued use of the platform after updates constitutes acceptance of the revised Terms.</p>
              </section>

              {/* 18. Contact Information */}
              <section id="contact" className="bg-[#1a1a1a] text-white p-8 rounded-3xl mt-12 overflow-hidden relative">
                <div className="relative z-10">
                  <h2 className="text-2xl font-bold mb-6 text-white">18. CONTACT INFORMATION</h2>
                  <div className="space-y-4">
                    <p className="text-gray-300">If you have any questions regarding these Terms, please contact us:</p>
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="font-bold text-white uppercase tracking-wider text-xs mb-1">Entity</p>
                        <p className="text-gray-300">Raatap (Proprietorship)</p>
                      </div>
                      <div>
                        <p className="font-bold text-white uppercase tracking-wider text-xs mb-1">Location</p>
                        <p className="text-gray-300">Hyderabad, Telangana, India</p>
                      </div>
                      <div>
                        <p className="font-bold text-white uppercase tracking-wider text-xs mb-1">Email</p>
                        <a href="mailto:team@raatap.com" className="text-[#6675FF] hover:text-[#5566FF] font-medium transition-colors underline decoration-2 underline-offset-4">
                          team@raatap.com
                        </a>
                      </div>
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
