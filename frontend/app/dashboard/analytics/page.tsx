'use client';
import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Droplet, Clock, CheckCircle2, Trash2, HeartPulse, Users, AlertTriangle, Activity } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

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

type FunnelData = {
  periodDays: number;
  summary: {
    made: number;
    fulfilled: number;
    inProgress: number;
    cancelled: number;
    fulfillmentRate: number;
    cancellationRate: number;
  };
  cancellationReasons: Record<string, number>;
  byBloodGroup: {
    bloodGroup: string;
    made: number;
    fulfilled: number;
    inProgress: number;
    cancelled: number;
    fulfillmentRate: number;
    cancellationReasons: Record<string, number>;
    stockUnavailableCount: number;
  }[];
};

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
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      apiClient.get('/analytics/summary'),
      apiClient.get(`/analytics/donations?days=${days}`),
      apiClient.get(`/analytics/requests?days=${days}`),
      apiClient.get(`/analytics/request-funnel?days=${days}`),
    ])
      .then(([s, d, r, f]) => {
        if (!active) return;
        setSummary(s.data);
        setDonations(d.data);
        setRequests(r.data);
        setFunnel(f.data);
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

      {/* Urgent Expiry Operational Action Banner */}
      {summary.expiringSoonUnits > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border-2 border-red-500/60 bg-red-500/10 p-4 text-red-950 dark:text-red-100 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-900 dark:text-red-200 text-sm">
                🚨 URGENT STOCK ACTION: {summary.expiringSoonUnits} unit{summary.expiringSoonUnits === 1 ? '' : 's'} expiring in &le; 7 days
              </p>
              <p className="text-xs text-red-800/90 dark:text-red-300/90 mt-0.5 leading-relaxed">
                Prioritize <strong>FEFO (First-Expired, First-Out)</strong> crossmatching immediately or initiate inter-hospital transfers to avoid wastage.
              </p>
            </div>
          </div>
          <a
            href="/dashboard/inventory"
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors whitespace-nowrap self-end sm:self-center"
          >
            Review In Inventory &rarr;
          </a>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Kpi
          icon={Droplet}
          label="Blood in stock"
          value={`${summary.totalStockUnits} u`}
          sub={`${summary.expiringSoonUnits} expiring ≤7d`}
          tone={summary.expiringSoonUnits > 0 ? 'danger' : 'primary'}
        />
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

      {/* Clinical Requisitions Funnel & Status x Blood Type Matrix */}
      {funnel && (
        <Card className="border-border">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-red-600" />
                  Clinical Requisition Funnel &amp; Scarcity Matrix
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Status × Blood Type breakdown and structured cancellation audit over the last {days} days.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                  Fulfillment Rate: {pct(funnel.summary.fulfillmentRate)}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-red-50 text-red-700 font-semibold border border-red-200">
                  Cancellation: {pct(funnel.summary.cancellationRate)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Funnel Stage Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-muted/40 p-3 rounded-lg border border-border">
                <p className="text-xs text-muted-foreground font-medium">Requisitions Made</p>
                <p className="text-xl font-bold text-foreground mt-1">{funnel.summary.made}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Fulfilled &amp; Dispatched</p>
                <p className="text-xl font-bold text-emerald-800 dark:text-emerald-200 mt-1">{funnel.summary.fulfilled}</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">Active In-Progress</p>
                <p className="text-xl font-bold text-amber-800 dark:text-amber-200 mt-1">{funnel.summary.inProgress}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-lg border border-red-200 dark:border-red-800">
                <p className="text-xs text-red-700 dark:text-red-300 font-medium">Cancelled</p>
                <p className="text-xl font-bold text-red-800 dark:text-red-200 mt-1">{funnel.summary.cancelled}</p>
              </div>
            </div>

            {/* Status x Blood Type Matrix Table */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Status × Blood Type Matrix
              </h4>
              <div className="border border-border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-bold">Blood Group</TableHead>
                      <TableHead className="text-right">Requisitions</TableHead>
                      <TableHead className="text-right">Fulfilled</TableHead>
                      <TableHead className="text-right">In-Progress</TableHead>
                      <TableHead className="text-right">Cancelled</TableHead>
                      <TableHead className="text-right">Fulfillment %</TableHead>
                      <TableHead className="text-right">Stock Scarcity Deficit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {funnel.byBloodGroup.map((bg) => (
                      <TableRow key={bg.bloodGroup}>
                        <TableCell className="font-bold flex items-center gap-1.5">
                          <Droplet className="h-4 w-4 text-red-500" />
                          <span>{bg.bloodGroup}</span>
                        </TableCell>
                        <TableCell className="text-right font-medium">{bg.made}</TableCell>
                        <TableCell className="text-right text-emerald-600 font-medium">{bg.fulfilled}</TableCell>
                        <TableCell className="text-right text-amber-600">{bg.inProgress}</TableCell>
                        <TableCell className="text-right text-red-600">{bg.cancelled}</TableCell>
                        <TableCell className="text-right">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            bg.made === 0 ? 'text-muted-foreground' : bg.fulfillmentRate >= 0.7 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {bg.made > 0 ? pct(bg.fulfillmentRate) : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {bg.stockUnavailableCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">
                              <AlertTriangle className="h-3 w-3" />
                              {bg.stockUnavailableCount} unfulfilled (Stock-out)
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Cancellation Rationale Breakdown */}
            {Object.keys(funnel.cancellationReasons).length > 0 && (
              <div className="bg-muted/30 p-4 rounded-lg border border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Structured Cancellation Rationale Distribution
                </h4>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(funnel.cancellationReasons).map(([reason, count]) => (
                    <div key={reason} className="bg-background p-2.5 rounded-md border border-border text-xs flex justify-between items-center">
                      <span className="text-muted-foreground capitalize">{reason.replace(/_/g, ' ')}</span>
                      <span className="font-bold text-foreground bg-muted px-2 py-0.5 rounded">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
