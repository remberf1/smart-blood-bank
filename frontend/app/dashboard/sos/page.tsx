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
import { Siren, Phone, MapPin, Droplet, CheckCircle2, Users } from 'lucide-react';

interface DonorRef { _id?: string; name?: string; phone?: string; bloodGroup?: string }
interface Alerted { donorId?: DonorRef | string; phone: string; status: string }
interface Responded { donorId?: DonorRef | string; response: string; timestamp: string }
interface Sos {
  _id: string;
  bloodGroup: string;
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

const donorName = (d?: DonorRef | string) =>
  d && typeof d === 'object' ? d.name || d.phone || 'Donor' : 'Donor';

export default function SosPage() {
  const [items, setItems] = useState<Sos[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Sos | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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
                    <EmptyState icon={Siren} title={`No SOS requests${status ? ` (${status === 'pending' ? 'active' : status})` : ''}`} hint="Emergencies raised by patients via WhatsApp will appear here." />
                  </TableCell>
                </TableRow>
              ) : (
                items.map((s) => (
                  <TableRow key={s._id} className="hover:bg-muted/50">
                    <TableCell>
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        <Droplet className="h-3 w-3 mr-1" />{s.bloodGroup}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.userPhone ? (
                        <a href={`tel:${s.userPhone}`} className="text-primary hover:underline flex items-center gap-1">
                          <Phone className="h-3 w-3" />{s.userPhone}
                        </a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.radiusKm} km</TableCell>
                    <TableCell className="text-sm">{s.donorsAlerted.length}</TableCell>
                    <TableCell className="text-sm">
                      {yesCount(s) > 0
                        ? <span className="text-emerald-700 font-medium">{yesCount(s)} available</span>
                        : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(s._id)} className="h-8 px-3">
                          <Users className="h-4 w-4 mr-1" />Details
                        </Button>
                        {s.status === 'pending' && (
                          <Button size="sm" variant="outline" disabled={busyId === s._id} onClick={() => setSosStatus(s._id, 'resolved')} className="h-8 px-3 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
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
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Blood group:</span> <strong>{detail.bloodGroup}</strong></div>
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
          <DialogFooter>
            {detail?.status === 'pending' && (
              <>
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
    </div>
  );
}
