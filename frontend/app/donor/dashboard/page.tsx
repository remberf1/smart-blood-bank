'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast, Toaster } from 'react-hot-toast';
import apiClient from '../../api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Droplet, LogOut, CalendarPlus, CalendarClock, User, Phone, Mail,
  ShieldCheck, Clock, MapPin,
} from 'lucide-react';

interface DonorProfile {
  _id: string; name: string; email: string; phone: string; bloodGroup: string;
  eligibilityStatus: string; lastDonationDate: string | null; sosOptIn: boolean; createdAt: string;
}
interface Hospital { _id: string; name: string; address: string; contactPhone: string }
interface Appointment { _id: string; hospitalId: Hospital; appointmentDate: string; status: string; notes?: string }

const statusLabel = (s: string) =>
  s === 'pending' ? 'Awaiting confirmation' : s === 'scheduled' ? 'Confirmed' : s.charAt(0).toUpperCase() + s.slice(1);
const isActive = (s: string) => s === 'pending' || s === 'scheduled';

function ApptStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
    missed: 'bg-gray-200 text-gray-700',
  };
  return <Badge className={map[status] || ''}>{statusLabel(status)}</Badge>;
}

export default function DonorDashboard() {
  const [donor, setDonor] = useState<DonorProfile | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [formData, setFormData] = useState({ hospitalId: '', appointmentDate: '', notes: '' });
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('donorToken');
    if (!token) { router.push('/donor/login'); return; }
    Promise.all([
      apiClient.get('/donor/auth/profile'),
      apiClient.get('/hospitals'),
      apiClient.get('/donor/appointments'),
    ])
      .then(([p, h, a]) => { setDonor(p.data); setHospitals(h.data); setAppointments(a.data); })
      .catch(() => { localStorage.removeItem('donorToken'); router.push('/donor/login'); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAppointments = async () => {
    const r = await apiClient.get('/donor/appointments');
    setAppointments(r.data);
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setBooking(true);
    try {
      await apiClient.post('/donor/appointments', formData);
      toast.success('Appointment requested — the hospital will confirm it shortly.');
      setFormData({ hospitalId: '', appointmentDate: '', notes: '' });
      await refreshAppointments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to request appointment');
    } finally {
      setBooking(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this appointment?')) return;
    try {
      await apiClient.delete(`/donor/appointments/${id}`);
      toast.success('Appointment cancelled');
      await refreshAppointments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to cancel');
    }
  };

  const handleLogout = () => { localStorage.removeItem('donorToken'); router.push('/donor/login'); };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
      </div>
    );
  }
  if (!donor) return null;

  const lastDonation = donor.lastDonationDate ? new Date(donor.lastDonationDate).toLocaleDateString() : 'Never';
  const daysUntilEligible = (() => {
    if (donor.eligibilityStatus === 'eligible' || !donor.lastDonationDate) return 0;
    const since = (Date.now() - new Date(donor.lastDonationDate).getTime()) / 86400000;
    return Math.max(0, Math.ceil(90 - since));
  })();

  const eligibilityBadge =
    donor.eligibilityStatus === 'eligible'
      ? <Badge className="bg-emerald-100 text-emerald-700">Eligible to donate</Badge>
      : donor.eligibilityStatus === 'deferred'
      ? <Badge className="bg-amber-100 text-amber-700">Deferred</Badge>
      : <Badge className="bg-gray-100 text-gray-600">{donor.eligibilityStatus}</Badge>;

  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const upcoming = appointments.filter((a) => isActive(a.status) && new Date(a.appointmentDate) > new Date());
  const past = appointments.filter((a) => !isActive(a.status) || new Date(a.appointmentDate) <= new Date());

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />
      {/* Top bar */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-red-600 rounded-xl flex items-center justify-center">
              <Droplet className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800 leading-none">Donor Portal</h1>
              <p className="text-xs text-gray-400">Smart Blood Bank</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" /> Logout
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Hero / profile */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-red-600 to-red-500 p-6 text-white">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-red-100 text-sm">Welcome back,</p>
                <h2 className="text-2xl font-bold">{donor.name}</h2>
              </div>
              <div className="flex items-center gap-2 bg-white/15 rounded-xl px-4 py-2">
                <Droplet className="h-6 w-6" />
                <span className="text-2xl font-bold">{donor.bloodGroup}</span>
              </div>
            </div>
          </div>
          <CardContent className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              {eligibilityBadge}
              {donor.eligibilityStatus === 'deferred' && daysUntilEligible > 0 && (
                <span className="text-sm text-amber-700 flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Eligible again in ~{daysUntilEligible} day{daysUntilEligible === 1 ? '' : 's'}
                </span>
              )}
              {donor.eligibilityStatus === 'eligible' && (
                <span className="text-sm text-emerald-700 flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4" /> You can book a donation now
                </span>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <Info icon={Mail} label="Email" value={donor.email} />
              <Info icon={Phone} label="Phone" value={donor.phone} />
              <Info icon={CalendarClock} label="Last donation" value={lastDonation} />
              <Info icon={ShieldCheck} label="SOS alerts" value={donor.sosOptIn ? 'Opted in' : 'Off'} />
            </div>
          </CardContent>
        </Card>

        {/* Book appointment */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-red-500" /> Book a donation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSchedule} className="space-y-4">
              <div>
                <Label>Hospital</Label>
                <select
                  value={formData.hospitalId}
                  onChange={(e) => setFormData({ ...formData, hospitalId: e.target.value })}
                  className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  required
                >
                  <option value="">Select a hospital</option>
                  {hospitals.map((h) => <option key={h._id} value={h._id}>{h.name} — {h.address}</option>)}
                </select>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Date &amp; time</Label>
                  <Input type="datetime-local" min={nowLocal} value={formData.appointmentDate}
                    onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })} required />
                </div>
                <div>
                  <Label>Notes (optional)</Label>
                  <Input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Anything the hospital should know" />
                </div>
              </div>
              <Button type="submit" disabled={booking}>{booking ? 'Requesting…' : 'Request appointment'}</Button>
            </form>
          </CardContent>
        </Card>

        {/* Upcoming */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-blue-500" /> Upcoming appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-400">No upcoming appointments — book one above.</p>
            ) : (
              <ul className="divide-y">
                {upcoming.map((a) => (
                  <li key={a._id} className="py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-800 flex items-center gap-1">
                        <MapPin className="h-4 w-4 text-gray-400" /> {a.hospitalId?.name}
                      </p>
                      <p className="text-sm text-gray-500">{new Date(a.appointmentDate).toLocaleString()}</p>
                      {a.notes && <p className="text-xs text-gray-400 mt-0.5">Note: {a.notes}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <ApptStatusBadge status={a.status} />
                      <button onClick={() => handleCancel(a._id)} className="text-red-600 text-xs hover:underline">Cancel</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Past */}
        {past.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-600">History</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {past.map((a) => (
                  <li key={a._id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-700">{a.hospitalId?.name}</p>
                      <p className="text-sm text-gray-400">{new Date(a.appointmentDate).toLocaleString()}</p>
                    </div>
                    <ApptStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function Info({ icon: Icon, label, value }: any) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-gray-300 shrink-0" />
      <span className="text-gray-400">{label}:</span>
      <span className="text-gray-700 font-medium truncate">{value}</span>
    </div>
  );
}
