'use client';
import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Siren, ArrowLeft, MapPin, CheckCircle2, Phone, ShieldCheck, Ambulance, Stethoscope } from 'lucide-react';

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
  tier?: 'clinical' | 'public';
  referenceId?: string;
  donorsFound: number;
  donorsAlerted: number;
  radiusKm: number;
  widened: boolean;
  nearestHospital?: NearestHospital | null;
  userLocation?: { lat: number; lon: number } | null;
  message?: string;
};

export default function SosPage() {
  const [bloodGroup, setBloodGroup] = useState('');
  const [phone, setPhone] = useState('');
  const [authCode, setAuthCode] = useState('');
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

  const cleanAuth = authCode.trim().toUpperCase();
  const isClinicalCode = cleanAuth === 'DOC-2026' || cleanAuth.startsWith('DOC-') || cleanAuth.startsWith('HOSP-');

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
      setError('Please enter a valid Nigerian phone number (e.g., 08012345678 or +2348012345678) so emergency teams can reach you.');
      return;
    }
    if (!coords) { setError('Share your location so we can locate the nearest hospital or nearby donors.'); return; }
    setSubmitting(true);
    try {
      const res = await apiClient.post('/sos/trigger', {
        bloodGroup,
        lat: coords.lat,
        lon: coords.lon,
        phone,
        authCode: cleanAuth || undefined,
      });
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
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 bg-red-600 rounded-xl flex items-center justify-center shrink-0">
            <Siren className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Emergency SOS Dispatch</h1>
            <p className="text-sm text-gray-500">Rapid emergency blood dispatch and hospital triage</p>
          </div>
        </div>

        {/* Two-Tier Guidance Cards */}
        <div className="grid grid-cols-2 gap-2.5 mb-5 text-xs">
          <div className={`p-3 rounded-xl border transition-all ${isClinicalCode ? 'bg-red-50 border-red-300 ring-2 ring-red-400' : 'bg-white border-gray-200'}`}>
            <div className="font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
              <Stethoscope className="h-4 w-4 text-red-600" /> Tier 1: Clinical SOS
            </div>
            <p className="text-gray-500 leading-snug">
              Doctor PIN or Facility Code. Immediately alerts voluntary donors &amp; hospital blood bank.
            </p>
          </div>
          <div className={`p-3 rounded-xl border transition-all ${!isClinicalCode ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400' : 'bg-white border-gray-200'}`}>
            <div className="font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
              <Ambulance className="h-4 w-4 text-blue-600" /> Tier 2: Public SOS
            </div>
            <p className="text-gray-500 leading-snug">
              No code required. Instantly routes to nearest hospital triage &amp; ambulance team.
            </p>
          </div>
        </div>

        {result ? (
          <Card>
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              {result.tier === 'clinical' ? (
                <>
                  <div className="inline-block bg-red-100 text-red-800 text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                    Tier 1: Clinical SOS Broadcasted
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Voluntary Donors Alerted</h2>
                  {result.referenceId && (
                    <div className="text-xs font-mono bg-slate-100 text-slate-700 py-1 px-2 rounded inline-block">
                      Ref: {result.referenceId}
                    </div>
                  )}
                  <p className="text-gray-600 text-sm">
                    <strong>{result.donorsAlerted}</strong> compatible voluntary donor(s) within{' '}
                    <strong>{result.radiusKm}km</strong> have been alerted
                    {result.widened ? ' (search radius widened)' : ''}. The hospital blood bank has also been put on standby.
                  </p>
                </>
              ) : (
                <>
                  <div className="inline-block bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                    Tier 2: Nearest Hospital Alerted
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Hospital Emergency Triage Alerted</h2>
                  {result.referenceId && (
                    <div className="text-xs font-mono bg-slate-100 text-slate-700 py-1 px-2 rounded inline-block">
                      Ref: {result.referenceId}
                    </div>
                  )}
                  <p className="text-gray-600 text-sm">
                    Your emergency has been routed directly to the emergency triage and ambulance dispatch team at the nearest hospital below.
                    Please call them directly or stand by for their immediate call.
                  </p>
                </>
              )}

              {result.nearestHospital && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-left space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-red-700 flex items-center gap-1.5">
                      <Siren className="h-3.5 w-3.5" /> Nearest Emergency Hospital
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
                        <Phone className="h-4 w-4" /> Call Emergency Blood Bank: {result.nearestHospital.phone}
                      </a>
                    )}
                    {result.nearestHospital.coordinates && (
                      <a
                        href={`https://maps.google.com/?q=${result.nearestHospital.coordinates[1]},${result.nearestHospital.coordinates[0]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg text-sm font-medium transition-colors"
                      >
                        <MapPin className="h-4 w-4 text-red-600" /> Directions &amp; Navigation
                      </a>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 italic">
                    Hospital staff have received your GPS coordinates ({result.userLocation?.lat?.toFixed(3)}, {result.userLocation?.lon?.toFixed(3)}) and emergency callback phone.
                  </p>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                <Link href="/request">
                  <Button variant="outline" className="w-full sm:w-auto">Submit Standard Blood Request</Button>
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
                <Siren className="h-5 w-5" /> Emergency Blood Request
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                  <Label>Your contact phone (for immediate callback) *</Label>
                  <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08012345678" required />
                </div>

                <div>
                  <Label>Your current emergency location *</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating}>
                      <MapPin className="h-4 w-4 mr-1" /> {locating ? 'Locating…' : coords ? 'Update location' : 'Capture my GPS location'}
                    </Button>
                    {coords && (
                      <span className="text-sm text-emerald-600 inline-flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Location captured
                      </span>
                    )}
                  </div>
                  {locError && <p className="text-red-500 text-xs mt-1">{locError}</p>}
                </div>

                {/* Medical Authorization Gate */}
                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Medical Authorization Gate (Optional for bystanders)
                    </Label>
                    <span className="text-[10px] text-slate-400">Doctor PIN or Facility Code</span>
                  </div>
                  <Input
                    type="text"
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    placeholder="e.g. DOC-2026, DOC-XXXX or HOSP-LUTH"
                    className="bg-white font-mono text-xs uppercase"
                  />
                  {isClinicalCode ? (
                    <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                      ✓ Clinical Authorization recognized. This will immediately broadcast emergency alerts to voluntary donors within radius.
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      If left blank (bystander/patient mode), the alert will route immediately to the nearest hospital emergency department for verification before contacting voluntary donors.
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className={`w-full font-semibold transition-all ${
                    isClinicalCode
                      ? 'bg-red-600 hover:bg-red-700 text-white shadow-md'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                  }`}
                  disabled={submitting || !coords}
                >
                  {submitting ? (
                    'Dispatching emergency…'
                  ) : isClinicalCode ? (
                    <>
                      <Siren className="h-4 w-4 mr-1.5" /> Broadcast Clinical SOS (Alert Donors &amp; Hospital)
                    </>
                  ) : (
                    <>
                      <Ambulance className="h-4 w-4 mr-1.5" /> Alert Nearest Hospital Emergency Dept
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

