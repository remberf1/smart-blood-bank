'use client';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Droplet, ArrowLeft, HeartPulse, Baby, UserCheck, TrendingUp,
  Check, Minus, HandHeart, Search, ShieldCheck, HelpCircle, Phone, ExternalLink,
} from 'lucide-react';

const GROUPS = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] as const;

// Which donor groups each recipient can safely receive (red cells).
const CAN_RECEIVE: Record<string, string[]> = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'A+', 'B+', 'AB-', 'A-', 'B-', 'O+', 'O-'],
};

function CompatibilityMatrix() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Droplet className="h-5 w-5 text-red-600" /> Who Can Receive From Whom (Compatibility Chart)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Rows represent the <strong>recipient</strong>; a checkmark indicates they can safely receive red blood cells
          from that <strong>donor</strong> group.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card p-2 text-left text-muted-foreground font-medium">
                  Recipient ↓ / Donor →
                </th>
                {GROUPS.map((g) => (
                  <th key={g} className="p-2 text-center font-semibold text-foreground whitespace-nowrap">{g}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((recipient) => (
                <tr key={recipient} className="border-t border-border">
                  <td className="sticky left-0 bg-card p-2 font-semibold text-foreground whitespace-nowrap">{recipient}</td>
                  {GROUPS.map((donor) => {
                    const ok = CAN_RECEIVE[recipient].includes(donor);
                    const exact = recipient === donor;
                    return (
                      <td key={donor} className="p-2 text-center">
                        {ok ? (
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
                              exact ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'
                            }`}
                            title={exact ? 'Exact match' : 'Compatible'}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <Minus className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-red-600" /> Exact match
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-red-100 border border-red-300" /> Compatible substitute
          </span>
          <span>💡 <strong>O-</strong> is the universal red cell donor &bull; <strong>AB+</strong> is the universal red cell recipient</span>
        </div>
      </CardContent>
    </Card>
  );
}

const INFO_CARDS = [
  {
    icon: Droplet,
    title: 'Blood Types & ABO/Rh System',
    body: 'There are 8 primary blood types determined by A/B antigens and the Rhesus (Rh) D-factor: A+, A-, B+, B-, AB+, AB-, O+, and O-. O- carries no antigens on red cells and can be given in trauma emergencies to any recipient.',
  },
  {
    icon: UserCheck,
    title: 'NBSC Voluntary Donor Criteria',
    list: [
      'Age between 18 and 65 years old',
      'Body weight of at least 50 kg',
      'Hemoglobin level ≥ 12.5 g/dL (tested on-site)',
      'Eaten a nutritious meal within 4 hours prior',
      'Wait at least 90 days (men) or 120 days (women) between donations',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Mandatory TTI Safety Screening',
    body: 'Under National Blood Service Commission standards, every single donated unit undergoes strict laboratory screening for 4 Transfusion-Transmissible Infections: HIV 1 & 2, Hepatitis B (HBsAg), Hepatitis C (HCV), and Syphilis (VDRL). Non-reactive blood is certified safe.',
  },
  {
    icon: Baby,
    title: 'Rhesus Factor in Obstetrics',
    body: 'If an Rh-negative mother carries an Rh-positive baby, maternal antibodies can attack the fetus in subsequent pregnancies (Hemolytic Disease of the Fetus and Newborn). Prophylactic Anti-D immunoglobulin injections protect the mother and child.',
  },
  {
    icon: TrendingUp,
    title: 'Nigerian Demand Trends',
    body: 'Group O+ is the most prevalent and requested group in Nigerian hospitals (over 45% of patients). Severe shortages occur during road travel holidays and rainy seasons, making proactive voluntary donor registration essential.',
  },
  {
    icon: HeartPulse,
    title: 'Health Benefits to Donors',
    body: 'Regular voluntary donation stimulates your bone marrow to produce fresh, active blood cells, improves cardiovascular blood flow, balances systemic iron stores, and provides free vital health check-ups at every visit.',
  },
];

const STEPS = [
  { n: 1, title: 'Registration & Vitals', body: 'Register online or on WhatsApp. At the facility, clinical staff check your weight, blood pressure, and pulse.' },
  { n: 2, title: 'Screening & Hemoglobin', body: 'A quick micro-fingerprick test checks that your hemoglobin is at or above the 12.5 g/dL safety mark.' },
  { n: 3, title: 'Gentle Donation', body: 'Donating 1 unit (~450ml) takes just 8–10 minutes using sterile, single-use, 100% disposable collection kits.' },
  { n: 4, title: 'Rest & Life Saved', body: 'Rest for 10–15 minutes while enjoying refreshments. Your single unit can save up to three lives in emergency surgery or childbirth.' },
];

export default function EducationPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
              <Droplet className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">Blood Education & Guidelines</h1>
                <Badge variant="outline" className="text-red-700 bg-red-50 border-red-200 text-[11px]">
                  NBSC Aligned
                </Badge>
              </div>
              <p className="text-sm text-gray-500">
                Official clinical guidance in accordance with the National Blood Service Commission of Nigeria
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/donor/register">
              <Button size="sm" className="bg-red-600 hover:bg-red-700">
                <HandHeart className="h-4 w-4 mr-1.5" /> Become a Donor
              </Button>
            </Link>
          </div>
        </div>

        {/* Official NBSC Information Box */}
        <Card className="bg-gradient-to-r from-red-50 to-amber-50/50 border-red-200">
          <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-red-600" />
                <h3 className="font-bold text-sm text-gray-900">
                  National Blood Service Agency (NBSC / NBSA) Standards
                </h3>
              </div>
              <p className="text-xs text-gray-600 max-w-xl leading-relaxed">
                Smart Blood Bank adheres strictly to the regulatory standards of the Federal Ministry of Health and the National Blood Service Commission. All donations are 100% voluntary, non-remunerated, and processed under standardized Transfusion-Transmissible Infection (TTI) protocols.
              </p>
            </div>
            <a
              href="https://nbsc.gov.ng/faq/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-900 hover:underline shrink-0 bg-white/80 px-3 py-2 rounded-lg border border-red-200 shadow-2xs"
            >
              NBSC Portal <ExternalLink className="h-3.5 w-3.5 ml-0.5" />
            </a>
          </CardContent>
        </Card>

        {/* Compatibility Matrix */}
        <CompatibilityMatrix />

        {/* Information Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INFO_CARDS.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.title} className="shadow-xs hover:shadow-sm transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-gray-900 text-sm font-bold">
                    <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span>{c.title}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-gray-600 leading-relaxed">
                  {c.body && <p>{c.body}</p>}
                  {c.list && (
                    <ul className="space-y-1.5 mt-1">
                      {c.list.map((li) => (
                        <li key={li} className="flex items-start gap-1.5">
                          <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                          <span>{li}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Donation journey */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold text-gray-900">
              <HeartPulse className="h-5 w-5 text-red-600" /> The 4-Step Clinical Donation Journey
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <div key={s.n} className="rounded-xl border border-gray-200 p-4 bg-white space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 font-bold text-sm flex items-center justify-center">
                    {s.n}
                  </div>
                  <h4 className="font-bold text-gray-900 text-sm">{s.title}</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Enriched NBSC Frequently Asked Questions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold text-gray-900">
              <HelpCircle className="h-5 w-5 text-red-600" />
              Frequently Asked Questions (Official NBSC Standards)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full space-y-1">
              <AccordionItem value="nbsc-eligibility">
                <AccordionTrigger className="text-left font-medium text-sm text-gray-900">
                  Who is eligible to donate blood under Nigerian regulations?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-gray-600 leading-relaxed space-y-1">
                  <p>According to the National Blood Service Commission (NBSC), an individual can donate if they:</p>
                  <ul className="list-disc pl-5 space-y-1 mt-1">
                    <li>Are between <strong>18 and 65 years old</strong></li>
                    <li>Weigh at least <strong>50 kg</strong></li>
                    <li>Have a hemoglobin concentration of at least <strong>12.5 g/dL</strong></li>
                    <li>Lead a healthy, sexually safe lifestyle</li>
                    <li>Have eaten a nutritious meal within the last 4 hours prior to donation</li>
                    <li>Have not donated blood in the past 90 days (for men) or 120 days (for women)</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="nbsc-volume">
                <AccordionTrigger className="text-left font-medium text-sm text-gray-900">
                  How much blood is collected in a single donation?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-gray-600 leading-relaxed">
                  Only <strong>one unit (~450 ml)</strong> of blood is collected per donation. The average adult body contains approximately 4.5 to 5.5 liters of blood, meaning a donation represents only about 8% to 10% of total volume. Your body replaces the fluid volume within 24 hours.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="nbsc-sold">
                <AccordionTrigger className="text-left font-medium text-sm text-gray-900">
                  Is blood sold in Nigeria, and what is the subsidized &quot;access fee&quot;?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-gray-600 leading-relaxed">
                  <strong>Blood is never sold.</strong> Donated blood is given voluntarily without payment. However, testing, screening, processing, specialized preservative bags, and refrigerated cold-chain storage incur significant logistical costs. Hospitals and blood banks charge a highly subsidized laboratory &quot;access fee&quot; solely to cover these essential safety consumables and screening reagents.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="nbsc-tti">
                <AccordionTrigger className="text-left font-medium text-sm text-gray-900">
                  What mandatory laboratory tests are run on every donated unit?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-gray-600 leading-relaxed space-y-1">
                  <p>Every unit undergoes strict Transfusion-Transmissible Infection (TTI) testing using automated fourth-generation ELISA or rapid test algorithms for:</p>
                  <ul className="list-disc pl-5 space-y-1 mt-1">
                    <li><strong>HIV 1 & 2</strong> antibodies and antigen</li>
                    <li><strong>Hepatitis B Surface Antigen (HBsAg)</strong></li>
                    <li><strong>Hepatitis C Virus (HCV)</strong> antibodies</li>
                    <li><strong>Syphilis (VDRL/Treponema)</strong></li>
                  </ul>
                  <p className="mt-1">In addition, ABO blood grouping and Rhesus D typing are cross-matched with secondary confirmation before issuance.</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="nbsc-safety">
                <AccordionTrigger className="text-left font-medium text-sm text-gray-900">
                  Can I contract HIV or an infection by donating blood?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-gray-600 leading-relaxed">
                  <strong>No, absolutely not.</strong> Every needle, tubing set, and blood collection bag is completely sterile, factory sealed, and used strictly once for you before being safely incinerated according to biohazard protocols. You cannot catch HIV, hepatitis, or any other pathogen by donating blood.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="nbsc-weakness">
                <AccordionTrigger className="text-left font-medium text-sm text-gray-900">
                  Does donating blood cause weakness or weight loss?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-gray-600 leading-relaxed">
                  No. Donating blood does not cause weight loss or chronic weakness. Your body actively regenerates white blood cells and platelets within days, and red blood cells within weeks. In fact, donating stimulates hematopoiesis (the production of new, fresh blood cells) and promotes healthy cardiovascular circulation.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="nbsc-prep">
                <AccordionTrigger className="text-left font-medium text-sm text-gray-900">
                  What should I eat or do before and after donating blood?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-gray-600 leading-relaxed">
                  <strong>Before:</strong> Drink plenty of water or healthy fluids, eat a meal rich in iron and proteins within 4 hours prior, and avoid alcohol for 24 hours.
                  <br className="my-1" />
                  <strong>After:</strong> Rest in the donor recovery area for 10–15 minutes, consume the provided malt/juice drink, keep the pressure bandage in place for 2–4 hours, and avoid intense athletic exercise or heavy lifting for 12 hours.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="nbsc-medical">
                <AccordionTrigger className="text-left font-medium text-sm text-gray-900">
                  Can I donate if I have high blood pressure or take medications?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-gray-600 leading-relaxed">
                  Donors with well-controlled high blood pressure (systolic ≤ 160 mmHg and diastolic ≤ 100 mmHg) on maintenance medications are typically eligible to donate. If you have allergies, take antibiotics for an active infection, or recently had a dental extraction or tattoo, temporary deferral periods apply. Our medical team reviews this during on-site screening.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="nbsc-contact">
                <AccordionTrigger className="text-left font-medium text-sm text-gray-900">
                  How can I contact the National Blood Service Agency (NBSC)?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-gray-600 leading-relaxed space-y-1">
                  <p><strong>National Blood Service Agency (NBSC / NBSA) Headquarters:</strong></p>
                  <p>📍 Plot 621, Road 37, 3rd Avenue, Gwarinpa, Abuja, Nigeria</p>
                  <p>📞 Customer Care & Donor Helpdesk: <a href="tel:07088370905" className="text-red-600 font-semibold underline">07088370905</a></p>
                  <p>✉️ Email: <a href="mailto:info@nbsc.gov.ng" className="text-red-600 underline">info@nbsc.gov.ng</a></p>
                  <p>🌐 Official Website: <a href="https://nbsc.gov.ng" target="_blank" rel="noopener noreferrer" className="text-red-600 underline">nbsc.gov.ng</a></p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* CTA */}
        <Card className="bg-red-50/70 border-red-200">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <h3 className="font-bold text-gray-900">Ready to Save Lives in Your Community?</h3>
              <p className="text-xs text-gray-600">Register as a voluntary donor today or request urgent units for a patient.</p>
            </div>
            <div className="flex gap-2.5 shrink-0">
              <Link href="/donor/register">
                <Button className="bg-red-600 hover:bg-red-700">
                  <HandHeart className="h-4 w-4 mr-1.5" /> Become a Donor
                </Button>
              </Link>
              <Link href="/request">
                <Button variant="outline">
                  <Search className="h-4 w-4 mr-1.5" /> Request Blood
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
