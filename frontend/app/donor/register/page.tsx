'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import apiClient from '../../api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.bloodGroup) { setError('Please select your blood group.'); return; }
    setSubmitting(true);
    try {
      await apiClient.post('/donors/register', {
        name: form.name,
        phone: form.phone,
        email: form.email,
        password: form.password,
        bloodGroup: form.bloodGroup,
        dateOfBirth: form.dateOfBirth,
        gender: form.gender || undefined,
        weight: form.weight ? Number(form.weight) : undefined,
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
                  <Label>Phone *</Label>
                  <Input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="08012345678" required />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} required />
                </div>
              </div>
              <div>
                <Label>Password *</Label>
                <Input type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} required minLength={6} />
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
                  <Input type="date" value={form.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} required />
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
                  <Input type="number" value={form.weight} onChange={(e) => set({ weight: e.target.value })} placeholder="e.g. 65" />
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
