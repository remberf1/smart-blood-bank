'use client';
import { useEffect, useState, useCallback } from 'react';
import apiClient from '../../api/client';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Loading, EmptyState } from '@/components/ui/states';
import { useAuth } from '../../contexts/AuthContext';
import { Siren, Phone, MapPin, Droplet, CheckCircle2, Users, AlertTriangle, ShieldAlert, Wrench, MessageSquare, Radio } from 'lucide-react';

interface DonorRef { _id?: string; name?: string; phone?: string; bloodGroup?: string }
interface Alerted { donorId?: DonorRef | string; phone: string; status: string }
interface Responded { donorId?: DonorRef | string; response: string; timestamp: string }
interface Sos {
  _id: string;
  referenceId?: string;
  tier?: 'clinical' | 'public';
  authCode?: string;
  hospitalTriageStatus?: string;
  bloodGroup: string;
  doctorName?: string;
  doctorPhone?: string;
  hospitalName?: string;
  componentNeeded?: string;
  userLocation?: { lat: number; lon: number };
  userPhone?: string;
  radiusKm: number;
  donorsAlerted: Alerted[];
  donorsResponded: Responded[];
  status: 'pending' | 'resolved' | 'expired';
  createdAt: string;
}

const FILTERS = ['', 'pending', 'resolved', 'expired'];

const statusBadge = (s: string) => {
  if (s === 'pending') return <Badge className="bg-red-100 text-red-700">Active</Badge>;
  if (s === 'resolved') return <Badge className="bg-emerald-100 text-emerald-700">Resolved</Badge>;
  return <Badge className="bg-muted text-muted-foreground">Expired</Badge>;
};

const tierBadge = (tier?: string) => {
  if (tier === 'clinical') {
    return <span className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">🩺 Clinical (Verified)</span>;
  }
  return <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">📢 Public Bystander</span>;
};

const donorName = (d?: DonorRef | string) =>
  d && typeof d === 'object' ? d.name || d.phone || 'Donor' : 'Donor';

export default function SosPage() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';

  const [items, setItems] = useState<Sos[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Sos | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Technical Force-Resolve state (Super Admin IT Override)
  const [forceResolveOpen, setForceResolveOpen] = useState(false);
  const [forceResolveId, setForceResolveId] = useState<string | null>(null);
  const [forceResolveReason, setForceResolveReason] = useState('');
  const [forceResolving, setForceResolving] = useState(false);

  // Clinical Authorization state (Hospital Staff / Clinicians)
  const [clinicalConfirmOpen, setClinicalConfirmOpen] = useState(false);
  const [selectedSosForBroadcast, setSelectedSosForBroadcast] = useState<Sos | null>(null);
  const [confirmingBroadcast, setConfirmingBroadcast] = useState(false);
  const [expandingRadius, setExpandingRadius] = useState(false);

  const handleExpandBroadcast = async (id: string, radiusKm = 300) => {
    setExpandingRadius(true);
    try {
      const res = await apiClient.post(`/sos/${id}/expand-broadcast`, { radiusKm });
      toast.success(`Search radius expanded to ${res.data.radiusKm}km! Alerted ${res.data.newlyAlerted} additional donors.`);
      openDetail(id);
      fetchList();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to expand search radius');
    } finally {
      setExpandingRadius(false);
    }
  };

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/sos', { params: { status: status || undefined } });
      setItems(r.data);
    } catch {
      toast.error('Failed to load SOS requests');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail({ _id: id } as Sos);
    try {
      const r = await apiClient.get(`/sos/${id}`);
      setDetail(r.data);
    } catch {
      toast.error('Failed to load details');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const setSosStatus = async (id: string, newStatus: string) => {
    setBusyId(id);
    try {
      await apiClient.put(`/sos/${id}/status`, { status: newStatus });
      toast.success(newStatus === 'resolved' ? 'Marked resolved' : 'Marked expired');
      setDetail(null);
      fetchList();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const openForceResolve = (id: string) => {
    setForceResolveId(id);
    setForceResolveReason('');
    setForceResolveOpen(true);
  };

  const handleForceResolve = async () => {
    if (!forceResolveId) return;
    if (!forceResolveReason.trim() || forceResolveReason.trim().length < 8) {
      toast.error('Please enter a detailed technical reason (at least 8 characters).');
      return;
    }
    setForceResolving(true);
    try {
      await apiClient.post(`/sos/${forceResolveId}/technical-resolve`, {
        reason: forceResolveReason.trim(),
      });
      toast.success('Technical override applied: SOS ticket force-resolved and logged to audit trail.');
      setForceResolveOpen(false);
      setForceResolveId(null);
      setForceResolveReason('');
      fetchList();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to force resolve');
    } finally {
      setForceResolving(false);
    }
  };

  const openClinicalConfirm = (sos: Sos) => {
    setSelectedSosForBroadcast(sos);
    setClinicalConfirmOpen(true);
  };

  const handleConfirmBroadcast = async () => {
    if (!selectedSosForBroadcast) return;
    setConfirmingBroadcast(true);
    try {
      const res = await apiClient.post(`/sos/${selectedSosForBroadcast._id}/verify-broadcast`);
      toast.success(`Clinical SOS verified! Broadcasted to ${res.data.donorsAlerted} voluntary donors.`);
      setClinicalConfirmOpen(false);
      setSelectedSosForBroadcast(null);
      fetchList();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to verify and broadcast');
    } finally {
      setConfirmingBroadcast(false);
    }
  };

  const yesCount = (s: Sos) => s.donorsResponded.filter((r) => r.response === 'yes').length;
  const pendingCount = items.filter((s) => s.status === 'pending').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="SOS Emergencies"
        subtitle="Urgent donor alerts raised via WhatsApp — monitor responses and resolve"
        action={
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '') : ''}/api/whatsapp/qr`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            📱 Link WhatsApp (Scan QR)
          </a>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active emergencies</p>
              <p className="text-2xl font-bold text-foreground mt-1">{pendingCount}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pendingCount ? 'text-red-600 bg-red-50' : 'text-primary bg-primary-light'}`}>
              <Siren className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              status === s ? 'bg-primary text-white border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted/50'
            }`}
          >
            {s === '' ? 'All' : s === 'pending' ? 'Active' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Blood group</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Radius</TableHead>
                <TableHead>Alerted</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8}><Loading label="Loading SOS requests…" /></TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState icon={Siren} title={`No SOS requests${status ? ` (${status === 'pending' ? 'active' : status})` : ''}`} hint="Emergencies broadcast by doctors via WhatsApp (Option 4) or patients via emergency portal will appear here." />
                  </TableCell>
                </TableRow>
              ) : (
                items.map((s) => (
                  <TableRow key={s._id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 w-fit">
                            <Droplet className="h-3 w-3 mr-1" />{s.bloodGroup}
                          </Badge>
                          {tierBadge(s.tier)}
                        </div>
                        {s.referenceId && (
                          <span className="text-[11px] font-mono text-muted-foreground">{s.referenceId}</span>
                        )}
                        {s.authCode && (
                          <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 px-1 rounded">Auth: {s.authCode}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>
                        {s.doctorName && (
                          <p className="font-medium text-foreground">{s.doctorName}</p>
                        )}
                        {s.hospitalName && (
                          <p className="text-xs text-muted-foreground">{s.hospitalName}</p>
                        )}
                        {s.userPhone ? (
                          <a href={`tel:${s.userPhone}`} className="text-primary hover:underline flex items-center gap-1 text-xs">
                            <Phone className="h-3 w-3" />{s.userPhone}
                          </a>
                        ) : <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.radiusKm} km</TableCell>
                    <TableCell className="text-sm">
                      {s.donorsAlerted.length > 0 ? (
                        <span>{s.donorsAlerted.length}</span>
                      ) : (
                        <span className="text-xs text-blue-700 font-medium bg-blue-50 px-1.5 py-0.5 rounded">Hospital Triage</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {yesCount(s) > 0
                        ? <span className="text-emerald-700 font-medium">{yesCount(s)} available</span>
                        : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(s._id)} className="h-8 px-2.5">
                          <Users className="h-4 w-4 mr-1" />Details
                        </Button>
                        {s.tier === 'public' && s.status === 'pending' && (
                          isSuperadmin ? (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-amber-800 bg-amber-50 border-amber-300 text-[10px] font-medium py-1">
                                🩺 Hospital Review
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openForceResolve(s._id)}
                                className="h-8 px-2 text-amber-800 border-amber-300 hover:bg-amber-50 text-xs font-medium"
                                title="Force Resolve (Technical System Admin Override)"
                              >
                                <Wrench className="h-3.5 w-3.5 mr-1 text-amber-600" />Force Resolve
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              disabled={busyId === s._id}
                              onClick={() => openClinicalConfirm(s)}
                              className="h-8 px-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-xs"
                            >
                              <Siren className="h-3.5 w-3.5 mr-1" />Verify &amp; Alert
                            </Button>
                          )
                        )}
                        {s.status === 'pending' && (
                          <Button size="sm" variant="outline" disabled={busyId === s._id} onClick={() => setSosStatus(s._id, 'resolved')} className="h-8 px-2.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                            <CheckCircle2 className="h-4 w-4 mr-1" />Resolve
                          </Button>
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

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Siren className="h-5 w-5 text-red-600" /> SOS details
            </DialogTitle>
            <DialogDescription>Donors alerted and their responses.</DialogDescription>
          </DialogHeader>
          {detailLoading || !detail?.bloodGroup ? (
            <Loading label="Loading…" />
          ) : (
            <div className="space-y-4">
              {isSuperadmin && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-800">Platform Super Admin (IT Plane — Read-Only Monitoring)</p>
                    <p className="text-[11px] text-amber-700 leading-relaxed mt-0.5">
                      Under clinical governance and separation of duties, IT administrators cannot authorize clinical requisitions or trigger emergency donor broadcasts. Triage and donor blasts must be initiated by accredited hospital clinical staff.
                    </p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Blood group:</span> <strong>{detail.bloodGroup}</strong></div>
                <div><span className="text-muted-foreground">Reference:</span> <span className="font-mono font-medium">{detail.referenceId || detail._id.slice(-6).toUpperCase()}</span></div>
                <div><span className="text-muted-foreground">Doctor:</span> {detail.doctorName || '—'}</div>
                <div><span className="text-muted-foreground">Hospital:</span> {detail.hospitalName || '—'}</div>
                <div><span className="text-muted-foreground">Radius:</span> {detail.radiusKm} km</div>
                <div><span className="text-muted-foreground">Requester:</span> {detail.userPhone || '—'}</div>
                <div>
                  <span className="text-muted-foreground">Location:</span>{' '}
                  {detail.userLocation?.lat != null ? (
                    <a
                      href={`https://www.google.com/maps?q=${detail.userLocation.lat},${detail.userLocation.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <MapPin className="h-3 w-3" />map
                    </a>
                  ) : '—'}
                </div>
              </div>

              {/* Quick Contact Bar */}
              <div className="flex flex-wrap items-center gap-2 pt-2 pb-1 border-t border-border">
                {detail.userPhone && (
                  <>
                    <a href={`tel:${detail.userPhone}`}>
                      <Button size="sm" variant="outline" className="h-8 text-xs font-semibold">
                        <Phone className="h-3.5 w-3.5 mr-1 text-primary" /> Call Requester
                      </Button>
                    </a>
                    <a
                      href={`https://wa.me/${detail.userPhone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="sm" variant="outline" className="h-8 text-xs font-semibold text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                        <MessageSquare className="h-3.5 w-3.5 mr-1 text-emerald-600" /> WhatsApp Requester
                      </Button>
                    </a>
                  </>
                )}
                {detail.doctorPhone && (
                  <a href={`tel:${detail.doctorPhone}`}>
                    <Button size="sm" variant="outline" className="h-8 text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50">
                      <Phone className="h-3.5 w-3.5 mr-1 text-blue-600" /> Call Physician
                    </Button>
                  </a>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Responded
                </h4>
                {detail.donorsResponded.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No responses yet.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {detail.donorsResponded.map((r, i) => (
                      <li key={i} className="flex items-center justify-between rounded border border-border px-3 py-1.5">
                        <span>{donorName(r.donorId)}</span>
                        <Badge className={r.response === 'yes' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}>
                          {r.response === 'yes' ? 'Available' : 'Declined'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1">
                  <Users className="h-4 w-4 text-muted-foreground" /> Alerted ({detail.donorsAlerted.length})
                </h4>
                {detail.donorsAlerted.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No donors were alerted.</p>
                ) : (
                  <ul className="space-y-1 text-sm max-h-40 overflow-y-auto">
                    {detail.donorsAlerted.map((a, i) => (
                      <li key={i} className="flex items-center justify-between rounded border border-border px-3 py-1.5">
                        <span>{donorName(a.donorId)} <span className="text-muted-foreground">· {a.phone}</span></span>
                        <span className="text-xs text-muted-foreground">{a.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            {detail?.status === 'pending' && (
              <>
                {!isSuperadmin && (
                  <Button
                    variant="outline"
                    disabled={expandingRadius || busyId === detail._id}
                    onClick={() => handleExpandBroadcast(detail._id, 300)}
                    className="text-red-700 border-red-200 hover:bg-red-50 text-xs font-semibold"
                    title="Force expand search radius to 300km to mobilize regional donors"
                  >
                    <Radio className="h-3.5 w-3.5 mr-1 text-red-600 animate-pulse" />
                    {expandingRadius ? 'Expanding…' : 'Force Expand Radius (300km)'}
                  </Button>
                )}
                <Button variant="outline" disabled={busyId === detail._id} onClick={() => setSosStatus(detail._id, 'expired')}>
                  Mark expired
                </Button>
                <Button disabled={busyId === detail._id} onClick={() => setSosStatus(detail._id, 'resolved')} className="bg-emerald-600 hover:bg-emerald-700">
                  Resolve
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Super Admin Technical Force-Resolve Dialog (IT Plane Override) */}
      <Dialog open={forceResolveOpen} onOpenChange={setForceResolveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-800">
              <Wrench className="h-5 w-5 text-amber-600" /> Technical Force-Resolve (IT Override)
            </DialogTitle>
            <DialogDescription>
              This is an administrative override for duplicate, bugged, or stuck emergency tickets. This action will be permanently logged in the immutable audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Mandatory Technical Reason / Justification:
              </label>
              <textarea
                value={forceResolveReason}
                onChange={(e) => setForceResolveReason(e.target.value)}
                placeholder="e.g. Technical duplicate created due to network timeout. Verified resolved with facility engineer."
                rows={3}
                className="w-full text-xs p-2.5 rounded-lg border border-border bg-background focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
              <p className="text-[11px] text-muted-foreground">Minimum 8 characters required. Logged with your admin identity.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceResolveOpen(false)}>Cancel</Button>
            <Button
              onClick={handleForceResolve}
              disabled={forceResolving || forceResolveReason.trim().length < 8}
              className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
            >
              {forceResolving ? 'Applying Override…' : 'Confirm Technical Override'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hospital Staff Clinical Confirmation Dialog */}
      <Dialog open={clinicalConfirmOpen} onOpenChange={setClinicalConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Siren className="h-5 w-5" /> Clinical Authorization &amp; Donor Broadcast
            </DialogTitle>
            <DialogDescription>
              Authorizing mass voluntary donor mobilization for an emergency blood requisition.
            </DialogDescription>
          </DialogHeader>
          {selectedSosForBroadcast && (
            <div className="space-y-3 py-2 text-xs">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1 text-red-900">
                <p><strong>Blood Group Needed:</strong> {selectedSosForBroadcast.bloodGroup}</p>
                <p><strong>Caller Phone:</strong> {selectedSosForBroadcast.userPhone || '—'}</p>
                <p><strong>Broadcast Radius:</strong> {selectedSosForBroadcast.radiusKm} km</p>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                By confirming, you certify that hospital clinical triage has evaluated this emergency and authorized an immediate WhatsApp &amp; SMS broadcast to all compatible voluntary donors within {selectedSosForBroadcast.radiusKm}km.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setClinicalConfirmOpen(false)}>Cancel</Button>
            <Button
              onClick={handleConfirmBroadcast}
              disabled={confirmingBroadcast}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              {confirmingBroadcast ? 'Broadcasting…' : 'Confirm Clinical Need & Alert Donors'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
