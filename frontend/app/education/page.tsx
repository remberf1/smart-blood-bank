'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export default function EducationPage() {
  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-center mb-2">Blood Education Center</h1>
      <p className="text-center text-gray-500 mb-8">Learn about blood types, donation, and health implications</p>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>🩸 Blood Types & Compatibility</CardTitle>
          </CardHeader>
          <CardContent>
            <p>There are 8 main blood types: A+, A-, B+, B-, AB+, AB-, O+, O-.</p>
            <p className="mt-2">Type O- is the universal donor (can give to anyone). Type AB+ is the universal recipient (can receive from anyone).</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>💍 Rhesus Factor & Pregnancy</CardTitle>
          </CardHeader>
          <CardContent>
            <p>If a mother is Rh-negative and the father is Rh-positive, the baby may inherit Rh-positive blood. This can cause complications in subsequent pregnancies if untreated. Anti-D injection can prevent it.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>❤️ Who Can Donate?</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc ml-4">
              <li>Age 18–65</li>
              <li>Weight ≥ 50 kg</li>
              <li>Healthy, no infections</li>
              <li>Last donation ≥ 90 days ago</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>📊 Blood Demand Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <p>O+ is the most commonly needed blood type. AB- is the rarest. Hospitals often face shortages during holidays and rainy seasons due to fewer donors.</p>
          </CardContent>
        </Card>
      </div>

      <Accordion type="single" collapsible className="mt-8">
        <AccordionItem value="item-1">
          <AccordionTrigger>❓ Frequently Asked Questions</AccordionTrigger>
          <AccordionContent>
            <ul className="list-disc ml-4 space-y-2">
              <li><strong>Can I donate if I have high blood pressure?</strong> – Only if well-controlled.</li>
              <li><strong>Does donating blood hurt?</strong> – A small pinch; most donors feel fine.</li>
              <li><strong>How long does it take to recover?</strong> – Your body replaces blood volume within 24 hours; red cells in 4–6 weeks.</li>
              <li><strong>Can I get HIV from donating?</strong> – No, all equipment is sterile and single-use.</li>
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}