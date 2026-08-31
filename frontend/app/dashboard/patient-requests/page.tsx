'use client';
import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Droplet, Wind } from 'lucide-react';

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
  deliveryStatus: 'pending' | 'approved' | 'in-transit' | 'delivered' | 'cancelled';
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
    pending: 'bg-gray-100 text-gray-700',
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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [assignSel, setAssignSel] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/patient-requests', { params: { status: status || undefined, page } });
      setRequests(r.data.data);
      setTotalPages(r.data.totalPages);
      setTotal(r.data.total);
    } catch {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [status, page]);
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

  const canAct = (r: PatientRequest) =>
    isSuperadmin ||
    r.allocatedHospitalId?._id === user?.hospitalId ||
    r.preferredHospitalId?._id === user?.hospitalId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Patient Requests</h1>
        <p className="text-sm text-gray-400">Requests submitted by patients &amp; families</p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              status === s ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s === '' ? 'All' : s}
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
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400">Loading…</TableCell></TableRow>
              ) : requests.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400">No patient requests{status ? ` (${status})` : ''}.</TableCell></TableRow>
              ) : (
                requests.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="font-medium">{r.patientName || <span className="text-gray-400">—</span>}</TableCell>
                    <TableCell className="text-sm text-gray-500">
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
                      <Badge className={r.urgency === 'emergency' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}>{r.urgency}</Badge>
                    </TableCell>
                    <TableCell>{statusBadge(r.deliveryStatus)}</TableCell>
                    <TableCell className="text-sm">
                      {r.allocatedHospitalId?.name || r.preferredHospitalId?.name || <span className="text-gray-400">Unassigned</span>}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-2">
                        {canAct(r) && (NEXT[r.deliveryStatus] || []).map((a) => (
                          <div key={a.status} className="flex gap-2">
                            <Button size="sm" variant={a.variant || 'default'} onClick={() => advance(r._id, a.status)}>{a.label}</Button>
                          </div>
                        ))}
                        {isSuperadmin && !r.allocatedHospitalId && r.deliveryStatus !== 'cancelled' && r.deliveryStatus !== 'delivered' && (
                          <div className="flex gap-1 items-center">
                            <select
                              value={assignSel[r._id] || ''}
                              onChange={(e) => setAssignSel((s) => ({ ...s, [r._id]: e.target.value }))}
                              className="border border-gray-300 rounded p-1 text-xs max-w-[140px]"
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
          <p className="text-sm text-gray-500">Page {page} of {totalPages} · {total} request{total === 1 ? '' : 's'}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page <= 1 || loading}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(p + 1, totalPages))} disabled={page >= totalPages || loading}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
