import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';

export default function PrivacyPolicy() {
  useSeo({
    title: 'Privacy Policy | Roster',
    description: 'Read the Roster Privacy Policy. Learn how we collect, use, and protect your data when you use the Roster sports team management app.',
  });

  return (
    <div className="min-h-screen bg-black text-white" data-testid="privacy-policy-page">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8" data-testid="link-back">
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </Link>

        <h1 className="text-4xl font-bold mb-4" data-testid="text-title">Privacy Policy</h1>
        <p className="text-gray-400 mb-8" data-testid="text-last-updated">Last Updated: 12/1/2025</p>

        <div className="prose prose-invert prose-lg max-w-none space-y-8">
          <section data-testid="section-introduction">
            <h2 className="text-2xl font-semibold mb-4">Introduction</h2>
            <p className="text-gray-300 leading-relaxed">
              Roster, LLC ("we," "our," or "us") operates Roster (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the Service.
            </p>
          </section>

          <section data-testid="section-information-collection">
            <h2 className="text-2xl font-semibold mb-4">Information We Collect</h2>
            
            <h3 className="text-xl font-medium mb-3">Personal Data</h3>
            <p className="text-gray-300 leading-relaxed mb-4">
              We may collect personally identifiable information that you voluntarily provide when registering for an account, including but not limited to:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 mb-6">
              <li>Name and email address</li>
              <li>Phone number</li>
              <li>Profile information (such as profile picture, team affiliations)</li>
              <li>Payment information (processed securely through third-party providers)</li>
              <li>Any other information you choose to provide</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">Usage Data</h3>
            <p className="text-gray-300 leading-relaxed mb-4">
              We automatically collect certain information when you access the Service, including:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 mb-6">
              <li>Device information (device type, operating system, unique device identifiers)</li>
              <li>Log data (IP address, browser type, pages visited, time and date of visit)</li>
              <li>Location data (with your consent)</li>
              <li>App usage patterns and preferences</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">Cookies and Tracking Technologies</h3>
            <p className="text-gray-300 leading-relaxed">
              We use cookies, web beacons, and similar tracking technologies to collect information about your browsing activities. You can control cookies through your browser settings, but disabling cookies may limit your use of certain features.
            </p>
          </section>

          <section data-testid="section-use-of-information">
            <h2 className="text-2xl font-semibold mb-4">How We Use Your Information</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              We use the information we collect for various purposes, including:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>To provide, operate, and maintain the Service</li>
              <li>To improve, personalize, and expand the Service</li>
              <li>To understand and analyze how you use the Service</li>
              <li>To develop new products, services, features, and functionality</li>
              <li>To communicate with you, including for customer service, updates, and marketing</li>
              <li>To process transactions and send related information</li>
              <li>To send you push notifications (with your consent)</li>
              <li>To find and prevent fraud and abuse</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section data-testid="section-data-sharing">
            <h2 className="text-2xl font-semibold mb-4">Data Sharing and Third Parties</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              We may share your information in the following situations:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li><strong>With Service Providers:</strong> We share data with third-party vendors who perform services on our behalf (e.g., payment processing, data analytics, email delivery, hosting services, customer service)</li>
              <li><strong>With Your Team/League:</strong> Information you share within teams or leagues may be visible to other members</li>
              <li><strong>For Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, your information may be transferred</li>
              <li><strong>With Your Consent:</strong> We may share your information for any other purpose with your consent</li>
              <li><strong>Legal Requirements:</strong> We may disclose information if required by law or in response to valid legal processes</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              <strong>We do not sell your personal information to third parties.</strong>
            </p>
          </section>

          <section data-testid="section-data-security">
            <h2 className="text-2xl font-semibold mb-4">Data Security</h2>
            <p className="text-gray-300 leading-relaxed">
              We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. These measures include encryption, secure socket layer (SSL) technology, firewalls, and regular security assessments. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section data-testid="section-user-rights">
            <h2 className="text-2xl font-semibold mb-4">Your Rights and Choices</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Depending on your location, you may have the following rights regarding your personal data:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 mb-6">
              <li><strong>Access:</strong> Request access to your personal data</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
              <li><strong>Deletion:</strong> Request deletion of your personal data ("Right to be Forgotten")</li>
              <li><strong>Portability:</strong> Request a copy of your data in a portable format</li>
              <li><strong>Opt-Out:</strong> Opt out of marketing communications at any time</li>
              <li><strong>Withdraw Consent:</strong> Withdraw consent where we rely on consent for processing</li>
              <li><strong>Object:</strong> Object to processing of your personal data in certain circumstances</li>
            </ul>
            <p className="text-gray-300 leading-relaxed">
              To exercise any of these rights, please contact us at contact@roster-app.com. We will respond to your request within the timeframe required by applicable law.
            </p>
          </section>

          <section data-testid="section-gdpr">
            <h2 className="text-2xl font-semibold mb-4">GDPR Compliance (European Users)</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              If you are a resident of the European Economic Area (EEA), you have certain data protection rights under the General Data Protection Regulation (GDPR). We are committed to facilitating the exercise of these rights. Our legal bases for processing your personal data include:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>Performance of a contract when we provide the Service</li>
              <li>Your consent for specific processing activities</li>
              <li>Our legitimate interests, provided they are not overridden by your rights</li>
              <li>Compliance with legal obligations</li>
            </ul>
          </section>

          <section data-testid="section-ccpa">
            <h2 className="text-2xl font-semibold mb-4">CCPA Compliance (California Users)</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              If you are a California resident, you have specific rights under the California Consumer Privacy Act (CCPA):
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>The right to know what personal information we collect, use, and disclose</li>
              <li>The right to request deletion of your personal information</li>
              <li>The right to opt-out of the sale of personal information (we do not sell your data)</li>
              <li>The right to non-discrimination for exercising your CCPA rights</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              To exercise these rights, please contact us at contact@roster-app.com.
            </p>
          </section>

          <section data-testid="section-coppa">
            <h2 className="text-2xl font-semibold mb-4">Children's Privacy (COPPA Compliance)</h2>
            <p className="text-gray-300 leading-relaxed">
              Our Service is not intended for children under the age of 13. We do not knowingly collect personally identifiable information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us at contact@roster-app.com. If we discover that a child under 13 has provided us with personal information, we will promptly delete such information from our servers.
            </p>
          </section>

          <section data-testid="section-international">
            <h2 className="text-2xl font-semibold mb-4">International Data Transfers</h2>
            <p className="text-gray-300 leading-relaxed">
              Your information may be transferred to and maintained on computers located outside of your state, province, country, or other governmental jurisdiction where data protection laws may differ. If you are located outside the United States and choose to provide information to us, please note that we transfer the data to the United States and process it there. We take appropriate safeguards to ensure your personal data remains protected in accordance with this Privacy Policy.
            </p>
          </section>

          <section data-testid="section-data-retention">
            <h2 className="text-2xl font-semibold mb-4">Data Retention</h2>
            <p className="text-gray-300 leading-relaxed">
              We retain your personal data only for as long as necessary to fulfill the purposes for which it was collected, including to satisfy any legal, accounting, or reporting requirements. To determine the appropriate retention period, we consider the amount, nature, and sensitivity of the data, the potential risk of harm from unauthorized use or disclosure, and applicable legal requirements.
            </p>
          </section>

          <section data-testid="section-changes">
            <h2 className="text-2xl font-semibold mb-4">Changes to This Privacy Policy</h2>
            <p className="text-gray-300 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. For significant changes, we may provide additional notice (such as an in-app notification or email). Your continued use of the Service after any changes indicates your acceptance of the updated Privacy Policy.
            </p>
          </section>

          <section data-testid="section-contact">
            <h2 className="text-2xl font-semibold mb-4">Contact Us</h2>
            <p className="text-gray-300 leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us:
            </p>
            <p className="text-gray-300 mt-4">
              <strong>Email:</strong> contact@roster-app.com
            </p>
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
