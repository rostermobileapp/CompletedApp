import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle, Loader2, Upload, X } from 'lucide-react';
import { Link } from 'wouter';

import communityPhoto from '@assets/community-photo.jpg';
import rosterLightLogo from '@assets/roster-light-logo.svg';

const ORG_TYPES = [
  'Hockey Association',
  'Youth League',
  'School Program',
  'Nonprofit',
  'Other',
];

export default function ReferralProgram() {
  const [referrals, setReferrals] = useState(500);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [form, setForm] = useState({
    orgName: '',
    contactName: '',
    email: '',
    orgType: '',
    hockeyAffiliation: '',
  });
  const applyRef = useRef<HTMLDivElement | null>(null);

  const scrollToApply = () => {
    applyRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = e.target.files?.[0] ?? null;
    setFile(nextFile);
    setFileError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus('submitting');
    setTimeout(() => setSubmitStatus('success'), 500);
  };

  useEffect(() => {}, []);

  return (
    <div>
      <section className="py-20 px-6 bg-gradient-to-b from-blue-50/60 to-white text-center pt-[40px] pb-[40px]">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-black text-gray-900 leading-tight mb-5">
            We give back
            <br />
            <span className="text-[#3c82f4]">to our community.</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Refer players to our platform and Roster will donate 10% of our net subscription proceeds every quarter for every active subscription tied to your organization.
            <br /><br />
            <span className="text-[#3c82f4] font-extrabold text-[26px]">Choose a good cause and track your referrals!</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={scrollToApply}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-[#3c82f4] text-white text-lg font-semibold hover:bg-[#3c82f4]/90 transition-colors shadow-lg shadow-blue-200"
            >
              Apply to Become a Partner <ArrowRight className="w-5 h-5" />
            </button>
            <Link
              href="/referral-program/portal/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full border border-gray-300 text-gray-700 text-lg font-semibold hover:border-gray-400 transition-colors"
            >
              Partner Login
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
