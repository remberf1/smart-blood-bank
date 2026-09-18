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
    doctorName: '',
    doctorPhone: '',
    clinicalAcknowledged: false,
    resourceType: 'blood' as 'blood' | 'oxygen',
    bloodGroup: '',
    units: 1,
    urgency: 'routine' as 'scheduled' | 'routine',
    scheduledTime: '',
    preferredHospitalId: '',
    destinationFacility: '',
    ward: '',
    bedNumber: '',
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
    if (!form.doctorName.trim()) {
      setError('Please provide the attending doctor or clinician name.');
      return;
    }
    if (!form.clinicalAcknowledged) {
      setError('You must confirm that this requisition is ordered by a licensed physician for in-hospital administration.');
      return;
    }
    if (form.urgency === 'scheduled' && !form.scheduledTime) {
      setError('Please select the scheduled date and time for the transfusion.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        contactPhone: form.contactPhone,
        resourceType: form.resourceType,
        units: form.units,
        urgency: form.urgency,
        doctorName: form.doctorName.trim(),
      };
      if (form.patientName) payload.patientName = form.patientName;
      if (form.doctorPhone) payload.doctorPhone = form.doctorPhone.trim();
      if (form.email) payload.email = form.email;
      if (form.resourceType === 'blood') payload.bloodGroup = form.bloodGroup;
      if (form.urgency === 'scheduled' && form.scheduledTime) payload.scheduledTime = form.scheduledTime;
      if (form.preferredHospitalId) payload.preferredHospitalId = form.preferredHospitalId;
      if (form.destinationFacility) payload.destinationFacility = form.destinationFacility;
      if (form.ward) payload.ward = form.ward;
      if (form.bedNumber) payload.bedNumber = form.bedNumber;
      if (form.notes) payload.notes = form.notes;

      const res = await apiClient.post('/patient-requests', payload);
      const id: string = res.data.referenceId || res.data.requestId || res.data.request?._id || '';
      setDone({ ref: id.startsWith('SBB-') ? id : id.slice(-6).toUpperCase() });
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

        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 text-amber-950 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">⚠️</span>
            <div>
              <h3 className="font-bold text-sm text-amber-900">Strict Clinical &amp; Anti-Self-Medication Notice</h3>
              <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
                Blood transfusion and medical oxygen therapy are <strong>prescription-only hospital procedures</strong> under National Blood Service Commission (NBSC) and MDCN standards.
                Self-medication or home delivery is strictly prohibited. All blood units are dispatched exclusively to accredited hospital blood banks for physician administration.
              </p>
            </div>
          </div>
        </div>

        {done ? (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <h2 className="text-lg font-bold text-gray-800">Requisition Received</h2>
              <p className="text-gray-600 text-sm">
                Reference ID: <strong className="text-red-600 font-mono text-base">{done.ref || 'submitted'}</strong>.
              </p>
              <p className="text-gray-600 text-xs">
                Show this reference ID to Dr. {form.doctorName || 'your attending physician'} or the hospital blood bank to coordinate clinical transfer.
                We&apos;ll notify you {form.email ? 'by WhatsApp and email' : 'by WhatsApp'} as the transfer progresses.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                <Link
                  href={`/track?query=${done.ref}`}
                  className="inline-flex items-center justify-center h-10 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90"
                >
                  Track This Request Live
                </Link>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDone(null);
                    setForm({
                      ...form,
                      notes: '',
                      destinationFacility: '',
                      ward: '',
                      bedNumber: '',
                    });
                  }}
                >
                  Submit another request
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HeartPulse className="h-5 w-5 text-red-500" /> New clinical requisition
              </CardTitle>
            </CardHeader>
            <CardContent>
              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Attending Physician & Clinical Order Safeguard */}
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3.5 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <span>🩺</span> Attending Physician &amp; Clinical Order
                  </p>
                  <div>
                    <Label className="text-xs font-medium">Attending Doctor&apos;s Name *</Label>
                    <Input
                      value={form.doctorName}
                      onChange={(e) => set({ doctorName: e.target.value })}
                      placeholder="e.g. Dr. A. Adeleke"
                      className="mt-1 bg-white"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Doctor&apos;s Phone / Folio (Optional)</Label>
                    <Input
                      value={form.doctorPhone}
                      onChange={(e) => set({ doctorPhone: e.target.value })}
                      placeholder="e.g. 08012345678"
                      className="mt-1 bg-white"
                    />
                  </div>
                  <div className="flex items-start gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="clinicalAck"
                      checked={form.clinicalAcknowledged}
                      onChange={(e) => set({ clinicalAcknowledged: e.target.checked })}
                      className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                      required
                    />
                    <label htmlFor="clinicalAck" className="text-xs text-gray-700 leading-relaxed cursor-pointer">
                      I confirm this requisition is ordered or supervised by a licensed medical doctor for in-hospital administration. I understand that blood cannot be delivered to private residences and self-medication is strictly prohibited.
                    </label>
                  </div>
                </div>

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
                      <option value="scheduled">Scheduled</option>
                      <option value="routine">Routine</option>
                    </select>
                  </div>
                </div>

                {form.urgency === 'scheduled' && (
                  <div>
                    <Label>Scheduled Date &amp; Time *</Label>
                    <Input
                      type="datetime-local"
                      value={form.scheduledTime}
                      onChange={(e) => set({ scheduledTime: e.target.value })}
                      required
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Specify when the procedure, surgery, or transfusion is scheduled.
                    </p>
                  </div>
                )}

                {/* Emergencies go through SOS (alerts donors directly), not a
                    standard hospital request — so it's a callout, not an option. */}
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                  <p className="text-red-800 font-medium">Is this a life-threatening emergency?</p>
                  <p className="text-red-700 mt-0.5">
                    Don&apos;t wait on a standard request — raise an SOS to alert nearby compatible donors immediately.
                  </p>
                  <Link
                    href={`/sos${form.resourceType === 'blood' && form.bloodGroup ? `?group=${encodeURIComponent(form.bloodGroup)}` : ''}`}
                    className="mt-2 inline-flex items-center justify-center h-9 px-4 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700"
                  >
                    Raise an emergency SOS
                  </Link>
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

                <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Destination &amp; Bed Details (Optional)</p>
                  <div>
                    <Label className="text-xs">Destination Facility / Hospital</Label>
                    <Input
                      value={form.destinationFacility}
                      onChange={(e) => set({ destinationFacility: e.target.value })}
                      placeholder="e.g. OAUTHC Ward 4, SDA Hospital Ile-Ife"
                      className="mt-1 bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Ward / Unit</Label>
                      <Input
                        value={form.ward}
                        onChange={(e) => set({ ward: e.target.value })}
                        placeholder="e.g. ICU, Female Surgical"
                        className="mt-1 bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Bed / Room No.</Label>
                      <Input
                        value={form.bedNumber}
                        onChange={(e) => set({ bedNumber: e.target.value })}
                        placeholder="e.g. Bed 06"
                        className="mt-1 bg-white"
                      />
                    </div>
                  </div>
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
