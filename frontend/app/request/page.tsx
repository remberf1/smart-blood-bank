'use client';
import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Droplet, CheckCircle2, HeartPulse, ArrowLeft } from 'lucide-react';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
interface Hospital { _id: string; name: string }

export default function PublicRequestPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ ref: string } | null>(null);
  const [form, setForm] = useState({
    patientName: '',
    contactPhone: '',
    email: '',
    resourceType: 'blood' as 'blood' | 'oxygen',
    bloodGroup: '',
    units: 1,
    urgency: 'emergency' as 'emergency' | 'scheduled' | 'routine',
    preferredHospitalId: '',
    notes: '',
  });

  useEffect(() => {
    apiClient.get('/hospitals').then((r) => setHospitals(r.data)).catch(() => {});
  }, []);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.resourceType === 'blood' && !form.bloodGroup) {
      setError('Please select a blood group.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        contactPhone: form.contactPhone,
        resourceType: form.resourceType,
        units: form.units,
        urgency: form.urgency,
      };
      if (form.patientName) payload.patientName = form.patientName;
      if (form.email) payload.email = form.email;
      if (form.resourceType === 'blood') payload.bloodGroup = form.bloodGroup;
      if (form.preferredHospitalId) payload.preferredHospitalId = form.preferredHospitalId;
      if (form.notes) payload.notes = form.notes;

      const res = await apiClient.post('/patient-requests', payload);
      const id: string = res.data.requestId || res.data.request?._id || '';
      setDone({ ref: id.slice(-6).toUpperCase() });
    } catch (err: any) {
      setError(
        err.response?.data?.details?.[0]?.message ||
        err.response?.data?.error ||
        'Something went wrong. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <Droplet className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Smart Blood Bank</h1>
            <p className="text-xs text-gray-400">Request blood or oxygen</p>
          </div>
        </div>

        {done ? (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <h2 className="text-lg font-bold text-gray-800">Request received</h2>
              <p className="text-gray-600">
                Your reference is <strong>{done.ref || 'submitted'}</strong>. A hospital will be matched
                shortly and we&apos;ll notify you
                {form.email ? ' by WhatsApp and email' : ' by WhatsApp'} as your request progresses.
              </p>
              <Button variant="outline" onClick={() => { setDone(null); setForm({ ...form, notes: '' }); }}>
                Submit another request
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HeartPulse className="h-5 w-5 text-red-500" /> New request
              </CardTitle>
            </CardHeader>
            <CardContent>
              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Patient name (optional)</Label>
                  <Input value={form.patientName} onChange={(e) => set({ patientName: e.target.value })} placeholder="e.g. Jane Doe" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Contact phone *</Label>
                    <Input value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} placeholder="08012345678" required />
                  </div>
                  <div>
                    <Label>Email (for updates)</Label>
                    <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@example.com" />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Resource</Label>
                    <select
                      value={form.resourceType}
                      onChange={(e) => set({ resourceType: e.target.value as 'blood' | 'oxygen', bloodGroup: '' })}
                      className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="blood">Blood</option>
                      <option value="oxygen">Oxygen</option>
                    </select>
                  </div>
                  {form.resourceType === 'blood' && (
                    <div>
                      <Label>Blood group *</Label>
                      <select
                        value={form.bloodGroup}
                        onChange={(e) => set({ bloodGroup: e.target.value })}
                        className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                        required
                      >
                        <option value="">Select group</option>
                        {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Units</Label>
                    <Input type="number" min={1} value={form.units} onChange={(e) => set({ units: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div>
                    <Label>Urgency</Label>
                    <select
                      value={form.urgency}
                      onChange={(e) => set({ urgency: e.target.value as any })}
                      className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="emergency">Emergency</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="routine">Routine</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label>Preferred hospital (optional)</Label>
                  <select
                    value={form.preferredHospitalId}
                    onChange={(e) => set({ preferredHospitalId: e.target.value })}
                    className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">No preference</option>
                    {hospitals.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
                  </select>
                </div>

                <div>
                  <Label>Notes (optional)</Label>
                  <Input value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Any details that help" />
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit request'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
