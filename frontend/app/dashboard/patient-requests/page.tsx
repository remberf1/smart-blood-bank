'use client';
import { useEffect, useState, useCallback } from 'react';
import apiClient from '../../api/client';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Loading, EmptyState } from '@/components/ui/states';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Droplet, Wind, Inbox, Printer } from 'lucide-react';

interface Hospital { _id: string; name: string }
interface PatientRequest {
  _id: string;
  patientName?: string;
  contactPhone: string;
  email?: string;
  resourceType: 'blood' | 'oxygen';
  bloodGroup?: string;
  units: number;
  urgency: 'emergency' | 'scheduled' | 'routine';
  scheduledTime?: string;
  destinationFacility?: string;
  ward?: string;
  bedNumber?: string;
  deliveryStatus: 'pending' | 'approved' | 'in-transit' | 'delivered' | 'cancelled';
  cancellationReason?: string;
  cancelledAt?: string;
  preferredHospitalId?: Hospital | null;
  allocatedHospitalId?: Hospital | null;
  createdAt: string;
  notes?: string;
}

const STATUSES = ['', 'pending', 'approved', 'in-transit', 'delivered', 'cancelled'];
const NEXT: Record<string, { status: string; label: string; variant?: any }[]> = {
  pending: [{ status: 'approved', label: 'Approve' }, { status: 'cancelled', label: 'Cancel', variant: 'destructive' }],
  approved: [{ status: 'in-transit', label: 'In Transit' }, { status: 'delivered', label: 'Deliver' }, { status: 'cancelled', label: 'Cancel', variant: 'destructive' }],
  'in-transit': [{ status: 'delivered', label: 'Deliver' }, { status: 'cancelled', label: 'Cancel', variant: 'destructive' }],
};

function statusBadge(s: string) {
  const map: Record<string, string> = {
    pending: 'bg-muted text-foreground',
    approved: 'bg-blue-100 text-blue-700',
    'in-transit': 'bg-amber-100 text-amber-700',
    delivered: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
  };
  return <Badge className={map[s] || ''}>{s}</Badge>;
}

export default function PatientRequestsPage() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [requests, setRequests] = useState<PatientRequest[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [status, setStatus] = useState('');
  const [scope, setScope] = useState<'all' | 'my-hospital' | 'unassigned'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [assignSel, setAssignSel] = useState<Record<string, string>>({});
  const [printModalRequest, setPrintModalRequest] = useState<PatientRequest | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/patient-requests', {
        params: {
          status: status || undefined,
          scope: scope !== 'all' ? scope : undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
          page,
        },
      });
      setRequests(r.data.data);
      setTotalPages(r.data.totalPages);
      setTotal(r.data.total);
    } catch {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [page, status, scope, fromDate, toDate]);

  useEffect(() => { setPage(1); }, [status, scope, fromDate, toDate]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (isSuperadmin) apiClient.get('/hospitals').then((r) => setHospitals(r.data)).catch(() => {}); }, [isSuperadmin]);

  const advance = async (id: string, newStatus: string) => {
    try {
      await apiClient.put(`/patient-requests/${id}/status`, { deliveryStatus: newStatus });
      toast.success(`Marked ${newStatus}`);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
  };

  const assign = async (id: string) => {
    const hospitalId = assignSel[id];
    if (!hospitalId) return;
    try {
      await apiClient.post(`/patient-requests/${id}/assign`, { hospitalId });
      toast.success('Hospital assigned');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Assign failed');
    }
  };

  const claim = async (id: string) => {
    try {
      await apiClient.post(`/patient-requests/${id}/assign`, {});
      toast.success('Request claimed & approved for your hospital!');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Claim failed');
    }
  };

  const canAct = (r: PatientRequest) =>
    isSuperadmin ||
    r.allocatedHospitalId?._id === user?.hospitalId ||
    r.preferredHospitalId?._id === user?.hospitalId;

  return (
    <div className="space-y-6">
      <PageHeader title="Patient Requests" subtitle="Requests submitted by patients & families" />

      {/* Scope & Status filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 p-1 bg-muted/60 rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              scope === 'all' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Requests
          </button>
          {!isSuperadmin && (
            <button
              type="button"
              onClick={() => setScope('my-hospital')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                scope === 'my-hospital' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              My Hospital
            </button>
          )}
          <button
            type="button"
            onClick={() => setScope('unassigned')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              scope === 'unassigned' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Unassigned (Claimable)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground ml-auto">
          <div className="inline-flex items-center gap-1 border border-input rounded-lg px-2 py-1 bg-card">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="text-xs bg-transparent focus:outline-hidden"
              aria-label="Filter from date"
            />
          </div>
          <span>–</span>
          <div className="inline-flex items-center gap-1 border border-input rounded-lg px-2 py-1 bg-card">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="text-xs bg-transparent focus:outline-hidden"
              aria-label="Filter to date"
            />
          </div>
          {(fromDate || toDate) && (
            <button type="button" onClick={() => { setFromDate(''); setToDate(''); }} className="text-xs text-muted-foreground hover:text-foreground ml-1">clear</button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              status === s ? 'bg-primary text-white border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted/50'
            }`}
          >
            {s === '' ? 'All Statuses' : s}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Units</TableHead>
                <TableHead>Urgency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Hospital</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9}><Loading /></TableCell></TableRow>
              ) : requests.length === 0 ? (
                <TableRow><TableCell colSpan={9}><EmptyState icon={Inbox} title={`No patient requests${status ? ` (${status})` : ''}`} hint="New requests from the public form or WhatsApp will appear here." /></TableCell></TableRow>
              ) : (
                requests.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="font-medium">
                      <div>{r.patientName || <span className="text-muted-foreground">—</span>}</div>
                      {(r.destinationFacility || r.ward) && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          🏥 {r.destinationFacility || 'Facility'}{r.ward ? ` (${r.ward}${r.bedNumber ? ` · ${r.bedNumber}` : ''})` : ''}
                        </div>
                      )}
                      {r.deliveryStatus === 'cancelled' && r.cancellationReason && (
                        <div className="text-[10px] text-red-600 mt-0.5">
                          ⚠️ {r.cancellationReason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div>{r.contactPhone}</div>
                      {r.email && <div className="text-xs">{r.email}</div>}
                    </TableCell>
                    <TableCell>
                      {r.resourceType === 'blood' ? (
                        <span className="flex items-center gap-1"><Droplet className="h-4 w-4 text-red-500" /> {r.bloodGroup}</span>
                      ) : (
                        <span className="flex items-center gap-1"><Wind className="h-4 w-4 text-blue-500" /> Oxygen</span>
                      )}
                    </TableCell>
                    <TableCell>{r.units}</TableCell>
                    <TableCell>
                      <Badge className={r.urgency === 'emergency' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}>{r.urgency}</Badge>
                      {r.scheduledTime && (
                        <div className="text-[11px] text-blue-600 font-medium mt-1">
                          📅 {new Date(r.scheduledTime).toLocaleDateString()} {new Date(r.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(r.deliveryStatus)}</TableCell>
                    <TableCell className="text-sm">
                      {r.allocatedHospitalId?.name || r.preferredHospitalId?.name || <span className="text-amber-600 font-medium">Unassigned</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {canAct(r) && (NEXT[r.deliveryStatus] || []).map((a) => (
                            <Button key={a.status} size="sm" variant={a.variant || 'default'} onClick={() => advance(r._id, a.status)}>{a.label}</Button>
                          ))}
                          {r.deliveryStatus !== 'cancelled' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-xs text-gray-700 hover:text-gray-900 border-gray-300"
                              onClick={() => setPrintModalRequest(r)}
                            >
                              <Printer className="h-3.5 w-3.5 mr-1" /> Slip
                            </Button>
                          )}
                        </div>
                        {!r.allocatedHospitalId && r.deliveryStatus === 'pending' && !isSuperadmin && user?.hospitalId && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                            onClick={() => claim(r._id)}
                          >
                            Claim &amp; Fulfill
                          </Button>
                        )}
                        {isSuperadmin && !r.allocatedHospitalId && r.deliveryStatus !== 'cancelled' && r.deliveryStatus !== 'delivered' && (
                          <div className="flex gap-1 items-center">
                            <select
                              value={assignSel[r._id] || ''}
                              onChange={(e) => setAssignSel((s) => ({ ...s, [r._id]: e.target.value }))}
                              className="border border-input rounded p-1 text-xs max-w-[140px]"
                            >
                              <option value="">Assign hospital…</option>
                              {hospitals.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
                            </select>
                            <Button size="sm" variant="outline" onClick={() => assign(r._id)} disabled={!assignSel[r._id]}>Assign</Button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages} · {total} request{total === 1 ? '' : 's'}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page <= 1 || loading}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(p + 1, totalPages))} disabled={page >= totalPages || loading}>Next</Button>
          </div>
        </div>
      )}

      {/* Printable Clinical Cold-Chain & Dispatch Slip Modal */}
      {printModalRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl border border-gray-200 overflow-hidden my-8">
            {/* Modal Controls Bar */}
            <div className="flex items-center justify-between px-6 py-3 bg-gray-100 border-b border-gray-200 no-print">
              <div className="flex items-center gap-2">
                <Printer className="h-4 w-4 text-gray-700" />
                <span className="font-semibold text-sm text-gray-800">Dispatch &amp; Cold-Chain Slip Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-white font-medium flex items-center gap-1.5 h-8 text-xs"
                  onClick={() => window.print()}
                >
                  <Printer className="h-3.5 w-3.5" /> Print Slip
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setPrintModalRequest(null)}
                >
                  Close
                </Button>
              </div>
            </div>

            {/* Document Printable Slip */}
            <div id="dispatch-slip-modal" className="p-8 bg-white text-gray-900 font-sans text-xs space-y-6">
              {/* Slip Header */}
              <div className="border-b-2 border-primary pb-4 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-white font-bold">
                      {printModalRequest.resourceType === 'blood' ? '🩸' : '🫧'}
                    </div>
                    <div>
                      <h1 className="text-base font-extrabold uppercase tracking-wide text-gray-900">
                        Smart Blood Bank &amp; Oxygen Network
                      </h1>
                      <p className="text-[11px] text-gray-500 font-medium">
                        Official Clinical Dispatch &amp; Cold-Chain Handover Note
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-gray-800">
                    REF: #{printModalRequest._id.slice(-6).toUpperCase()}
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono">
                    ID: {printModalRequest._id}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    Date: {new Date().toLocaleDateString('en-GB')}
                  </div>
                </div>
              </div>

              {/* Fulfilling Facility Bar */}
              <div className="bg-gray-50 p-3 rounded-md border border-gray-200 flex justify-between items-center text-xs">
                <div>
                  <span className="font-semibold text-gray-600 uppercase text-[10px] block">Dispatched From</span>
                  <span className="font-bold text-gray-900 text-sm">
                    {printModalRequest.allocatedHospitalId?.name || printModalRequest.preferredHospitalId?.name || 'Central Distribution Blood Bank'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-gray-600 uppercase text-[10px] block">Status &amp; Priority</span>
                  <span className="font-bold text-gray-900 capitalize">
                    {printModalRequest.urgency} ({printModalRequest.deliveryStatus})
                  </span>
                </div>
              </div>

              {/* Patient & Destination Profile */}
              <div className="grid grid-cols-2 gap-4 border border-gray-200 rounded-md p-3.5">
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Patient Information
                  </h3>
                  <p className="font-bold text-sm text-gray-900">{printModalRequest.patientName || 'Emergency Patient'}</p>
                  <p className="text-gray-600">Contact: {printModalRequest.contactPhone}</p>
                  {printModalRequest.email && <p className="text-gray-600">Email: {printModalRequest.email}</p>}
                </div>
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Destination &amp; Location
                  </h3>
                  <p className="font-bold text-sm text-gray-900">
                    {printModalRequest.destinationFacility || 'Designated Facility / Hospital'}
                  </p>
                  <p className="text-gray-600">
                    Ward: <span className="font-semibold">{printModalRequest.ward || 'General'}</span>
                    {printModalRequest.bedNumber ? ` · Bed / Room: ${printModalRequest.bedNumber}` : ''}
                  </p>
                  {printModalRequest.scheduledTime && (
                    <p className="text-blue-700 font-medium mt-0.5">
                      Scheduled: {new Date(printModalRequest.scheduledTime).toLocaleString('en-GB')}
                    </p>
                  )}
                </div>
              </div>

              {/* Resource & Cold-Chain Checklist */}
              <div className="border border-gray-200 rounded-md p-3.5 space-y-2.5">
                <div className="flex justify-between items-center border-b pb-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-500">Resource Payload</span>
                    <p className="text-sm font-extrabold text-primary uppercase">
                      {printModalRequest.resourceType === 'blood'
                        ? `${printModalRequest.units} Unit(s) Blood (${printModalRequest.bloodGroup})`
                        : `${printModalRequest.units} Cylinder(s) Medical Oxygen`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Dispatch Timestamp</span>
                    <p className="font-mono text-gray-800">{new Date().toLocaleTimeString('en-GB')}</p>
                  </div>
                </div>

                {printModalRequest.resourceType === 'blood' ? (
                  <div>
                    <h4 className="font-bold text-gray-800 text-[11px] mb-1">Cold-Chain Protocol Compliance Check:</h4>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-700">
                      <div className="flex items-center gap-1.5">☑ Temperature verified (2°C – 6°C)</div>
                      <div className="flex items-center gap-1.5">☑ Thermal box sealed &amp; sanitized</div>
                      <div className="flex items-center gap-1.5">☑ Anticoagulant &amp; bag integrity intact</div>
                      <div className="flex items-center gap-1.5">☑ Expiry &amp; donor batch traceable</div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h4 className="font-bold text-gray-800 text-[11px] mb-1">Medical Oxygen Safety Compliance Check:</h4>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-700">
                      <div className="flex items-center gap-1.5">☑ Cylinder fill status: Tested Full</div>
                      <div className="flex items-center gap-1.5">☑ Valve seal &amp; tamper tape intact</div>
                      <div className="flex items-center gap-1.5">☑ Hydrostatic safety test current</div>
                      <div className="flex items-center gap-1.5">☑ Upright transit harness secured</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Chain of Custody & Sign-offs */}
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Chain of Custody Handover Signatures
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-gray-300 rounded p-2 text-[10px] space-y-4">
                    <span className="font-bold text-gray-800 block border-b pb-1">1. Dispatched By (Hospital)</span>
                    <div className="space-y-1 text-gray-600">
                      <p>Name: _________________</p>
                      <p>Staff ID: _______________</p>
                      <p>Sign/Date: _____________</p>
                    </div>
                  </div>
                  <div className="border border-gray-300 rounded p-2 text-[10px] space-y-4">
                    <span className="font-bold text-gray-800 block border-b pb-1">2. Courier / Logistics</span>
                    <div className="space-y-1 text-gray-600">
                      <p>Driver: _________________</p>
                      <p>Vehicle: ________________</p>
                      <p>Sign/Date: _____________</p>
                    </div>
                  </div>
                  <div className="border border-gray-300 rounded p-2 text-[10px] space-y-4">
                    <span className="font-bold text-gray-800 block border-b pb-1">3. Received By (Ward/Clinic)</span>
                    <div className="space-y-1 text-gray-600">
                      <p>Nurse/Doctor: __________</p>
                      <p>Arrival Temp: ___________</p>
                      <p>Sign/Date: _____________</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer advisory */}
              <div className="text-[9px] text-gray-400 border-t pt-2 text-center leading-normal">
                Strict storage instruction: Blood products must be stored at +2°C to +6°C and transfused within 30 minutes of leaving cold storage. Oxygen cylinders must be kept upright and secured in well-ventilated areas.
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #dispatch-slip-modal, #dispatch-slip-modal * {
            visibility: visible;
          }
          #dispatch-slip-modal {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
