'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast, Toaster } from 'react-hot-toast';
import apiClient from '../../api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Droplet, LogOut, CalendarPlus, CalendarClock, Phone, Mail,
  ShieldCheck, Clock, MapPin, Pencil, KeyRound, QrCode, Download, Award,
  Navigation, AlertCircle, AlertTriangle,
} from 'lucide-react';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

interface DonorProfile {
  _id: string; name: string; email: string; phone: string; bloodGroup: string;
  eligibilityStatus: string; lastDonationDate: string | null; sosOptIn: boolean; createdAt: string;
  qrCode?: string;
  ninMasked?: string;
  location?: { type: string; coordinates: [number, number] };
  allergies?: string;
}
interface Hospital { _id: string; name: string; address: string; contactPhone: string }
interface Appointment {
  _id: string;
  hospitalId: Hospital;
  appointmentDate: string;
  assignedDate?: string;
  assignedTime?: string;
  timeSlot?: string;
  preferredDay?: string;
  preferredWindow?: string;
  status: string;
  notes?: string;
}

const statusLabel = (s: string) =>
  s === 'pending' ? 'Offer submitted' : s === 'scheduled' ? 'Confirmed' : s.charAt(0).toUpperCase() + s.slice(1);
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
  const [nowMs, setNowMs] = useState(0);
  const [formData, setFormData] = useState({
    hospitalId: '',
    appointmentDate: '',
    preferredWindow: 'morning',
    notes: '',
  });
  const router = useRouter();

  // Digital Donor Pass & Certificate
  const [qrOpen, setQrOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const handleDownloadPass = () => {
    if (!donor?.qrCode) return;
    const link = document.createElement('a');
    link.href = donor.qrCode;
    link.download = `Donor-Pass-${(donor.name || 'Donor').replace(/\s+/g, '_')}-${donor.bloodGroup}.png`;
    link.click();
  };

  // Profile editing + password change + GPS location
  const [profileOpen, setProfileOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
    bloodGroup: '',
    allergies: '',
    sosOptIn: true,
    location: null as { type: string; coordinates: [number, number] } | null,
  });
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  const [cancelingAppt, setCancelingAppt] = useState<{ id: string; hospitalName?: string; date?: string } | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const openProfile = () => {
    if (!donor) return;
    setProfileForm({
      name: donor.name,
      email: donor.email || '',
      phone: donor.phone,
      bloodGroup: donor.bloodGroup || '',
      allergies: donor.allergies || '',
      sosOptIn: donor.sosOptIn,
      location: donor.location || null,
    });
    setLocMsg('');
    setProfileOpen(true);
  };

  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setDetectingLocation(true);
    setLocMsg('Detecting current GPS coordinates…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setProfileForm((prev) => ({
          ...prev,
          location: { type: 'Point', coordinates: coords },
        }));
        setDetectingLocation(false);
        setLocMsg(`Detected: ${coords[1].toFixed(4)}° N, ${coords[0].toFixed(4)}° E ✓`);
        toast.success('Current location detected!');
      },
      () => {
        setDetectingLocation(false);
        setLocMsg('Could not detect location. Please allow browser location access.');
        toast.error('Location detection failed. Check permissions.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const saveProfile = async () => {
    if (profileForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileForm.email.trim())) {
      toast.error('Please enter a valid email address (e.g., name@example.com).');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await apiClient.put('/donor/auth/profile', profileForm);
      const d = res.data.donor;
      setDonor((prev) => (prev ? {
        ...prev,
        name: d.name,
        email: d.email,
        phone: d.phone,
        bloodGroup: d.bloodGroup,
        qrCode: d.qrCode || prev.qrCode,
        sosOptIn: d.sosOptIn,
        location: d.location,
        allergies: d.allergies,
      } : prev));
      toast.success('Profile updated');
      setProfileOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    if (pwForm.newPassword.length < 8) { toast.error('New password must be at least 8 characters.'); return; }
    if (pwForm.newPassword !== pwForm.confirm) { toast.error('Passwords do not match.'); return; }
    setSavingPw(true);
    try {
      await apiClient.post('/donor/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      toast.success('Password changed');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      setPwOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSavingPw(false);
    }
  };

  useEffect(() => {
    setNowMs(Date.now());
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
      await apiClient.post('/donor/appointments', {
        hospitalId: formData.hospitalId,
        appointmentDate: formData.appointmentDate ? formData.appointmentDate : undefined,
        preferredWindow: formData.preferredWindow,
        notes: formData.notes,
      });
      toast.success('Donation offer submitted! The hospital blood bank will assign your date and time.');
      setFormData({ hospitalId: '', appointmentDate: '', preferredWindow: 'morning', notes: '' });
      await refreshAppointments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit donation offer');
    } finally {
      setBooking(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelingAppt) return;
    setCanceling(true);
    try {
      await apiClient.delete(`/donor/appointments/${cancelingAppt.id}`);
      toast.success('Appointment cancelled');
      setCancelingAppt(null);
      await refreshAppointments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to cancel appointment');
    } finally {
      setCanceling(false);
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
    const current = nowMs || new Date(donor.lastDonationDate).getTime();
    const since = (current - new Date(donor.lastDonationDate).getTime()) / 86400000;
    return Math.max(0, Math.ceil(90 - since));
  })();

  const eligibilityBadge =
    donor.eligibilityStatus === 'eligible'
      ? <Badge className="bg-emerald-100 text-emerald-700">Eligible to donate</Badge>
      : donor.eligibilityStatus === 'deferred'
      ? <Badge className="bg-amber-100 text-amber-700">Deferred</Badge>
      : <Badge className="bg-gray-100 text-gray-600">{donor.eligibilityStatus}</Badge>;

  const nowLocal = nowMs
    ? new Date(nowMs - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : '';
  const upcoming = appointments.filter((a) => isActive(a.status) && (nowMs ? new Date(a.appointmentDate).getTime() > nowMs : true));
  const past = appointments.filter((a) => !isActive(a.status) || (nowMs ? new Date(a.appointmentDate).getTime() <= nowMs : false));

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" toastOptions={{ duration: 5000, error: { duration: 6500 } }} />
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
              <button
                type="button"
                onClick={openProfile}
                title="Wrong entry? Click to edit blood group"
                className="flex items-center gap-2 bg-white/20 hover:bg-white/30 transition-all rounded-xl px-4 py-2 text-white border border-white/30 shadow-sm cursor-pointer group"
              >
                <Droplet className="h-6 w-6" />
                <span className="text-2xl font-bold">{donor.bloodGroup}</span>
                <span className="text-[10px] bg-black/20 group-hover:bg-black/40 px-1.5 py-0.5 rounded ml-1 transition-colors flex items-center gap-0.5">
                  <Pencil className="h-2.5 w-2.5" /> Edit
                </span>
              </button>
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
              <Info
                icon={MapPin}
                label="GPS Location"
                value={
                  donor.location?.coordinates
                    ? `${donor.location.coordinates[1].toFixed(2)}° N, ${donor.location.coordinates[0].toFixed(2)}° E`
                    : 'Lagos (Default)'
                }
              />
              <Info icon={AlertCircle} label="Allergies" value={donor.allergies || 'None reported'} />
              <Info icon={ShieldCheck} label="NIN (NDPA Protected)" value={donor.ninMasked || 'Verified on file'} />
              <Info icon={ShieldCheck} label="SOS alerts" value={donor.sosOptIn ? 'Opted in (15km radius)' : 'Off'} />
            </div>
            <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
              <Button
                variant="default"
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white font-medium"
                onClick={() => setQrOpen(true)}
              >
                <QrCode className="h-4 w-4 mr-1.5" /> View Digital Donor Pass
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCertOpen(true)}>
                <Award className="h-4 w-4 mr-1 text-amber-500" /> Donor Certificate
              </Button>
              <Button variant="outline" size="sm" onClick={openProfile}>
                <Pencil className="h-4 w-4 mr-1" /> Edit profile &amp; GPS
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>
                <KeyRound className="h-4 w-4 mr-1" /> Change password
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Offer to donate blood (Select hospital, hospital admin assigns time) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-red-500" /> Offer to donate blood
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              Select the hospital blood bank you wish to donate at. Hospital staff will check clinical capacity and assign your confirmed appointment date and time.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSchedule} className="space-y-4">
              <div>
                <Label>Hospital Blood Bank *</Label>
                <select
                  value={formData.hospitalId}
                  onChange={(e) => setFormData({ ...formData, hospitalId: e.target.value })}
                  className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm mt-1"
                  required
                >
                  <option value="">Select a hospital</option>
                  {hospitals.map((h) => <option key={h._id} value={h._id}>{h.name} — {h.address}</option>)}
                </select>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between">
                    <Label>Preferred day (Optional)</Label>
                    <span className="text-[11px] text-gray-400">Optional</span>
                  </div>
                  <Input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={formData.appointmentDate}
                    onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
                    className="mt-1"
                  />
                  <p className="text-[11px] text-gray-400 mt-0.5">Leave blank for hospital to assign earliest available slot.</p>
                </div>
                <div>
                  <Label>Preferred clinic window</Label>
                  <select
                    value={formData.preferredWindow}
                    onChange={(e) => setFormData({ ...formData, preferredWindow: e.target.value })}
                    className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm mt-1"
                  >
                    <option value="morning">Morning Clinic (8:00 AM – 12:00 PM)</option>
                    <option value="afternoon">Afternoon Clinic (12:00 PM – 4:00 PM)</option>
                    <option value="flexible">Flexible (Any time during clinic hours)</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="e.g. First-time donor, coming during lunch break, etc." className="mt-1" />
              </div>
              <Button type="submit" disabled={booking}>{booking ? 'Submitting offer…' : 'Submit Donation Offer'}</Button>
            </form>
          </CardContent>
        </Card>

        {/* Upcoming */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-blue-500" /> Upcoming donation offers &amp; appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-400">No upcoming donations — offer to donate above.</p>
            ) : (
              <ul className="divide-y">
                {upcoming.map((a) => (
                  <li key={a._id} className="py-3 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium text-gray-800 flex items-center gap-1">
                        <MapPin className="h-4 w-4 text-gray-400" /> {a.hospitalId?.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">
                          {a.assignedDate
                            ? new Date(a.assignedDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
                            : a.preferredDay || (a.appointmentDate ? new Date(a.appointmentDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : 'Earliest available')}
                        </span>
                        {a.assignedTime ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-xs font-bold">
                            ⏰ {a.assignedTime}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                            ⏳ Awaiting time assignment
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-blue-600 font-medium">
                        {a.preferredWindow === 'afternoon' ? 'Afternoon Clinic (12:00 PM – 4:00 PM)' : a.preferredWindow === 'flexible' ? 'Flexible (Clinic hours)' : 'Morning Clinic (8:00 AM – 12:00 PM)'}
                      </p>
                      {a.notes && <p className="text-xs text-gray-500">Note: {a.notes}</p>}
                      {(() => {
                        const coords = (a.hospitalId as any)?.location?.coordinates;
                        const mapsUrl = coords && coords.length >= 2
                          ? `https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`
                          : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((a.hospitalId?.name || '') + ' ' + (a.hospitalId?.address || ''))}`;
                        return (
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium mt-1"
                          >
                            <Navigation className="h-3 w-3" /> Get Directions
                          </a>
                        );
                      })()}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <ApptStatusBadge status={a.status} />
                      <button
                        onClick={() => setCancelingAppt({
                          id: a._id,
                          hospitalName: a.hospitalId?.name,
                          date: a.assignedTime ? `${new Date(a.appointmentDate).toLocaleDateString()} at ${a.assignedTime}` : new Date(a.appointmentDate).toLocaleString(),
                        })}
                        className="text-red-600 text-xs hover:underline font-medium cursor-pointer"
                      >
                        Cancel
                      </button>
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

      {/* Custom Cancel Appointment Confirmation Dialog */}
      <Dialog open={!!cancelingAppt} onOpenChange={(open) => !open && setCancelingAppt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5 text-red-600" /> Cancel Donation Appointment
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this scheduled donation appointment? You can book a new one at any time.
            </DialogDescription>
          </DialogHeader>
          {cancelingAppt && (
            <div className="p-3 bg-red-50/80 border border-red-200 rounded-lg text-xs text-gray-700 space-y-1">
              <p><strong className="text-gray-900">Hospital:</strong> {cancelingAppt.hospitalName || 'Hospital'}</p>
              <p><strong className="text-gray-900">Scheduled Time:</strong> {cancelingAppt.date}</p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelingAppt(null)} disabled={canceling}>
              Keep Appointment
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              disabled={canceling}
              className="bg-red-600 hover:bg-red-700"
            >
              {canceling ? 'Cancelling…' : 'Yes, Cancel Appointment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit profile dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-red-500" /> Edit profile
            </DialogTitle>
            <DialogDescription>Update your contact details, blood group, and alert preferences.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full name</Label>
              <Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} placeholder="name@example.com" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input type='tel' value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="08012345678" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Blood group</Label>
                <span className="text-[11px] text-muted-foreground">Wrong entry? You can change it here</span>
              </div>
              <select
                value={profileForm.bloodGroup}
                onChange={(e) => setProfileForm({ ...profileForm, bloodGroup: e.target.value })}
                className="w-full border border-input rounded-md p-2 bg-background focus:outline-none focus:ring-2 focus:ring-red-500 text-sm mt-1"
              >
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Updating will refresh your Digital Donor Pass and emergency matching group.
              </p>
            </div>
            <div>
              <Label>Allergies / Medical Notes</Label>
              <Input
                value={profileForm.allergies}
                onChange={(e) => setProfileForm({ ...profileForm, allergies: e.target.value })}
                placeholder="e.g. Penicillin, Latex, Aspirin, or None"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Clinical staff check this during pre-donation screening.
              </p>
            </div>
            <div className="rounded-xl border p-3.5 bg-muted/40 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                  <MapPin className="h-3.5 w-3.5 text-red-600" /> GPS Coordinates for Proximity
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDetectGps}
                  disabled={detectingLocation}
                  className="h-7 text-xs px-2.5 bg-background shadow-xs hover:bg-muted"
                >
                  {detectingLocation ? 'Detecting…' : '📍 Detect Current GPS'}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                {profileForm.location?.coordinates
                  ? `Lat: ${profileForm.location.coordinates[1].toFixed(4)}°, Lon: ${profileForm.location.coordinates[0].toFixed(4)}°`
                  : 'No GPS coordinates saved (using Lagos default [3.38, 6.52])'}
              </div>
              {locMsg && <p className="text-xs text-emerald-600 font-medium">{locMsg}</p>}
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The WPS and SOS engines use your GPS coordinates to match you to patients needing blood within 15 km.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={profileForm.sosOptIn}
                onChange={(e) => setProfileForm({ ...profileForm, sosOptIn: e.target.checked })}
                className="h-4 w-4 accent-red-600"
              />
              Receive urgent SOS donation alerts near me
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)} disabled={savingProfile}>Cancel</Button>
            <Button onClick={saveProfile} disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change password dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-red-500" /> Change password
            </DialogTitle>
            <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Current password</Label>
              <PasswordInput value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} />
            </div>
            <div>
              <Label>New password</Label>
              <PasswordInput value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} placeholder="At least 8 characters" />
            </div>
            <div>
              <Label>Confirm new password</Label>
              <PasswordInput value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)} disabled={savingPw}>Cancel</Button>
            <Button onClick={savePassword} disabled={savingPw}>{savingPw ? 'Saving…' : 'Change password'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Digital Donor Pass Modal */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-xl font-bold">
              <Droplet className="h-5 w-5 text-red-600" /> Digital Donor Pass
            </DialogTitle>
            <DialogDescription>
              Present this verified pass at any hospital or blood drive to check in instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-4 space-y-4">
            <div className="relative bg-white p-4 rounded-2xl border-2 border-red-100 shadow-sm">
              {donor.qrCode ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={donor.qrCode}
                  alt="Donor QR Code"
                  className="w-56 h-56 object-contain rounded-lg"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center bg-gray-100 rounded-lg text-gray-400 text-sm">
                  Generating QR Code...
                </div>
              )}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-bold px-3 py-0.5 rounded-full shadow">
                Group {donor.bloodGroup}
              </div>
            </div>

            <div className="space-y-1 text-center">
              <h3 className="font-bold text-lg text-gray-800">{donor.name}</h3>
              <p className="text-xs text-muted-foreground font-mono">ID: {donor._id}</p>
              {donor.ninMasked && <p className="text-[11px] text-emerald-700 font-mono">NIN: {donor.ninMasked}</p>}
              <div className="pt-2">{eligibilityBadge}</div>
            </div>

            <p className="text-xs text-gray-400 max-w-xs">
              Staff scan this QR code to verify your blood type, check donation eligibility, and record units.
            </p>
          </div>
          <DialogFooter className="sm:justify-between flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPass}
              disabled={!donor.qrCode}
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-1.5" /> Download Pass
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setQrOpen(false)}
              className="flex-1"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Donor Certificate of Appreciation Modal */}
      <Dialog open={certOpen} onOpenChange={setCertOpen}>
        <DialogContent className="sm:max-w-xl text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-xl font-bold">
              <Award className="h-5 w-5 text-amber-500" /> Voluntary Donor Certificate
            </DialogTitle>
            <DialogDescription>
              Official Certificate of Appreciation recognizing your voluntary blood donation commitment.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 px-2">
            <div className="border-4 border-double border-amber-600/60 bg-gradient-to-b from-amber-50/50 via-white to-red-50/30 rounded-xl p-8 space-y-4 shadow-inner relative">
              <div className="flex items-center justify-center gap-2 text-red-600 font-bold tracking-widest text-xs uppercase">
                <Droplet className="h-4 w-4 fill-red-600" /> Smart Blood Bank &bull; Nigeria
              </div>

              <h2 className="text-2xl font-serif font-bold text-gray-900 tracking-wide uppercase">
                Certificate of Appreciation
              </h2>

              <p className="text-xs text-muted-foreground uppercase tracking-widest">
                This certificate is proudly awarded to
              </p>

              <h3 className="text-2xl font-bold text-red-700 underline decoration-red-300 underline-offset-8">
                {donor.name}
              </h3>

              <p className="text-xs text-gray-600 max-w-md mx-auto leading-relaxed pt-2">
                In sincere gratitude for your selfless dedication as a registered voluntary blood donor (Blood Group <strong className="text-red-700">{donor.bloodGroup}</strong>). Your commitment saves lives in critical maternal, trauma, and surgical emergencies across Nigerian healthcare facilities.
              </p>

              <div className="pt-4 flex items-center justify-between text-left text-xs border-t border-amber-200">
                <div>
                  <p className="text-muted-foreground">Donor ID: <span className="font-mono font-bold text-gray-700">{donor._id.slice(-8).toUpperCase()}</span></p>
                  <p className="text-muted-foreground">Issued: {new Date(donor.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <Badge className="bg-amber-100 text-amber-900 border-amber-300">
                    Certified Voluntary Donor
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="sm:justify-between flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-1.5" /> Print / Save Certificate
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setCertOpen(false)}
              className="flex-1"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
