import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-black text-white" data-testid="terms-of-service-page">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8" data-testid="link-back">
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </Link>

        <h1 className="text-4xl font-bold mb-4" data-testid="text-title">Terms of Service</h1>
        <p className="text-gray-400 mb-8" data-testid="text-last-updated">Last Updated: [Date]</p>

        <div className="prose prose-invert prose-lg max-w-none space-y-8">
          <section data-testid="section-acceptance">
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-300 leading-relaxed">
              By accessing or using [App Name] (the "Service") operated by Roster, LLC ("we," "us," or "our"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not access or use the Service. These Terms apply to all visitors, users, and others who access or use the Service.
            </p>
          </section>

          <section data-testid="section-description">
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-gray-300 leading-relaxed">
              [App Name] is a sports team management platform that allows users to organize recreational leagues and teams, manage schedules, track attendance, communicate with team members, and access related features. The Service may include web-based applications, mobile applications, and any related services or features.
            </p>
          </section>

          <section data-testid="section-accounts">
            <h2 className="text-2xl font-semibold mb-4">3. User Accounts and Responsibilities</h2>
            
            <h3 className="text-xl font-medium mb-3">Account Creation</h3>
            <p className="text-gray-300 leading-relaxed mb-4">
              To use certain features of the Service, you must create an account. You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate, current, and complete.
            </p>

            <h3 className="text-xl font-medium mb-3">Account Security</h3>
            <p className="text-gray-300 leading-relaxed mb-4">
              You are responsible for safeguarding your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account or any other breach of security. We will not be liable for any loss or damage arising from your failure to protect your account.
            </p>

            <h3 className="text-xl font-medium mb-3">Age Requirements</h3>
            <p className="text-gray-300 leading-relaxed">
              You must be at least 13 years of age to use the Service. If you are under 18, you represent that you have your parent or guardian's permission to use the Service. By using the Service, you represent and warrant that you meet these requirements.
            </p>
          </section>

          <section data-testid="section-acceptable-use">
            <h2 className="text-2xl font-semibold mb-4">4. Acceptable Use Policy</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              You agree not to use the Service:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>In any way that violates any applicable federal, state, local, or international law or regulation</li>
              <li>To transmit any material that is defamatory, obscene, indecent, abusive, offensive, harassing, violent, hateful, inflammatory, or otherwise objectionable</li>
              <li>To impersonate or attempt to impersonate another user, person, or entity</li>
              <li>To engage in any conduct that restricts or inhibits anyone's use or enjoyment of the Service</li>
              <li>To introduce any viruses, trojan horses, worms, or other material that is malicious or technologically harmful</li>
              <li>To attempt to gain unauthorized access to any portion of the Service, other accounts, or any related systems or networks</li>
              <li>To use the Service for any commercial purpose not expressly permitted by us</li>
              <li>To collect or harvest any personally identifiable information from other users</li>
              <li>To engage in any activity that could disable, overburden, damage, or impair the Service</li>
              <li>To use any robot, spider, or other automatic device to access the Service for any purpose</li>
            </ul>
          </section>

          <section data-testid="section-intellectual-property">
            <h2 className="text-2xl font-semibold mb-4">5. Intellectual Property Rights</h2>
            
            <h3 className="text-xl font-medium mb-3">Our Content</h3>
            <p className="text-gray-300 leading-relaxed mb-4">
              The Service and its entire contents, features, and functionality (including but not limited to all information, software, text, displays, images, video, audio, and the design, selection, and arrangement thereof) are owned by Roster, LLC, its licensors, or other providers and are protected by United States and international copyright, trademark, patent, trade secret, and other intellectual property or proprietary rights laws.
            </p>

            <h3 className="text-xl font-medium mb-3">Your Content</h3>
            <p className="text-gray-300 leading-relaxed mb-4">
              You retain ownership of any content you submit, post, or display on or through the Service ("User Content"). By posting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use, copy, modify, distribute, publish, and process your content for the purpose of operating and providing the Service.
            </p>

            <h3 className="text-xl font-medium mb-3">Feedback</h3>
            <p className="text-gray-300 leading-relaxed">
              Any feedback, comments, or suggestions you may provide regarding the Service is entirely voluntary. We are free to use such feedback without any obligation to you.
            </p>
          </section>

          <section data-testid="section-payment">
            <h2 className="text-2xl font-semibold mb-4">6. Payment Terms</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Certain features of the Service may require payment of fees. If you choose to use paid features:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>You agree to pay all applicable fees as described on the Service</li>
              <li>Fees are non-refundable except as required by law or as explicitly stated otherwise</li>
              <li>We may change our fees at any time with notice to you</li>
              <li>You are responsible for providing accurate billing information</li>
              <li>Subscriptions may automatically renew unless cancelled before the renewal date</li>
            </ul>
          </section>

          <section data-testid="section-disclaimers">
            <h2 className="text-2xl font-semibold mb-4">7. Disclaimers and Limitations of Liability</h2>
            
            <h3 className="text-xl font-medium mb-3">Disclaimer of Warranties</h3>
            <p className="text-gray-300 leading-relaxed mb-4">
              THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT ANY WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR COURSE OF PERFORMANCE.
            </p>
            <p className="text-gray-300 leading-relaxed mb-4">
              We do not warrant that the Service will function uninterrupted, secure, or available at any particular time or location, or that any errors or defects will be corrected.
            </p>

            <h3 className="text-xl font-medium mb-3">Limitation of Liability</h3>
            <p className="text-gray-300 leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL ROSTER, LLC, ITS AFFILIATES, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, PUNITIVE, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, INCLUDING WITHOUT LIMITATION DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO THE USE OF, OR INABILITY TO USE, THE SERVICE.
            </p>
          </section>

          <section data-testid="section-indemnification">
            <h2 className="text-2xl font-semibold mb-4">8. Indemnification</h2>
            <p className="text-gray-300 leading-relaxed">
              You agree to defend, indemnify, and hold harmless Roster, LLC, its affiliates, licensors, and service providers, and its and their respective officers, directors, employees, contractors, agents, licensors, suppliers, successors, and assigns from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising out of or relating to your violation of these Terms or your use of the Service.
            </p>
          </section>

          <section data-testid="section-termination">
            <h2 className="text-2xl font-semibold mb-4">9. Termination</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including without limitation if you breach these Terms.
            </p>
            <p className="text-gray-300 leading-relaxed mb-4">
              Upon termination, your right to use the Service will immediately cease. If you wish to terminate your account, you may do so through the account settings or by contacting us.
            </p>
            <p className="text-gray-300 leading-relaxed">
              All provisions of these Terms which by their nature should survive termination shall survive termination, including, without limitation, ownership provisions, warranty disclaimers, indemnity, and limitations of liability.
            </p>
          </section>

          <section data-testid="section-governing-law">
            <h2 className="text-2xl font-semibold mb-4">10. Governing Law and Dispute Resolution</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              These Terms shall be governed by and construed in accordance with the laws of [State/Country], without regard to its conflict of law provisions.
            </p>
            <p className="text-gray-300 leading-relaxed mb-4">
              Any dispute arising from or relating to these Terms or the Service shall first be attempted to be resolved through good-faith negotiation. If such disputes cannot be resolved, they shall be submitted to binding arbitration in [City, State/Country] in accordance with the rules of the American Arbitration Association.
            </p>
            <p className="text-gray-300 leading-relaxed">
              You agree that any arbitration shall be limited to the dispute between you and Roster, LLC individually. You waive any right to participate in a class action lawsuit or class-wide arbitration.
            </p>
          </section>

          <section data-testid="section-changes">
            <h2 className="text-2xl font-semibold mb-4">11. Changes to Terms</h2>
            <p className="text-gray-300 leading-relaxed">
              We reserve the right to modify or replace these Terms at any time at our sole discretion. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion. By continuing to access or use the Service after any revisions become effective, you agree to be bound by the revised terms.
            </p>
          </section>

          <section data-testid="section-severability">
            <h2 className="text-2xl font-semibold mb-4">12. Severability</h2>
            <p className="text-gray-300 leading-relaxed">
              If any provision of these Terms is held to be unenforceable or invalid, such provision will be changed and interpreted to accomplish the objectives of such provision to the greatest extent possible under applicable law, and the remaining provisions will continue in full force and effect.
            </p>
          </section>

          <section data-testid="section-entire-agreement">
            <h2 className="text-2xl font-semibold mb-4">13. Entire Agreement</h2>
            <p className="text-gray-300 leading-relaxed">
              These Terms, together with the Privacy Policy and any other legal notices published by us on the Service, constitute the entire agreement between you and Roster, LLC concerning the Service and supersede all prior or contemporaneous understandings and agreements, whether written or oral, regarding such subject matter.
            </p>
          </section>

          <section data-testid="section-contact">
            <h2 className="text-2xl font-semibold mb-4">14. Contact Us</h2>
            <p className="text-gray-300 leading-relaxed">
              If you have any questions about these Terms of Service, please contact us:
            </p>
            <ul className="list-none text-gray-300 space-y-2 mt-4">
              <li><strong>Email:</strong> contact@roster-app.com</li>
              <li><strong>Address:</strong> [Company Address]</li>
            </ul>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800">
          <Link href="/" className="text-[#3c82f4] hover:underline" data-testid="link-home">
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
