'use client';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  Droplet, ArrowLeft, HeartPulse, Baby, UserCheck, TrendingUp,
  Check, Minus, HandHeart, Search,
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
          <Droplet className="h-5 w-5 text-primary" /> Who can receive from whom
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Rows are the <strong>recipient</strong>; a check means they can safely receive red cells
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
                              exact ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
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
            <span className="inline-block h-3 w-3 rounded-full bg-primary" /> Exact match
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-primary/10" /> Compatible substitute
          </span>
          <span>💡 O- is the universal donor · AB+ is the universal recipient</span>
        </div>
      </CardContent>
    </Card>
  );
}

const INFO_CARDS = [
  {
    icon: Droplet,
    title: 'Blood types & compatibility',
    body: 'There are 8 main blood types: A+, A-, B+, B-, AB+, AB-, O+, O-. O- is the universal donor (can give to anyone); AB+ is the universal recipient (can receive from anyone).',
  },
  {
    icon: Baby,
    title: 'Rhesus factor & pregnancy',
    body: 'If a mother is Rh-negative and the father is Rh-positive, the baby may inherit Rh-positive blood — which can cause complications in later pregnancies if untreated. An Anti-D injection prevents it.',
  },
  {
    icon: UserCheck,
    title: 'Who can donate?',
    list: ['Age 18–65', 'Weight ≥ 50 kg', 'Healthy, no active infections', 'Last donation ≥ 90 days ago'],
  },
  {
    icon: TrendingUp,
    title: 'Blood demand trends',
    body: 'O+ is the most commonly needed type; AB- is the rarest. Hospitals often face shortages during holidays and the rainy season, when fewer donors turn up.',
  },
];

const STEPS = [
  { n: 1, title: 'Register', body: 'Sign up online or via WhatsApp with your blood group and location.' },
  { n: 2, title: 'Screening', body: 'A quick health check confirms you are eligible to donate safely.' },
  { n: 3, title: 'Donate', body: 'The donation itself takes about 8–10 minutes. You rest and refuel afterwards.' },
  { n: 4, title: 'Save lives', body: 'One donation can help up to three patients. We alert you when you can give again.' },
];

export default function EducationPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 bg-primary rounded-xl flex items-center justify-center shrink-0">
            <Droplet className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Blood Education Center</h1>
            <p className="text-sm text-muted-foreground">Understand blood types, donation, and how you can help</p>
          </div>
        </div>

        <div className="space-y-6">
          <CompatibilityMatrix />

          <div className="grid gap-6 md:grid-cols-2">
            {INFO_CARDS.map((c) => {
              const Icon = c.icon;
              return (
                <Card key={c.title}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground text-base">
                      <Icon className="h-5 w-5 text-primary" /> {c.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {c.body && <p>{c.body}</p>}
                    {c.list && (
                      <ul className="space-y-1.5">
                        {c.list.map((li) => (
                          <li key={li} className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> {li}
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
              <CardTitle className="flex items-center gap-2 text-foreground">
                <HeartPulse className="h-5 w-5 text-primary" /> The donation journey
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map((s) => (
                  <div key={s.n} className="relative rounded-lg border border-border p-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center mb-2">
                      {s.n}
                    </div>
                    <h3 className="font-semibold text-foreground text-sm mb-1">{s.title}</h3>
                    <p className="text-xs text-muted-foreground">{s.body}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Frequently asked questions</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible>
                <AccordionItem value="bp">
                  <AccordionTrigger>Can I donate if I have high blood pressure?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Yes, as long as it is well-controlled and within acceptable limits on the day of donation.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="hurt">
                  <AccordionTrigger>Does donating blood hurt?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Only a small pinch when the needle goes in. Most donors feel completely fine throughout.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="recover">
                  <AccordionTrigger>How long does it take to recover?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Your body replaces the fluid within 24 hours; red cells are fully restored in 4–6 weeks. That is
                    why we ask you to wait at least 90 days between donations.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="hiv">
                  <AccordionTrigger>Can I get an infection from donating?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    No. All equipment is sterile and single-use, then safely discarded. You cannot catch HIV or any
                    other infection by donating blood.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          {/* CTA */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <h3 className="font-bold text-foreground">Ready to make a difference?</h3>
                <p className="text-sm text-muted-foreground">Register as a donor, or request blood for a patient in need.</p>
              </div>
              <div className="flex gap-3 shrink-0">
                <Link href="/donor/register">
                  <Button><HandHeart className="h-4 w-4 mr-1" /> Become a donor</Button>
                </Link>
                <Link href="/request">
                  <Button variant="outline"><Search className="h-4 w-4 mr-1" /> Request blood</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
