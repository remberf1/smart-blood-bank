'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import apiClient from '../../api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Droplet, ArrowLeft, MapPin } from 'lucide-react';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
// Fallback location (Lagos) if the browser can't/won't share one.
const DEFAULT_COORDS: [number, number] = [3.3792, 6.5244]; // [lng, lat]

export default function DonorRegister() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [locStatus, setLocStatus] = useState('Detecting your location…');
  const [form, setForm] = useState({
    name: '', phone: '', email: '', password: '',
    bloodGroup: '', dateOfBirth: '', gender: '', weight: '',
    allergies: '', nin: '',
    donationTypePreference: 'WHOLE_BLOOD',
    nonRemunerationDeclared: true,
  });

  useEffect(() => {
    if (!navigator.geolocation) { setLocStatus('Location unavailable — a default will be used.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords([pos.coords.longitude, pos.coords.latitude]); setLocStatus('Location detected ✓'); },
      () => { setLocStatus('Location not shared — a default will be used (you can update it later).'); },
      { timeout: 8000 }
    );
  }, []);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const maxDob = new Date(Date.now() - 16 * 365.25 * 86400000).toISOString().split('T')[0];
  const minDob = new Date(Date.now() - 100 * 365.25 * 86400000).toISOString().split('T')[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const phoneDigits = form.phone.replace(/\D/g, '');
    if (!form.phone.trim() || phoneDigits.length < 10 || phoneDigits.length > 14) {
      setError('Please enter a valid Nigerian phone number (e.g. 08012345678 or +2348012345678).');
      return;
    }
    if (!form.bloodGroup) { setError('Please select your blood group.'); return; }
    if (!form.dateOfBirth) { setError('Please enter your date of birth.'); return; }
    const dob = new Date(form.dateOfBirth);
    const now = new Date();
    if (dob > now) { setError('Date of birth cannot be in the future.'); return; }
    const age = (now.getTime() - dob.getTime()) / (365.25 * 86400000);
    if (age < 16) { setError('Donors must be at least 16 years old to register.'); return; }
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
      // Auto sign-in so onboarding is one smooth flow.
      const res = await apiClient.post('/donor/auth/login', { email: form.email, password: form.password });
      localStorage.setItem('donorToken', res.data.token);
      router.push('/donor/dashboard');
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Droplet className="h-5 w-5 text-red-500" /> Become a donor
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Full name *</Label>
                <Input value={form.name} onChange={(e) => set({ name: e.target.value })} required />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between">
                    <Label>Phone *</Label>
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
                  <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} required />
                </div>
              </div>
              <div>
                <Label>Password *</Label>
                <PasswordInput value={form.password} onChange={(e) => set({ password: e.target.value })} required minLength={6} />
                <p className="text-xs text-gray-400 mt-1">At least 6 characters — you&apos;ll use this to sign in.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Blood group *</Label>
                  <select value={form.bloodGroup} onChange={(e) => set({ bloodGroup: e.target.value })}
                    className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500" required>
                    <option value="">Select</option>
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
                    className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500">
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
                  Under NBSC guidelines, donors may donate whole blood or opt for apheresis platelet/plasma donation.
                </p>
              </div>
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
                <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="text-emerald-600 font-semibold">🔒 Protected:</span>
                  <span>Encrypted under NDPA 2023. Required by NBSC for identity verification.</span>
                  <Link href="/privacy" className="text-red-600 hover:underline">Read Privacy Policy</Link>
                </p>
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

              <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="h-3 w-3" /> {locStatus}</p>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Creating account…' : 'Register as donor'}
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
