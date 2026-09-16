'use client';
import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Siren, ArrowLeft, MapPin, CheckCircle2, Phone } from 'lucide-react';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

type NearestHospital = {
  id: string;
  name: string;
  address?: string;
  phone: string;
  distanceKm: number;
  coordinates: [number, number];
};

type Result = {
  donorsFound: number;
  donorsAlerted: number;
  radiusKm: number;
  widened: boolean;
  nearestHospital?: NearestHospital | null;
};

export default function SosPage() {
  const [bloodGroup, setBloodGroup] = useState('');
  const [phone, setPhone] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const g = new URLSearchParams(window.location.search).get('group');
    if (g && BLOOD_GROUPS.includes(g)) {
      queueMicrotask(() => setBloodGroup(g));
    }
  }, []);

  const useMyLocation = () => {
    setLocError('');
    if (!navigator.geolocation) { setLocError('Location is not available on this device.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setLocating(false); },
      () => { setLocError('Could not get your location. Please allow location access.'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!bloodGroup) { setError('Select the blood group needed.'); return; }
    const digits = phone.replace(/\D/g, '');
    if (!phone.trim() || digits.length < 10 || digits.length > 14) {
      setError('Please enter a valid Nigerian phone number (e.g., 08012345678 or +2348012345678) so donors and hospitals can contact you.');
      return;
    }
    if (!coords) { setError('Share your location so we can find donors near you.'); return; }
    setSubmitting(true);
    try {
      const res = await apiClient.post('/sos/trigger', { bloodGroup, lat: coords.lat, lon: coords.lon, phone });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not raise the SOS. Please contact a hospital directly.');
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
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 bg-red-600 rounded-xl flex items-center justify-center shrink-0">
            <Siren className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Emergency SOS</h1>
            <p className="text-sm text-gray-500">Alert nearby, compatible blood donors right now</p>
          </div>
        </div>

        {result ? (
          <Card>
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              {result.donorsFound > 0 ? (
                <>
                  <h2 className="text-xl font-bold text-gray-900">Emergency Alert Broadcasted</h2>
                  <p className="text-gray-600">
                    <strong>{result.donorsAlerted}</strong> compatible donor(s) within{' '}
                    <strong>{result.radiusKm}km</strong> have been alerted
                    {result.widened ? ' (search widened to reach donors)' : ''}. If someone accepts, they&apos;ll
                    be given a way to reach you.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-900">No Donors Found Nearby</h2>
                  <p className="text-gray-600">
                    We couldn&apos;t reach registered donors near you right now. Please immediately call or visit
                    the nearest hospital below.
                  </p>
                </>
              )}

              {result.nearestHospital && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-left space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-red-700 flex items-center gap-1.5">
                      <Siren className="h-3.5 w-3.5" /> Nearest Hospital & Blood Bank Admin
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      {result.nearestHospital.distanceKm} km away
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">{result.nearestHospital.name}</h3>
                    {result.nearestHospital.address && (
                      <p className="text-xs text-gray-500 mt-0.5">{result.nearestHospital.address}</p>
                    )}
                  </div>
                  <div className="pt-1 flex flex-wrap gap-2">
                    {result.nearestHospital.phone && (
                      <a
                        href={`tel:${result.nearestHospital.phone}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                      >
                        <Phone className="h-4 w-4" /> Call Blood Bank: {result.nearestHospital.phone}
                      </a>
                    )}
                    {result.nearestHospital.coordinates && (
                      <a
                        href={`https://maps.google.com/?q=${result.nearestHospital.coordinates[1]},${result.nearestHospital.coordinates[0]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg text-sm font-medium transition-colors"
                      >
                        <MapPin className="h-4 w-4 text-red-600" /> Directions
                      </a>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 italic">
                    Hospital staff and administrators have been alerted to standby for this emergency.
                  </p>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                <Link href="/request">
                  <Button variant="outline" className="w-full sm:w-auto">Also submit a blood request</Button>
                </Link>
                <Button variant="ghost" onClick={() => setResult(null)} className="w-full sm:w-auto">
                  Raise another alert
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <Siren className="h-5 w-5" /> Raise an SOS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                This alerts nearby donors whose blood is compatible with the patient. For a scheduled or
                non-urgent need, use the <Link href="/request" className="text-primary hover:underline">request form</Link> instead.
              </p>
              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label>Blood group needed *</Label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full border border-input rounded-md p-2 bg-card focus:outline-none focus:ring-2 focus:ring-red-500"
                    required
                  >
                    <option value="">Select group</option>
                    {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Your phone (so a donor or hospital can reach you) *</Label>
                  <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08012345678" required />
                </div>
                <div>
                  <Label>Your location *</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating}>
                      <MapPin className="h-4 w-4 mr-1" /> {locating ? 'Locating…' : coords ? 'Update location' : 'Use my location'}
                    </Button>
                    {coords && (
                      <span className="text-sm text-emerald-600 inline-flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Location captured
                      </span>
                    )}
                  </div>
                  {locError && <p className="text-red-500 text-xs mt-1">{locError}</p>}
                </div>
                <Button type="submit" className="w-full bg-red-600 hover:bg-red-700" disabled={submitting || !coords}>
                  <Siren className="h-4 w-4 mr-1" /> {submitting ? 'Alerting donors…' : 'Send emergency SOS'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
