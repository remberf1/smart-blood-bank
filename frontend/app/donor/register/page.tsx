'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import apiClient from '../../api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Droplet, ArrowLeft, MapPin, ShieldCheck, Lock, CheckCircle2 } from 'lucide-react';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const NIGERIAN_CITIES: { name: string; coords: [number, number] }[] = [
  { name: 'Lagos (Ikeja / Island / Mainland)', coords: [3.3792, 6.5244] },
  { name: 'Abuja (Federal Capital Territory)', coords: [7.4951, 9.0579] },
  { name: 'Ibadan (Oyo State)', coords: [3.9470, 7.3775] },
  { name: 'Port Harcourt (Rivers State)', coords: [7.0498, 4.8156] },
  { name: 'Kano (Kano State)', coords: [8.5167, 12.0022] },
  { name: 'Enugu (Enugu State)', coords: [7.5086, 6.4584] },
  { name: 'Benin City (Edo State)', coords: [5.6037, 6.3350] },
  { name: 'Kaduna (Kaduna State)', coords: [7.4383, 10.5105] },
  { name: 'Calabar (Cross River State)', coords: [8.3275, 4.9757] },
  { name: 'Jos (Plateau State)', coords: [8.8921, 9.8965] },
  { name: 'Ilorin (Kwara State)', coords: [4.5418, 8.4966] },
  { name: 'Owerri (Imo State)', coords: [7.0336, 5.4856] },
  { name: 'Abeokuta (Ogun State)', coords: [3.3500, 7.1557] },
  { name: 'Akure (Ondo State)', coords: [5.1950, 7.2571] },
  { name: 'Warri (Delta State)', coords: [5.7500, 5.5167] },
];

const DEFAULT_COORDS: [number, number] = [3.3792, 6.5244]; // Lagos [lng, lat]

export default function DonorRegister() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [coords, setCoords] = useState<[number, number]>(DEFAULT_COORDS);
  const [selectedCity, setSelectedCity] = useState(NIGERIAN_CITIES[0].name);
  const [locMode, setLocMode] = useState<'city' | 'gps' | 'manual'>('city');
  const [locStatus, setLocStatus] = useState('Default location: Lagos');
  const [manualLng, setManualLng] = useState(DEFAULT_COORDS[0].toString());
  const [manualLat, setManualLat] = useState(DEFAULT_COORDS[1].toString());

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    bloodGroup: '',
    dateOfBirth: '',
    gender: '',
    weight: '',
    allergies: '',
    nin: '',
    donationTypePreference: 'WHOLE_BLOOD',
    nonRemunerationDeclared: true,
  });

  // Attempt auto-detect GPS upon mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocStatus('GPS geolocation not supported by browser. City preset used.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const detected: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setCoords(detected);
        setLocMode('gps');
        setManualLng(pos.coords.longitude.toFixed(5));
        setManualLat(pos.coords.latitude.toFixed(5));
        setLocStatus('GPS location detected ✓');
      },
      () => {
        setLocStatus('Location permission denied or unavailable. City preset used.');
      },
      { timeout: 7000 }
    );
  }, []);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const maxDob = new Date(Date.now() - 16 * 365.25 * 86400000).toISOString().split('T')[0];
  const minDob = new Date(Date.now() - 100 * 365.25 * 86400000).toISOString().split('T')[0];

  const handleCityChange = (cityName: string) => {
    setSelectedCity(cityName);
    const found = NIGERIAN_CITIES.find((c) => c.name === cityName);
    if (found) {
      setCoords(found.coords);
      setManualLng(found.coords[0].toString());
      setManualLat(found.coords[1].toString());
      setLocStatus(`Preset: ${found.name}`);
    }
  };

  const handleManualCoordChange = (lngStr: string, latStr: string) => {
    setManualLng(lngStr);
    setManualLat(latStr);
    const lng = parseFloat(lngStr);
    const lat = parseFloat(latStr);
    if (!isNaN(lng) && !isNaN(lat)) {
      setCoords([lng, lat]);
      setLocStatus(`Manual coordinates set: [${lng.toFixed(4)}, ${lat.toFixed(4)}]`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const phoneDigits = form.phone.replace(/\D/g, '');
    if (!form.phone.trim() || phoneDigits.length < 10 || phoneDigits.length > 14) {
      setError('Please enter a valid Nigerian phone number (e.g. 08012345678 or +2348012345678).');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }
    if (!form.bloodGroup) {
      setError('Please select your blood group.');
      return;
    }
    if (!form.dateOfBirth) {
      setError('Please enter your date of birth.');
      return;
    }
    const dob = new Date(form.dateOfBirth);
    const now = new Date();
    if (dob > now) {
      setError('Date of birth cannot be in the future.');
      return;
    }
    const age = (now.getTime() - dob.getTime()) / (365.25 * 86400000);
    if (age < 16) {
      setError('Donors must be at least 16 years old to register.');
      return;
    }
    const cleanNin = form.nin.replace(/\D/g, '');
    if (!cleanNin || cleanNin.length !== 11) {
      setError('Please enter a valid 11-digit National Identification Number (NIN).');
      return;
    }
    if (form.weight && (Number(form.weight) < 30 || Number(form.weight) > 300)) {
      setError('Please enter a realistic weight between 30 kg and 300 kg.');
      return;
    }
    if (!form.nonRemunerationDeclared) {
      setError('You must accept the voluntary non-remuneration declaration under Section 53 of the National Health Act 2014.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/donors/register', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        bloodGroup: form.bloodGroup,
        dateOfBirth: form.dateOfBirth,
        gender: form.gender || undefined,
        weight: form.weight ? Number(form.weight) : undefined,
        allergies: form.allergies ? form.allergies.trim() : undefined,
        nin: cleanNin,
        donationTypePreference: form.donationTypePreference,
        nonRemunerationDeclared: form.nonRemunerationDeclared,
        location: { type: 'Point', coordinates: coords || DEFAULT_COORDS },
      });

      // Redirect to verification screen with email and phone query params
      const verifyQuery = new URLSearchParams({
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
      }).toString();

      router.push(`/donor/verify?${verifyQuery}`);
    } catch (err: any) {
      setError(
        err.response?.data?.details?.[0]?.message ||
        err.response?.data?.error ||
        'Registration failed. Please check your details.'
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Droplet className="h-5 w-5 text-red-500" /> Become a Donor
            </CardTitle>
            <CardDescription className="text-xs text-gray-500">
              Join Nigeria&apos;s verified voluntary blood donor registry. Quick 2-minute registration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && <p className="text-red-500 text-sm mb-4 bg-red-50 p-3 rounded-lg border border-red-200">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Full name *</Label>
                <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Babatunde Fashola" required />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between">
                    <Label>Phone (WhatsApp / SMS) *</Label>
                    <span className="text-[11px] text-gray-400">080... or +234...</span>
                  </div>
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => set({ phone: e.target.value.replace(/[^\d+]/g, '') })}
                    placeholder="08012345678"
                    maxLength={14}
                    required
                  />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@example.com" required />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Password *</Label>
                  <PasswordInput value={form.password} onChange={(e) => set({ password: e.target.value })} required minLength={6} placeholder="Min 6 characters" />
                </div>
                <div>
                  <Label>Confirm Password *</Label>
                  <PasswordInput value={form.confirmPassword} onChange={(e) => set({ confirmPassword: e.target.value })} required minLength={6} placeholder="Re-type password" />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Blood group *</Label>
                  <select value={form.bloodGroup} onChange={(e) => set({ bloodGroup: e.target.value })}
                    className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" required>
                    <option value="">Select blood group</option>
                    {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Date of birth *</Label>
                  <Input type="date" value={form.dateOfBirth} max={maxDob} min={minDob} onChange={(e) => set({ dateOfBirth: e.target.value })} required />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Gender</Label>
                  <select value={form.gender} onChange={(e) => set({ gender: e.target.value })}
                    className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm">
                    <option value="">Prefer not to say</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <Label>Weight (kg)</Label>
                  <Input type="number" min={30} max={300} value={form.weight} onChange={(e) => set({ weight: e.target.value })} placeholder="e.g. 65" />
                </div>
              </div>

              <div>
                <Label>Donation Type Preference</Label>
                <select
                  value={form.donationTypePreference}
                  onChange={(e) => set({ donationTypePreference: e.target.value })}
                  className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm mt-1"
                >
                  <option value="WHOLE_BLOOD">Whole Blood (Standard voluntary donation)</option>
                  <option value="PLATELET_APHERESIS">Platelet Apheresis (Specialized cell-separator donation)</option>
                  <option value="PLASMA_APHERESIS">Plasma Apheresis (Specialized plasma donation)</option>
                </select>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Under NBSC guidelines, donors may donate whole blood (90-day interval) or opt for apheresis platelet/plasma donation.
                </p>
              </div>

              {/* Location Picker */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-red-500" /> Donor Location (SOS Alert Dispatch)
                  </Label>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setLocMode('city')}
                      className={`px-2 py-0.5 rounded ${locMode === 'city' ? 'bg-slate-800 text-white font-medium' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      City Preset
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocMode('manual')}
                      className={`px-2 py-0.5 rounded ${locMode === 'manual' ? 'bg-slate-800 text-white font-medium' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Coordinates
                    </button>
                  </div>
                </div>

                {locMode === 'city' ? (
                  <div>
                    <select
                      value={selectedCity}
                      onChange={(e) => handleCityChange(e.target.value)}
                      className="w-full border border-gray-300 bg-white rounded-md p-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      {NIGERIAN_CITIES.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-gray-500 block mb-0.5">Longitude</span>
                      <Input
                        type="text"
                        value={manualLng}
                        onChange={(e) => handleManualCoordChange(e.target.value, manualLat)}
                        className="text-xs h-8 bg-white"
                        placeholder="3.3792"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block mb-0.5">Latitude</span>
                      <Input
                        type="text"
                        value={manualLat}
                        onChange={(e) => handleManualCoordChange(manualLng, e.target.value)}
                        className="text-xs h-8 bg-white"
                        placeholder="6.5244"
                      />
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  {locStatus}
                </p>
              </div>

              {/* National Identity Section with NDPA 2023 Disclosure */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>National Identification Number (NIN) *</Label>
                  <span className="text-[11px] text-gray-400">{form.nin.replace(/\D/g, '').length} / 11 digits</span>
                </div>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  value={form.nin}
                  onChange={(e) => set({ nin: e.target.value.replace(/\D/g, '') })}
                  placeholder="11-digit NIN (e.g. 12345678901)"
                  required
                />
                <div className="mt-1.5 p-2 bg-emerald-50/70 border border-emerald-200/80 rounded-md text-[11px] text-emerald-950 flex items-start gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-emerald-700 shrink-0 mt-0.5" />
                  <p className="leading-snug">
                    <strong>NDPA 2023 Data Privacy Notice:</strong> Your NIN and blood group are AES-encrypted and retained strictly for clinical traceability, biometrics anti-fraud, and identity verification as mandated by the National Blood Service Commission (NBSC). Your personal data will never be commercialized.
                  </p>
                </div>
              </div>

              <div>
                <Label>Allergies / Medical Notes (optional)</Label>
                <Input
                  value={form.allergies}
                  onChange={(e) => set({ allergies: e.target.value })}
                  placeholder="e.g. Penicillin, Latex, Aspirin, Asthma, or None"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Clinical staff check this during pre-donation health screening.
                </p>
              </div>

              {/* Section 53 NHA 2014 Mandatory Declaration */}
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-3.5 space-y-2">
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="nonRemun"
                    checked={form.nonRemunerationDeclared}
                    onChange={(e) => set({ nonRemunerationDeclared: e.target.checked })}
                    className="mt-0.5 rounded border-red-300 text-red-600 focus:ring-red-500 cursor-pointer"
                    required
                  />
                  <label htmlFor="nonRemun" className="text-xs text-red-950 leading-relaxed cursor-pointer">
                    <strong>Voluntary Non-Remuneration Declaration (Section 53, National Health Act 2014):</strong><br />
                    I confirm that I am registering to donate blood voluntarily and without financial payment or remuneration. I understand that selling blood is illegal under Section 53 of the National Health Act 2014, and that commercial blood trading constitutes a criminal offence.
                  </label>
                </div>
              </div>

              <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-medium" disabled={submitting}>
                {submitting ? 'Registering & Generating Pass…' : 'Register as Donor'}
              </Button>
            </form>

            <p className="text-sm text-gray-500 text-center mt-4">
              Already registered?{' '}
              <Link href="/donor/login" className="text-red-600 font-medium hover:underline">Sign in</Link>
            </p>
            <p className="text-xs text-gray-400 text-center mt-3 pt-3 border-t border-gray-100">
              Hospital staff or medical lab admin?{' '}
              <Link href="/login" className="text-gray-600 hover:text-gray-900 underline font-medium">
                Hospital staff login
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
