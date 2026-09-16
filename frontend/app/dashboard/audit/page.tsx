'use client';
import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/ui/page-header';
import { Loading, EmptyState } from '@/components/ui/states';
import { ScrollText, ShieldAlert } from 'lucide-react';

interface Entry {
  _id: string;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  summary?: string;
  createdAt: string;
}

const PAGE_SIZE = 30;

// Colour the action's category (the part before the first dot).
const actionTone = (action: string) => {
  const head = action.split('.')[0];
  if (head === 'auth') return 'bg-blue-100 text-blue-700';
  if (head === 'user') return 'bg-purple-100 text-purple-700';
  if (head === 'donation') return 'bg-emerald-100 text-emerald-700';
  if (head.startsWith('resource') || head.startsWith('patient')) return 'bg-amber-100 text-amber-700';
  return 'bg-muted text-foreground';
};

export default function AuditPage() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [entries, setEntries] = useState<Entry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [actorSearch, setActorSearch] = useState('');
  const [debouncedActor, setDebouncedActor] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedActor(actorSearch); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [actorSearch]);

  useEffect(() => { setPage(1); }, [actionFilter, entityFilter, fromDate, toDate]);

  useEffect(() => {
    if (!isSuperadmin) { setLoading(false); return; }
    setLoading(true);
    apiClient
      .get('/audit', { params: {
        page, limit: PAGE_SIZE,
        action: actionFilter || undefined,
        entity: entityFilter || undefined,
        actor: debouncedActor || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
      } })
      .then((r) => {
        setEntries(r.data.data);
        setActions(r.data.actions || []);
        setEntities(r.data.entities || []);
        setTotalPages(r.data.totalPages);
        setTotal(r.data.total);
      })
      .catch(() => toast.error('Failed to load audit log'))
      .finally(() => setLoading(false));
  }, [page, actionFilter, entityFilter, debouncedActor, fromDate, toDate, isSuperadmin]);

  if (!isSuperadmin) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center gap-3 text-muted-foreground">
          <ShieldAlert className="h-5 w-5 text-amber-500" />
          Only a super admin can view the audit log.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" subtitle="A record of significant actions, for accountability" />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Filter by actor email…"
          value={actorSearch}
          onChange={(e) => setActorSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-9 border border-input rounded-lg px-3 text-sm bg-card"
        >
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="h-9 border border-input rounded-lg px-3 text-sm bg-card"
        >
          <option value="">All entities</option>
          {entities.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <label className="flex items-center gap-1 text-sm text-muted-foreground">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="h-9 border border-input rounded-lg px-2 text-sm bg-card" />
          <span>–</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="h-9 border border-input rounded-lg px-2 text-sm bg-card" />
        </label>
        {(actionFilter || entityFilter || actorSearch || fromDate || toDate) && (
          <Button variant="ghost" size="sm" className="text-muted-foreground"
            onClick={() => { setActionFilter(''); setEntityFilter(''); setActorSearch(''); setFromDate(''); setToDate(''); }}>
            Clear
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4}><Loading label="Loading audit log…" /></TableCell></TableRow>
                ) : entries.length === 0 ? (
                  <TableRow><TableCell colSpan={4}><EmptyState icon={ScrollText} title="No audit entries" hint="Significant actions will be recorded here." /></TableCell></TableRow>
                ) : (
                  entries.map((e) => (
                    <TableRow key={e._id} className="hover:bg-muted/40">
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {e.actorEmail || '—'}
                        {e.actorRole && <span className="block text-xs text-muted-foreground">{e.actorRole}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge className={actionTone(e.action)}>{e.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-foreground">{e.summary || '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages} · {total} entries</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(p - 1, 1))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(p + 1, totalPages))}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
