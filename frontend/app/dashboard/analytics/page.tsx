'use client';
import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Droplet, Clock, CheckCircle2, Trash2, HeartPulse, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';

type Summary = {
  scope: string;
  totalStockUnits: number;
  stockByGroup: { bloodGroup: string; units: number }[];
  expiringSoonUnits: number;
  pendingRequests: number;
  donationsLast30d: number;
  fulfillmentRate: number;
  avgDeliveryHours: number | null;
  wastageUnits30d: number;
  wastageRate30d: number;
  donors: { total: number; eligible: number; deferred: number };
};

type Donations = { byGroup: { bloodGroup: string; units: number }[]; totalUnits: number };
type Requests = { total: number; byStatus: Record<string, number>; byUrgency: Record<string, number> };

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Bar({ label, value, max, tone = 'primary' }: { label: string; value: number; max: number; tone?: string }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 4 : 0) : 0;
  const color =
    tone === 'danger' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : tone === 'green' ? 'bg-emerald-500' : 'bg-primary';
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-sm font-medium text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
        <div className={`h-full ${color} rounded transition-all`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-10 text-sm text-foreground text-right shrink-0">{value}</span>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone = 'primary' }: any) {
  const color =
    tone === 'danger' ? 'text-red-600 bg-red-50' : tone === 'amber' ? 'text-amber-600 bg-amber-50' : tone === 'green' ? 'text-emerald-600 bg-emerald-50' : 'text-primary bg-primary-light';
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [donations, setDonations] = useState<Donations | null>(null);
  const [requests, setRequests] = useState<Requests | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      apiClient.get('/analytics/summary'),
      apiClient.get(`/analytics/donations?days=${days}`),
      apiClient.get(`/analytics/requests?days=${days}`),
    ])
      .then(([s, d, r]) => {
        if (!active) return;
        setSummary(s.data);
        setDonations(d.data);
        setRequests(r.data);
        setError('');
      })
      .catch(() => active && setError('Failed to load analytics'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (error) return <p className="text-red-500">{error}</p>;
  if (!summary) return null;

  const stockMax = Math.max(1, ...summary.stockByGroup.map((s) => s.units));
  const donMax = Math.max(1, ...(donations?.byGroup.map((g) => g.units) ?? [0]));
  const statusEntries = Object.entries(requests?.byStatus ?? {});
  const statusMax = Math.max(1, ...statusEntries.map(([, v]) => v));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        subtitle={`${summary.scope === 'network' ? 'Network-wide' : 'Your hospital'} · last ${days} days`}
        action={
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="border border-input rounded-lg px-3 py-2 text-sm bg-card"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Kpi icon={Droplet} label="Blood in stock" value={`${summary.totalStockUnits} u`} sub={`${summary.expiringSoonUnits} expiring ≤7d`} />
        <Kpi icon={Clock} label="Pending requests" value={summary.pendingRequests} tone="amber" />
        <Kpi icon={CheckCircle2} label="Fulfillment" value={pct(summary.fulfillmentRate)} sub={summary.avgDeliveryHours != null ? `~${summary.avgDeliveryHours}h to deliver` : undefined} tone="green" />
        <Kpi icon={Trash2} label="Wastage (30d)" value={`${summary.wastageUnits30d} u`} sub={pct(summary.wastageRate30d)} tone="danger" />
        <Kpi icon={HeartPulse} label="Donated (30d)" value={`${summary.donationsLast30d} u`} />
        <Kpi icon={Users} label="Eligible donors" value={summary.donors.eligible} sub={`${summary.donors.total} total`} />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Current stock by blood group</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.stockByGroup.length === 0 && <p className="text-sm text-muted-foreground">No stock recorded.</p>}
            {summary.stockByGroup.map((s) => (
              <Bar key={s.bloodGroup} label={s.bloodGroup} value={s.units} max={stockMax} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Donations by group · {days}d</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(donations?.byGroup.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No donations in this period.</p>}
            {donations?.byGroup.map((g) => (
              <Bar key={g.bloodGroup} label={g.bloodGroup} value={g.units} max={donMax} tone="green" />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requests by status · {days}d</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {statusEntries.length === 0 && <p className="text-sm text-muted-foreground">No requests in this period.</p>}
            {statusEntries.map(([status, count]) => (
              <Bar
                key={status}
                label={status.slice(0, 4)}
                value={count}
                max={statusMax}
                tone={status === 'delivered' ? 'green' : status === 'cancelled' ? 'danger' : status === 'pending' ? 'amber' : 'primary'}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Donor eligibility</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Bar label="OK" value={summary.donors.eligible} max={Math.max(1, summary.donors.total)} tone="green" />
            <Bar label="Wait" value={summary.donors.deferred} max={Math.max(1, summary.donors.total)} tone="amber" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
