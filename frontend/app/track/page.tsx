'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import apiClient from '../api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import {
  Droplet, ArrowLeft, Search, PackageCheck, Truck, CheckCircle2,
  Clock, XCircle, Building2, Phone, MapPin, Navigation, AlertCircle,
  Siren, ShieldCheck, Lock, Users, MessageSquare
} from 'lucide-react';

interface Hospital {
  _id: string;
  name: string;
  address?: string;
  contactPhone?: string;
  location?: { coordinates: [number, number] };
}

interface PatientRequest {
  _id: string;
  type?: 'patient_request' | 'sos';
  patientName?: string;
  contactPhone?: string;
  resourceType: 'blood' | 'oxygen';
  bloodGroup?: string;
  units: number;
  urgency: string;
  scheduledTime?: string;
  destinationFacility?: string;
  ward?: string;
  bedNumber?: string;
  deliveryStatus: 'pending' | 'approved' | 'in-transit' | 'delivered' | 'cancelled';
  cancellationReason?: string;
  cancelledAt?: string;
  preferredHospitalId?: Hospital;
  allocatedHospitalId?: Hospital;
  createdAt: string;
  approvedAt?: string;
  inTransitAt?: string;
  deliveredAt?: string;
  notes?: string;
  referenceId?: string;
  // SOS specific tracking fields if type === 'sos'
  tier?: 'clinical' | 'public';
  componentNeeded?: string;
  radiusKm?: number;
  status?: string;
  hospitalTriageStatus?: string;
  hospitalName?: string;
  doctorName?: string;
  doctorPhone?: string;
  userPhoneMasked?: string;
  userLocation?: { lat: number; lon: number };
  donorsAlertedCount?: number;
  donorsAvailableCount?: number;
  donorsDeclinedCount?: number;
}

// Ordered pipeline the status badge and timeline walk through for standard requests.
const STEPS = [
  { key: 'pending', label: 'Received', icon: Clock },
  { key: 'approved', label: 'Approved', icon: PackageCheck },
  { key: 'in-transit', label: 'In transit', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
] as const;

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: 'Received', className: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', className: 'bg-emerald-100 text-emerald-700' },
  'in-transit': { label: 'In transit', className: 'bg-blue-100 text-blue-700' },
  delivered: { label: 'Delivered', className: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
};

const shortRef = (id: string, ref?: string) => ref || (id ? id.slice(-6).toUpperCase() : '');
const fmt = (d?: string) => (d ? new Date(d).toLocaleString() : '');

function StatusTimeline({ req }: { req: PatientRequest }) {
  if (req.deliveryStatus === 'cancelled') {
    return (
      <div className="flex items-center gap-2 text-red-600 text-sm mt-3">
        <XCircle className="h-4 w-4" /> This request was cancelled. Please contact the hospital for details.
      </div>
    );
  }
  const currentIdx = STEPS.findIndex((s) => s.key === req.deliveryStatus);
  const stampFor = (key: string) =>
    key === 'pending' ? req.createdAt
      : key === 'approved' ? req.approvedAt
      : key === 'in-transit' ? req.inTransitAt
      : req.deliveredAt;

  return (
    <div className="mt-4">
      <div className="flex items-center">
        {STEPS.map((step, i) => {
          const done = i <= currentIdx;
          const Icon = step.icon;
          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    done ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className={`text-[11px] mt-1 ${done ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                  {step.label}
                </span>
                {done && stampFor(step.key) && (
                  <span className="text-[10px] text-gray-400">{fmt(stampFor(step.key))}</span>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 ${i < currentIdx ? 'bg-primary' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SosTrackerCard({ sos }: { sos: PatientRequest }) {
  const isResolved = sos.status === 'resolved';
  const isClinical = sos.tier === 'clinical';
  const refCode = sos.referenceId || `SOS-${sos._id.slice(-6).toUpperCase()}`;

  return (
    <Card className="border-red-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-red-600 px-4 py-3 flex items-center justify-between text-white">
        <div className="flex items-center gap-2">
          <Siren className="h-5 w-5 animate-pulse" />
          <span className="font-bold text-sm tracking-wide">Emergency SOS Tracker</span>
        </div>
        <Badge className={isResolved ? "bg-emerald-500 text-white font-bold" : "bg-white text-red-700 font-bold"}>
          {isResolved ? "Resolved" : "Active Emergency"}
        </Badge>
      </div>

      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-gray-400 block">Reference ID</span>
            <span className="text-lg font-mono font-bold text-red-600">{refCode}</span>
          </div>
          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-gray-400 block">Classification</span>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full inline-block ${
              isClinical ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {isClinical ? '🩺 Tier 1 Clinical SOS' : '📢 Tier 2 Public Bystander'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
          <div>
            <span className="text-gray-500 block">Blood Component</span>
            <strong className="text-sm text-gray-900">{sos.bloodGroup} {sos.componentNeeded?.replace('_', ' ')}</strong>
          </div>
          <div>
            <span className="text-gray-500 block">Search Radius</span>
            <strong className="text-sm text-gray-900">{sos.radiusKm || 15} km</strong>
          </div>
          <div>
            <span className="text-gray-500 block">Hospital / Triage</span>
            <span className="font-medium text-gray-800">{sos.hospitalName || 'Emergency Referral Hospital'}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Emergency Contact</span>
            <span className="font-mono text-gray-700">{sos.userPhoneMasked || 'Protected under NDPA'}</span>
          </div>
        </div>

        {/* Live Volunteer Response Metrics */}
        <div className="p-3 bg-red-50/60 rounded-xl border border-red-100">
          <div className="text-xs font-semibold text-red-950 mb-2 flex items-center gap-1.5">
            <Users className="h-4 w-4 text-red-600" /> Voluntary Donor Response Network
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-white p-2 rounded-lg border border-red-100">
              <span className="text-gray-400 text-[10px] block">Alerted</span>
              <strong className="text-base text-gray-800">{sos.donorsAlertedCount || 0}</strong>
            </div>
            <div className="bg-white p-2 rounded-lg border border-emerald-100">
              <span className="text-emerald-600 text-[10px] block font-semibold">Available</span>
              <strong className="text-base text-emerald-700">{sos.donorsAvailableCount || 0}</strong>
            </div>
            <div className="bg-white p-2 rounded-lg border border-gray-100">
              <span className="text-gray-400 text-[10px] block">Declined</span>
              <strong className="text-base text-gray-500">{sos.donorsDeclinedCount || 0}</strong>
            </div>
          </div>
        </div>

        {/* Emergency Directions & Action */}
        <div className="pt-2 flex flex-wrap gap-2">
          {sos.userLocation?.lat != null && (
            <a
              href={`https://maps.google.com/?q=${sos.userLocation.lat},${sos.userLocation.lon}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-medium transition-colors"
            >
              <Navigation className="h-3.5 w-3.5 text-blue-600" /> View Emergency Location on Map
            </a>
          )}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Emergency Blood SOS (${refCode}): A patient urgently needs ${sos.bloodGroup} blood. Track request in real-time: ${typeof window !== 'undefined' ? window.location.origin : ''}/track?query=${refCode}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5 text-emerald-600" /> Share Emergency via WhatsApp
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function RequestCard({ req, onCancel }: { req: PatientRequest; onCancel: (req: PatientRequest) => void }) {
  if (req.type === 'sos' || (req.referenceId && req.referenceId.startsWith('SOS-'))) {
    return <SosTrackerCard sos={req} />;
  }

  const meta = STATUS_META[req.deliveryStatus] || STATUS_META.pending;
  const fulfilling = req.allocatedHospitalId;
  const preferred = req.preferredHospitalId;
  const h = fulfilling || preferred;
  const isAllocated = Boolean(fulfilling);
  const canCancel = req.deliveryStatus === 'pending' || req.deliveryStatus === 'approved';
  const refCode = shortRef(req._id, req.referenceId);

  const mapsUrl = h?.location?.coordinates
    ? `https://www.google.com/maps/dir/?api=1&destination=${h.location.coordinates[1]},${h.location.coordinates[0]}`
    : undefined;

  return (
    <Card className="mb-4">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-gray-700">#{refCode}</span>
              <span className="text-xs uppercase font-semibold text-gray-500">{req.resourceType}</span>
              {req.bloodGroup && (
                <Badge variant="outline" className="text-xs font-bold text-red-600 border-red-200">
                  {req.bloodGroup}
                </Badge>
              )}
            </div>
            {req.patientName && <p className="text-sm font-semibold text-gray-900 mt-1">{req.patientName}</p>}
            <p className="text-xs text-gray-500 mt-0.5">
              {req.units} unit{req.units === 1 ? '' : 's'} · {req.urgency} urgency
            </p>
          </div>
          <Badge className={meta.className}>{meta.label}</Badge>
        </div>

        <StatusTimeline req={req} />

        {h ? (
          <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
            <div className="flex items-center justify-between">
              <span className={`font-semibold ${
                isAllocated ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                {isAllocated ? 'Fulfilling Hospital' : 'Preferred Hospital (Matching in progress)'}
              </span>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
                >
                  <Navigation className="h-3 w-3" /> Get Directions
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 font-medium text-gray-800">
              <Building2 className="h-4 w-4 text-gray-400" /> {h.name}
            </div>
            {h.address && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" /> {h.address}</div>}
            {h.contactPhone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" />
                <a href={`tel:${h.contactPhone}`} className="text-primary hover:underline">{h.contactPhone}</a>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            Automatic hospital allocation in progress — we will alert you once a hospital with stock is matched.
          </div>
        )}

        {canCancel && (
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 h-8"
              onClick={() => onCancel(req)}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel Request
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrackRequestContent() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientRequest[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Privacy verification state for SOS queries
  const [privacyChallenge, setPrivacyChallenge] = useState<{ referenceId: string; message: string } | null>(null);
  const [privacyPhone, setPrivacyPhone] = useState('');
  const [privacyLoading, setPrivacyLoading] = useState(false);

  // Cancellation state
  const [cancelModal, setCancelModal] = useState<PatientRequest | null>(null);
  const [cancelPhone, setCancelPhone] = useState('');
  const [cancelReason, setCancelReason] = useState('Patient transferred to another hospital');
  const [customReason, setCustomReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState('');

  const runSearch = useCallback(async (raw: string, phoneVerification = '') => {
    const value = raw.trim();
    if (!value) {
      setError('Please enter your phone number, SBB requisition ID, or SOS reference ID.');
      return;
    }
    setError('');
    setCancelSuccess('');
    setPrivacyChallenge(null);
    setLoading(true);

    try {
      const url = phoneVerification
        ? `/patient-requests/track/${encodeURIComponent(value)}?phone=${encodeURIComponent(phoneVerification)}`
        : `/patient-requests/track/${encodeURIComponent(value)}`;

      const res = await apiClient.get(url);

      if (res.data?.requiresPhone) {
        setPrivacyChallenge({
          referenceId: res.data.referenceId || value,
          message: res.data.message || 'For emergency SOS privacy under NDPA 2023, please enter the phone number associated with this SOS ID.',
        });
        setResults(null);
        return;
      }

      setResults(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError(err.response?.data?.error || 'The phone number entered does not match the emergency contact on file for this SOS ID.');
      } else {
        setError(err.response?.data?.error || 'Could not complete lookup. Please check reference ID or phone number.');
      }
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Deep-link support: /track?phone=... or ?query=... or ?ref=...
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('query') || params.get('ref') || params.get('phone');
    const p = params.get('verifyPhone') || params.get('phone');
    if (q) {
      setQuery(q);
      runSearch(q, p && p !== q ? p : '');
    }
  }, [runSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const handlePrivacySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!privacyChallenge || !privacyPhone.trim()) return;
    setPrivacyLoading(true);
    await runSearch(privacyChallenge.referenceId, privacyPhone.trim());
    setPrivacyLoading(false);
  };

  const openCancelModal = (req: PatientRequest) => {
    setCancelModal(req);
    const digits = query.replace(/\D/g, '');
    setCancelPhone(digits.length >= 10 ? query : (req.contactPhone || ''));
    setCancelReason('Patient transferred to another hospital');
    setCustomReason('');
    setCancelError('');
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModal) return;
    if (!cancelPhone.trim()) {
      setCancelError('Please provide your contact phone number to verify cancellation.');
      return;
    }
    const finalReason = cancelReason === 'Other' ? (customReason.trim() || 'Other reason') : cancelReason;
    setCancelling(true);
    setCancelError('');
    try {
      await apiClient.post(`/patient-requests/${cancelModal._id}/cancel`, {
        phone: cancelPhone.trim(),
        reason: finalReason,
      });
      const refCode = shortRef(cancelModal._id, cancelModal.referenceId);
      setCancelSuccess(`Request #${refCode} was successfully cancelled. Allocated inventory has been released.`);
      setCancelModal(null);
      runSearch(query || cancelPhone);
    } catch (err: any) {
      setCancelError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to cancel request. Ensure your phone number matches the number used when requesting.'
      );
    } finally {
      setCancelling(false);
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
            <h1 className="text-xl font-bold text-gray-800">Track your request</h1>
            <p className="text-xs text-gray-400">Track standard requisitions (SBB-) and emergency SOS alerts (SOS-)</p>
          </div>
        </div>

        {cancelSuccess && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Cancellation Confirmed</p>
              <p className="text-xs mt-0.5">{cancelSuccess}</p>
            </div>
          </div>
        )}

        <Card className="mb-6 shadow-sm">
          <CardContent className="p-5">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-gray-700">Phone number or Reference ID</Label>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value.toUpperCase())}
                  placeholder="e.g. 08012345678, SBB-4A7F2, or SOS-J41DD"
                  autoFocus
                  className="mt-1"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Enter the phone number used during submission, your 6-char Requisition ID, or Emergency SOS ID.
                </p>
              </div>
              {error && <p className="text-red-500 text-xs bg-red-50 p-2.5 rounded-lg border border-red-200">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                <Search className="h-4 w-4 mr-1" />
                {loading ? 'Searching…' : 'Track request'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* SOS Privacy Guardrail Challenge */}
        {privacyChallenge && (
          <Card className="mb-6 border-amber-200 bg-amber-50/70 shadow-sm animate-in fade-in-0 duration-200">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <Lock className="h-4 w-4 text-amber-700" />
                <span>Emergency SOS Privacy Verification</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                For patient and caller privacy under NDPA 2023, please verify the contact phone number used when raising <strong>{privacyChallenge.referenceId}</strong> to view live hospital and donor tracking.
              </p>
              <form onSubmit={handlePrivacySubmit} className="space-y-3 pt-1">
                <div>
                  <Label className="text-xs text-amber-950 font-semibold">Contact Phone Number</Label>
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={privacyPhone}
                    onChange={(e) => setPrivacyPhone(e.target.value)}
                    placeholder="e.g. 08012345678"
                    className="bg-white mt-1"
                    required
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full bg-amber-700 hover:bg-amber-800 text-white text-xs h-9" disabled={privacyLoading}>
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                  {privacyLoading ? 'Verifying Phone…' : 'Unlock SOS Live Tracking'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {results !== null && !loading && (
          results.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                <p className="font-semibold text-gray-700">No requests found</p>
                <p className="text-xs mt-1">
                  We couldn&apos;t find an active requisition or SOS broadcast matching that query. Please verify the reference ID or phone number, or{' '}
                  <Link href="/request" className="text-primary hover:underline">submit a standard request</Link>.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                {results.length} active request{results.length === 1 ? '' : 's'} found
              </p>
              {results.map((r) => (
                <RequestCard key={r._id} req={r} onCancel={openCancelModal} />
              ))}
            </div>
          )
        )}

        {/* Self-service cancellation modal */}
        {cancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-6 border border-gray-200 animate-in fade-in-0 zoom-in-95 duration-150">
              <div className="flex items-center gap-2 text-red-600 mb-2">
                <AlertCircle className="h-5 w-5" />
                <h3 className="text-lg font-bold text-gray-900">
                  Cancel Request #{shortRef(cancelModal._id, cancelModal.referenceId)}
                </h3>
              </div>
              <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                Cancelling will release any allocated blood or oxygen back into hospital inventory for other patients.
              </p>

              <form onSubmit={handleConfirmCancel} className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold text-gray-700">Contact Phone Number *</Label>
                  <Input
                    value={cancelPhone}
                    onChange={(e) => setCancelPhone(e.target.value)}
                    placeholder="Enter phone used when requesting"
                    inputMode="tel"
                    required
                    className="mt-1"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Must match the phone number on file to verify identity.</p>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-gray-700">Reason for Cancellation</Label>
                  <select
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="Patient transferred to another hospital">Patient transferred to another hospital</option>
                    <option value="Found alternative blood/oxygen source">Found alternative blood/oxygen source</option>
                    <option value="Procedure rescheduled or cancelled">Procedure rescheduled or cancelled</option>
                    <option value="Patient condition stabilized">Patient condition stabilized</option>
                    <option value="Entered incorrect details">Entered incorrect details</option>
                    <option value="Other">Other reason</option>
                  </select>
                </div>

                {cancelReason === 'Other' && (
                  <div>
                    <Label className="text-xs font-semibold text-gray-700">Specify Reason</Label>
                    <Input
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="Brief explanation..."
                      className="mt-1"
                      required
                    />
                  </div>
                )}

                {cancelError && (
                  <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded border border-red-200">{cancelError}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCancelModal(null)}
                    disabled={cancelling}
                  >
                    Keep Request
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={cancelling}
                  >
                    {cancelling ? 'Cancelling…' : 'Confirm Cancellation'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TrackRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-xs text-gray-400">Loading tracker…</p>
        </div>
      }
    >
      <TrackRequestContent />
    </Suspense>
  );
}
