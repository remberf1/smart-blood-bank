'use client';
import { useEffect, useState, useCallback } from 'react';
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
}

// Ordered pipeline the status badge and timeline walk through.
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

const shortRef = (id: string) => id.slice(-6).toUpperCase();
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

function RequestCard({ req, onCancel }: { req: PatientRequest; onCancel: (req: PatientRequest) => void }) {
  const meta = STATUS_META[req.deliveryStatus] || STATUS_META.pending;
  const fulfilling = req.allocatedHospitalId;
  const preferred = req.preferredHospitalId;
  const h = fulfilling || preferred;
  const isAllocated = Boolean(fulfilling);
  const canCancel = req.deliveryStatus === 'pending' || req.deliveryStatus === 'approved';

  const mapsUrl = h?.location?.coordinates?.length === 2
    ? `https://maps.google.com/?q=${h.location.coordinates[1]},${h.location.coordinates[0]}`
    : h ? `https://maps.google.com/?q=${encodeURIComponent(h.name + ' ' + (h.address || ''))}` : '';

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800 capitalize">
                {req.resourceType}
                {req.bloodGroup ? ` · ${req.bloodGroup}` : ''}
              </span>
              <Badge className={meta.className}>{meta.label}</Badge>
            </div>
            {req.patientName && (
              <p className="text-sm font-medium text-gray-700 mt-0.5">
                Patient: {req.patientName}
              </p>
            )}
            <p className="text-sm text-gray-500 mt-0.5">
              {req.units} unit{req.units === 1 ? '' : 's'} · {req.urgency} · ref{' '}
              <span className="font-mono font-semibold text-gray-800">{shortRef(req._id)}</span>
            </p>
            {req.scheduledTime && (
              <p className="text-xs text-blue-600 font-medium mt-1">
                🗓️ Scheduled for: {new Date(req.scheduledTime).toLocaleString()}
              </p>
            )}
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">{fmt(req.createdAt)}</span>
        </div>

        {(req.destinationFacility || req.ward || req.bedNumber) && (
          <div className="mt-3 text-xs bg-slate-50 border border-slate-200 rounded p-2.5 text-slate-700">
            <span className="font-semibold text-slate-900">📍 Destination: </span>
            {req.destinationFacility || 'Hospital / Clinic'}
            {req.ward && ` · Ward: ${req.ward}`}
            {req.bedNumber && ` · Bed: ${req.bedNumber}`}
          </div>
        )}

        {req.deliveryStatus === 'cancelled' && req.cancellationReason && (
          <div className="mt-3 text-xs text-red-700 bg-red-50 p-2.5 rounded border border-red-200">
            <span className="font-semibold">⚠️ Cancellation Reason:</span> {req.cancellationReason}
          </div>
        )}

        <StatusTimeline req={req} />

        {h ? (
          <div className="mt-4 pt-3 border-t border-gray-100 text-sm text-gray-600 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                isAllocated
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
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

export default function TrackRequestPage() {
  const [phone, setPhone] = useState('');
  const [results, setResults] = useState<PatientRequest[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Cancellation state
  const [cancelModal, setCancelModal] = useState<PatientRequest | null>(null);
  const [cancelPhone, setCancelPhone] = useState('');
  const [cancelReason, setCancelReason] = useState('Patient transferred to another hospital');
  const [customReason, setCustomReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState('');

  const runSearch = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) {
      setError('Please enter your phone number or 6-character request reference ID.');
      return;
    }
    setError('');
    setCancelSuccess('');
    setLoading(true);
    try {
      const res = await apiClient.get(`/patient-requests/track/${encodeURIComponent(value)}`);
      setResults(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError('Could not look up your requests right now. Please try again shortly.');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Deep-link support: /track?phone=... or ?query=... or ?ref=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('phone') || params.get('query') || params.get('ref');
    if (q) {
      setPhone(q);
      runSearch(q);
    }
  }, [runSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(phone);
  };

  const openCancelModal = (req: PatientRequest) => {
    setCancelModal(req);
    const digits = phone.replace(/\D/g, '');
    setCancelPhone(digits.length >= 10 ? phone : (req.contactPhone || ''));
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
      const refCode = shortRef(cancelModal._id);
      setCancelSuccess(`Request #${refCode} was successfully cancelled. Allocated inventory has been released.`);
      setCancelModal(null);
      // Re-fetch to update card status
      runSearch(phone || cancelPhone);
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
            <p className="text-xs text-gray-400">Track status by phone number or reference ID</p>
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

        <Card className="mb-6">
          <CardContent className="p-5">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label>Phone number or Reference ID</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 08012345678 or Reference (e.g. 3F8A1B)"
                  autoFocus
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Enter the phone number used during submission or the 6-character reference ID.
                </p>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                <Search className="h-4 w-4 mr-1" />
                {loading ? 'Searching…' : 'Track request'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {results !== null && !loading && (
          results.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No requests found for that query. Double-check the phone or reference ID, or{' '}
                <Link href="/request" className="text-primary hover:underline">submit a new request</Link>.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                {results.length} request{results.length === 1 ? '' : 's'} found
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
                  Cancel Request #{shortRef(cancelModal._id)}
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
