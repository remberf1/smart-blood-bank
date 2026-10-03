'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Droplet, Building2, Users, Clock, CheckCircle2, AlertTriangle,
  HeartPulse, Trash2, ArrowRight, Boxes, UserCog, BarChart3, ArrowRightLeft, Siren,
} from 'lucide-react';

const BLOOD_GROUPS = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

// Dynamic clinical safety buffers based on Nigerian clinical demand & emergency resuscitation burn rates:
// - O-: Universal RBC donor, uncrossmatched emergency resuscitation (buffer: 8 units)
// - O+: Highest population prevalence in Nigeria (~50%), trauma burn rate (buffer: 8 units)
// - A+, B+: High elective & medical demand (buffer: 5 units)
// - Rh-negative (A-, B-, AB-): Rare blood safety buffers (buffer: 3-4 units)
const DYNAMIC_SAFETY_THRESHOLDS: Record<string, { buffer: number; reason: string }> = {
  'O-': { buffer: 8, reason: 'Universal RBC donor / acute trauma uncrossmatched buffer' },
  'O+': { buffer: 8, reason: 'High population prevalence (~50% recipient demand)' },
  'A+': { buffer: 5, reason: 'Elective surgical demand' },
  'B+': { buffer: 5, reason: 'Elective surgical demand' },
  'A-': { buffer: 4, reason: 'Rare Rh-negative buffer' },
  'B-': { buffer: 4, reason: 'Rare Rh-negative buffer' },
  'AB-': { buffer: 3, reason: 'Rare Rh-negative buffer' },
  'AB+': { buffer: 4, reason: 'Universal plasma recipient' },
};

type Summary = {
  totalStockUnits: number;
  stockByGroup: { bloodGroup: string; units: number }[];
  expiringSoonUnits: number;
  pendingRequests: number;
  activeSosCount?: number;
  recentSosAlerts?: {
    _id: string;
    bloodGroup: string;
    referenceId?: string;
    doctorName?: string;
    hospitalName?: string;
    radiusKm?: number;
    createdAt: string;
  }[];
  donationsLast30d: number;
  fulfillmentRate: number;
  avgDeliveryHours: number | null;
  wastageUnits30d: number;
  donors: { total: number; eligible: number; deferred: number };
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Kpi({ icon: Icon, label, value, sub, color, bg, href }: any) {
  const body = (
    <Card className="hover:shadow-md transition-shadow h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={`p-2 rounded-lg ${bg}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Bar({ label, value, max, threshold = 5 }: { label: string; value: number; max: number; threshold?: number }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 5 : 0) : 0;
  const color = value === 0 ? 'bg-red-600' : value < threshold ? 'bg-amber-500' : 'bg-primary';
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 text-sm font-medium text-muted-foreground shrink-0 flex items-center justify-between">
        <span>{label}</span>
        {value === 0 && <span className="text-[10px] text-red-600 font-bold ml-1">0u</span>}
      </div>
      <div className="flex-1 h-5 bg-muted rounded overflow-hidden relative">
        <div className={`h-full ${color} rounded transition-all`} style={{ width: `${width}%` }} />
        {/* Dynamic threshold marker line */}
        <div
          className="absolute top-0 bottom-0 border-r-2 border-dashed border-red-500/70 pointer-events-none"
          style={{ left: `${Math.min(100, (threshold / max) * 100)}%` }}
          title={`Safety threshold: ${threshold} units`}
        />
      </div>
      <div className="w-20 text-right shrink-0">
        <span className={`text-xs font-semibold ${value === 0 ? 'text-red-600 font-bold' : value < threshold ? 'text-amber-700' : 'text-foreground'}`}>
          {value} <span className="text-[11px] text-muted-foreground font-normal">/{threshold}u</span>
        </span>
      </div>
    </div>
  );
}

export default function DashboardHome() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [hospitals, setHospitals] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [h, s] = await Promise.all([
          apiClient.get('/hospitals'),
          apiClient.get('/analytics/summary'),
        ]);
        setHospitals(h.data.length);
        setSummary(s.data);
        setLoadError(false);
      } catch (error) {
        console.error('Error fetching dashboard:', error);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Fill in every blood group so gaps (0 units) are visible.
  const stockMap = new Map((summary?.stockByGroup ?? []).map((s) => [s.bloodGroup, s.units]));
  const stock = BLOOD_GROUPS.map((bg) => ({ bloodGroup: bg, units: stockMap.get(bg) ?? 0 }));
  const stockMax = Math.max(1, ...stock.map((s) => s.units), 10);

  // Dynamic clinical evaluation
  const zeroStockGroups = stock.filter((s) => s.units === 0).map((s) => s.bloodGroup);
  const belowBufferGroups = stock.filter((s) => {
    const threshold = DYNAMIC_SAFETY_THRESHOLDS[s.bloodGroup]?.buffer ?? 5;
    return s.units > 0 && s.units < threshold;
  });

  const isAdmin = user?.role === 'admin' || isSuperadmin;
  const links = [
    { name: 'Inventory', href: '/dashboard/inventory', icon: Boxes },
    { name: 'Donors', href: '/dashboard/donors', icon: Users },
    { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { name: 'SOS Center', href: '/dashboard/sos', icon: Siren },
    ...(isAdmin ? [{ name: 'Requests', href: '/dashboard/requests', icon: ArrowRightLeft }] : []),
    ...(isSuperadmin ? [{ name: 'Users', href: '/dashboard/users', icon: UserCog }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back, {user?.name}</p>
      </div>

      {loadError && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Some dashboard data couldn&apos;t be loaded. Showing what&apos;s available — try refreshing.
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={Building2} label="Total Hospitals" value={hospitals} color="text-blue-600" bg="bg-blue-50" href="/dashboard/hospitals" />
        <Kpi icon={Droplet} label="Blood Units Available" value={summary?.totalStockUnits ?? 0} sub={`${summary?.expiringSoonUnits ?? 0} expiring ≤7d`} color="text-red-600" bg="bg-red-50" href="/dashboard/inventory" />
        <Kpi icon={Users} label="Registered Donors" value={summary?.donors.total ?? 0} sub={`${summary?.donors.eligible ?? 0} eligible`} color="text-green-600" bg="bg-green-50" href="/dashboard/donors" />
        <Kpi icon={Clock} label="Pending Requests" value={summary?.pendingRequests ?? 0} color="text-amber-600" bg="bg-amber-50" href="/dashboard/requests" />
        <Kpi
          icon={Siren}
          label="Emergency SOS"
          value={summary?.activeSosCount ?? 0}
          sub={(summary?.activeSosCount ?? 0) > 0 ? '⚠️ Critical alert' : '0 active · Normal'}
          color={(summary?.activeSosCount ?? 0) > 0 ? 'text-red-600 animate-pulse' : 'text-emerald-600'}
          bg={(summary?.activeSosCount ?? 0) > 0 ? 'bg-red-100 border border-red-300' : 'bg-emerald-50'}
          href="/dashboard/sos"
        />
      </div>

      {/* Active Emergency SOS Alert Card */}
      {(summary?.activeSosCount ?? 0) > 0 && (
        <Card className="border-red-300 bg-red-50 shadow-sm border-l-4 border-l-red-600 animate-pulse">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Siren className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-sm text-red-950">
                  🚨 ACTIVE EMERGENCY SOS BROADCAST ({summary?.activeSosCount} pending)
                </p>
                <p className="text-xs text-red-800">
                  Emergency blood donor broadcast in progress. Donors and neighboring hospitals are being mobilized.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/sos"
              className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold text-xs hover:bg-red-700 transition-colors shrink-0 shadow-xs flex items-center gap-1.5"
            >
              Open SOS Center <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Dynamic Inventory & Emergency Alerts with Actionable CTAs */}
      {(zeroStockGroups.length > 0 || belowBufferGroups.length > 0 || (summary?.expiringSoonUnits ?? 0) > 0) && (
        <Card className="border-amber-200 bg-amber-50/70 shadow-xs">
          <CardContent className="p-4 space-y-3 text-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2.5">
              <div className="flex items-center gap-2 font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                <span>Clinical Inventory Attention & Supply Advisory</span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/dashboard/requests"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-700 text-white hover:bg-amber-800 transition-colors shadow-xs"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" /> Request Transfer
                </Link>
                <Link
                  href={`/dashboard/sos?group=${zeroStockGroups[0] || belowBufferGroups[0]?.bloodGroup || 'O-'}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors shadow-xs"
                >
                  <Siren className="h-3.5 w-3.5" /> Trigger Donor SOS
                </Link>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
              {zeroStockGroups.length > 0 && (
                <div className="p-2.5 rounded-md bg-red-100/90 border border-red-200 text-red-900">
                  <p className="font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-ping inline-block" />
                    Critical Zero Stock (Bleed Out Risk)
                  </p>
                  <p className="mt-0.5 font-semibold text-red-800">
                    Groups: <span className="underline">{zeroStockGroups.join(', ')}</span> (0 units)
                  </p>
                  <p className="text-[11px] text-red-700 mt-1">
                    Immediate trauma resuscitation risk. Mobilize inter-hospital transfer or voluntary donor callback.
                  </p>
                </div>
              )}

              {belowBufferGroups.length > 0 && (
                <div className="p-2.5 rounded-md bg-amber-100/80 border border-amber-300 text-amber-950">
                  <p className="font-bold text-amber-900">Below Dynamic Safety Buffer</p>
                  <p className="mt-0.5 text-amber-800">
                    {belowBufferGroups.map((g) => `${g.bloodGroup} (${g.units}/${DYNAMIC_SAFETY_THRESHOLDS[g.bloodGroup]?.buffer ?? 5}u)`).join(', ')}
                  </p>
                  <p className="text-[11px] text-amber-700 mt-1">
                    Reserve below emergency threshold. Consider scheduling donation appointments.
                  </p>
                </div>
              )}

              {(summary?.expiringSoonUnits ?? 0) > 0 && (
                <div className="p-2.5 rounded-md bg-orange-100/70 border border-orange-200 text-orange-950">
                  <p className="font-bold text-orange-900">FEFO Expiry Risk</p>
                  <p className="mt-0.5 text-orange-800">
                    <strong>{summary?.expiringSoonUnits}</strong> unit(s) expiring within 7 days
                  </p>
                  <p className="text-[11px] text-orange-700 mt-1">
                    Prioritize for crossmatch allocation or prophylactic transfusion to minimize wastage.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Stock by group */}
        <Card>
          <CardHeader>
            <CardTitle>Blood stock by group</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stock.map((s) => (
              <Bar
                key={s.bloodGroup}
                label={s.bloodGroup}
                value={s.units}
                max={stockMax}
                threshold={DYNAMIC_SAFETY_THRESHOLDS[s.bloodGroup]?.buffer ?? 5}
              />
            ))}
            <p className="text-xs text-muted-foreground pt-1">
              Dashed red lines indicate dynamic clinical safety buffers (8u for universal/high prevalence O-, O+; 3–5u for specialized groups).
            </p>
          </CardContent>
        </Card>

        {/* Operational health */}
        <Card>
          <CardHeader>
            <CardTitle>Last 30 days</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Metric icon={CheckCircle2} label="Fulfillment" value={pct(summary?.fulfillmentRate ?? 0)} tone="text-emerald-600" />
            <Metric icon={Clock} label="Avg Turnaround" value={summary?.avgDeliveryHours != null ? `${summary.avgDeliveryHours}h` : '—'} tone="text-blue-600" />
            <Metric icon={HeartPulse} label="Donated" value={`${summary?.donationsLast30d ?? 0} u`} tone="text-red-600" />
            <Metric icon={Trash2} label="Wastage" value={`${summary?.wastageUnits30d ?? 0} u`} tone="text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Quick actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              <Card className="hover:shadow-md hover:border-primary/40 transition-all">
                <CardContent className="p-4 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <l.icon className="h-4 w-4 text-primary" /> {l.name}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/60" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: any) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-muted/50">
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <div>
        <p className="text-lg font-bold text-foreground leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}
