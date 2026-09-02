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
  Clock, XCircle, Building2, Phone, MapPin,
} from 'lucide-react';

interface Hospital { _id: string; name: string; address?: string; contactPhone?: string }
interface PatientRequest {
  _id: string;
  patientName?: string;
  resourceType: 'blood' | 'oxygen';
  bloodGroup?: string;
  units: number;
  urgency: string;
  deliveryStatus: 'pending' | 'approved' | 'in-transit' | 'delivered' | 'cancelled';
  preferredHospitalId?: Hospital;
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

function RequestCard({ req }: { req: PatientRequest }) {
  const meta = STATUS_META[req.deliveryStatus] || STATUS_META.pending;
  const h = req.preferredHospitalId;
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
            <p className="text-sm text-gray-500 mt-0.5">
              {req.units} unit{req.units === 1 ? '' : 's'} · {req.urgency} · ref{' '}
              <span className="font-mono">{shortRef(req._id)}</span>
            </p>
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">{fmt(req.createdAt)}</span>
        </div>

        <StatusTimeline req={req} />

        {h && (
          <div className="mt-4 pt-3 border-t border-gray-100 text-sm text-gray-600 space-y-1">
            <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-gray-400" /> {h.name}</div>
            {h.address && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" /> {h.address}</div>}
            {h.contactPhone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" />
                <a href={`tel:${h.contactPhone}`} className="text-primary hover:underline">{h.contactPhone}</a>
              </div>
            )}
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

  const runSearch = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) {
      setError('Please enter the phone number used for the request.');
      return;
    }
    setError('');
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

  // Deep-link support: /track?phone=... (used by email/WhatsApp links).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('phone');
    if (q) {
      setPhone(q);
      runSearch(q);
    }
  }, [runSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(phone);
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
            <p className="text-xs text-gray-400">Enter your phone number to see the latest status</p>
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="p-5">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label>Phone number</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08012345678"
                  inputMode="tel"
                  autoFocus
                />
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
                No requests found for that number. Double-check the phone number, or{' '}
                <Link href="/request" className="text-primary hover:underline">submit a new request</Link>.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                {results.length} request{results.length === 1 ? '' : 's'} found
              </p>
              {results.map((r) => <RequestCard key={r._id} req={r} />)}
            </div>
          )
        )}
      </div>
    </div>
  );
}
