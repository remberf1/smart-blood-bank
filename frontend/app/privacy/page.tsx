import Link from 'next/link';
import { ShieldCheck, Lock, FileText, AlertTriangle, Hospital, HeartHandshake, ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Privacy, Clinical Safety & Data Protection | Smart Blood Bank',
  description: 'Compliance with NDPA 2023, NBSC guidelines, Anti-Self-Medication clinical safeguards, and donor NIN data protection standards.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* Header */}
      <header className="border-b bg-white/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-600 hover:text-gray-900">Back to Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-lg">🩸</span>
            <span className="font-bold text-gray-900 text-sm sm:text-base">
              Smart <span className="text-red-600">Blood Bank</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-12 px-4">
        <div className="max-w-4xl mx-auto space-y-10">
          
          {/* Title Header */}
          <div className="border-b pb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold mb-4">
              <ShieldCheck className="h-4 w-4 text-red-600" />
              NDPA 2023 &amp; NBSC Compliance
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
              Clinical Safety, Data Protection &amp; Patient Confidentiality Policy
            </h1>
            <p className="mt-3 text-base text-gray-600 leading-relaxed">
              Official operational protocol governing medical confidentiality, clinical authorization, donor identity verification, and data handling for the Smart Blood Bank &amp; Oxygen Availability Network across Nigeria.
            </p>
          </div>

          {/* Section 1: Core Clinical Architecture */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold">
                1
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                Core Clinical Principle: Medical Coordination, Not Public Commerce
              </h2>
            </div>
            <div className="bg-red-50/60 border border-red-200 rounded-2xl p-5 text-sm text-red-900 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-semibold text-red-950">
                    Prohibition of Direct-to-Consumer Blood Provisioning &amp; Anti-Self-Medication Notice
                  </p>
                  <p className="leading-relaxed text-red-800">
                    Under National Blood Service Commission (NBSC) regulations and the Medical and Dental Council of Nigeria (MDCN) Code of Ethics, human blood and blood components are <strong>strictly prescription-only therapeutic biological products</strong>. Blood can never be purchased for home use, ordered as personal inventory, or self-administered.
                  </p>
                  <p className="leading-relaxed text-red-800">
                    Smart Blood Bank does <strong>not</strong> operate a public blood marketplace. Our digital infrastructure exists to facilitate <strong>doctor-to-doctor and hospital-to-hospital coordination</strong>. When relatives submit blood requisitions through our portal or WhatsApp bot, they act strictly as verified clinical messengers conveying an existing physician&apos;s requisition.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Clinical Authorization & Pre-Hospital Protocol */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-800 flex items-center justify-center font-bold">
                2
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                Clinical Requisitions &amp; Pre-Hospital Emergency Triage
              </h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="border border-gray-200 rounded-2xl p-5 space-y-2 bg-white shadow-2xs">
                <div className="flex items-center gap-2 font-bold text-gray-900">
                  <Hospital className="h-4 w-4 text-red-600" />
                  Pre-Hospital Emergencies
                </div>
                <p className="text-gray-600 leading-relaxed text-xs">
                  In acute emergencies outside a clinical facility, users are immediately routed to certified 24/7 emergency hospital centers rather than raw blood stocks. Blood cannot be transfused without clinical resuscitation, cross-matching, and hospital oversight.
                </p>
              </div>

              <div className="border border-gray-200 rounded-2xl p-5 space-y-2 bg-white shadow-2xs">
                <div className="flex items-center gap-2 font-bold text-gray-900">
                  <FileText className="h-4 w-4 text-blue-600" />
                  Physician Authorization (Ref ID)
                </div>
                <p className="text-gray-600 leading-relaxed text-xs">
                  All family-submitted requests mandate providing the attending physician&apos;s full name, clinical telephone contact, and patient reference identifier (<code className="font-mono text-red-600 font-semibold">SBB-XXXXX</code>). Requisitions are validated with the hospital blood transfusion committee before units are cross-matched.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3: NIN & Donor Data Protection under NDPA 2023 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-800 flex items-center justify-center font-bold">
                3
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                National Identification Number (NIN) &amp; NDPA 2023 Compliance
              </h2>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              In accordance with the <strong>Nigeria Data Protection Act (NDPA) 2023</strong> and national guidelines for voluntary blood donation:
            </p>

            <div className="border border-gray-200 rounded-2xl p-6 bg-gray-50/50 space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-gray-900">Purpose Specification for NIN Collection</h4>
                  <p className="text-gray-600 text-xs mt-1 leading-relaxed">
                    National Identification Numbers (NIN) are collected exclusively to establish donor uniqueness, verify age eligibility (18–65 years), prevent duplicate registrations, and strictly enforce the mandatory 90-day clinical deferral window between blood donations for donor safety.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-gray-900">Cryptographic Storage &amp; Zero-Knowledge Masking</h4>
                  <p className="text-gray-600 text-xs mt-1 leading-relaxed">
                    Full 11-digit NINs are stored in protected database collections configured with restricted access (<code className="font-mono text-xs bg-gray-200 px-1 py-0.5 rounded">select: false</code>) and are never exposed across public APIs, client-side scripts, or logs. Hospital staff and phlebotomy teams can only view an auditable masked identifier (e.g., <code className="font-mono text-xs bg-gray-200 px-1 py-0.5 rounded">*******8901</code>) alongside physical photo ID verification at the donation center.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <HeartHandshake className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-gray-900">Voluntary Day-Offering Model</h4>
                  <p className="text-gray-600 text-xs mt-1 leading-relaxed">
                    Donors offer an available day and preferred clinic window (Morning, Afternoon, or Flexible) rather than rigid micro-scheduled appointments. Hospital blood banks review and confirm offers according to lab capacity and phlebotomist availability.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Cold-Chain & Transfer Custody */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-800 flex items-center justify-center font-bold">
                4
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                Cold-Chain Integrity &amp; Hospital-to-Hospital Delivery
              </h2>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              All blood units dispatched through our coordination network are transported exclusively between certified healthcare institutions using calibrated cold-chain transport boxes maintaining temperatures between <strong>+2°C and +6°C</strong> for whole blood/packed red cells. Blood is never dispatched to private residences or non-clinical premises.
            </p>
          </section>

          {/* Section 5: Data Subject Rights */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-800 flex items-center justify-center font-bold">
                5
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                Data Subject Rights &amp; Regulatory Inquiries
              </h2>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Under Section 34 of the NDPA 2023, registered donors and patients have the right to request access, rectification, or restriction of processing of their personal information. Clinical records associated with completed transfusions and biological screening are retained in conformity with statutory health record retention guidelines under the National Health Act 2014.
            </p>
            <div className="bg-gray-100 rounded-xl p-4 text-xs text-gray-700 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">Data Protection Officer (DPO)</p>
                <p className="text-gray-500">Smart Blood Bank &bull; Nigeria Health Logistics Network</p>
              </div>
              <a 
                href="mailto:compliance@smartbloodbank.ng" 
                className="font-semibold text-red-600 hover:underline"
              >
                compliance@smartbloodbank.ng
              </a>
            </div>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto bg-gray-900 text-gray-400 py-8 px-4 text-xs text-center border-t border-gray-800">
        <div className="max-w-4xl mx-auto space-y-2">
          <p className="text-gray-300 font-semibold">Smart Blood Bank &bull; National Emergency Logistics Network</p>
          <p className="text-gray-500">Compliant with NDPA 2023 &bull; National Blood Service Commission (NBSC) Act 2021 &bull; MDCN Ethical Guidelines</p>
        </div>
      </footer>
    </div>
  );
}
