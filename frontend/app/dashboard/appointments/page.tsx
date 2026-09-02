'use client';
import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Droplet, CalendarCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Loading, EmptyState } from '@/components/ui/states';

interface Appt {
  _id: string;
  donorId?: { name: string; phone: string; bloodGroup: string; eligibilityStatus: string } | null;
  hospitalId?: { name: string } | null;
  appointmentDate: string;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled' | 'missed';
  notes?: string;
}

const FILTERS = ['', 'pending', 'scheduled', 'completed', 'cancelled', 'missed'];
const LABEL: Record<string, string> = { scheduled: 'confirmed' };
const NEXT: Record<string, { status: string; label: string; variant?: any }[]> = {
  pending: [{ status: 'scheduled', label: 'Accept' }, { status: 'cancelled', label: 'Decline', variant: 'destructive' }],
  scheduled: [{ status: 'completed', label: 'Completed' }, { status: 'missed', label: 'Missed', variant: 'outline' }, { status: 'cancelled', label: 'Cancel', variant: 'destructive' }],
};

function badge(s: string) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
    missed: 'bg-gray-200 text-foreground',
  };
  return <Badge className={map[s] || ''}>{LABEL[s] || s}</Badge>;
}

export default function AppointmentsPage() {
  const [appts, setAppts] = useState<Appt[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/appointments', { params: { status: status || undefined } });
      setAppts(r.data.data);
    } catch {
      toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [status]);

  const setStatusFor = async (id: string, newStatus: string) => {
    try {
      await apiClient.put(`/appointments/${id}/status`, { status: newStatus });
      toast.success(newStatus === 'scheduled' ? 'Appointment accepted' : `Marked ${newStatus}`);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Donation Appointments" subtitle="Accept and manage donor appointment requests" />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              status === s ? 'bg-primary text-white border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted/50'
            }`}
          >
            {s === '' ? 'All' : (LABEL[s] || s)}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Donor</TableHead>
                <TableHead>Blood</TableHead>
                <TableHead>Hospital</TableHead>
                <TableHead>Date &amp; time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7}><Loading /></TableCell></TableRow>
              ) : appts.length === 0 ? (
                <TableRow><TableCell colSpan={7}><EmptyState icon={CalendarCheck} title={`No appointments${status ? ` (${LABEL[status] || status})` : ''}`} hint="Donor appointment requests will appear here to accept." /></TableCell></TableRow>
              ) : (
                appts.map((a) => (
                  <TableRow key={a._id}>
                    <TableCell>
                      <div className="font-medium">{a.donorId?.name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{a.donorId?.phone}</div>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1"><Droplet className="h-4 w-4 text-red-500" /> {a.donorId?.bloodGroup}</span>
                    </TableCell>
                    <TableCell className="text-sm">{a.hospitalId?.name || '—'}</TableCell>
                    <TableCell className="text-sm">{new Date(a.appointmentDate).toLocaleString()}</TableCell>
                    <TableCell>{badge(a.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px]">{a.notes || <span className="text-muted-foreground/60">—</span>}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap gap-2 justify-end">
                        {(NEXT[a.status] || []).map((n) => (
                          <Button key={n.status} size="sm" variant={n.variant || 'default'} onClick={() => setStatusFor(a._id, n.status)}>
                            {n.label}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
