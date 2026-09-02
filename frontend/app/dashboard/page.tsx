'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Droplet, Building2, Users, Clock, CheckCircle2, AlertTriangle,
  HeartPulse, Trash2, ArrowRight, Boxes, UserCog, BarChart3, ArrowRightLeft,
} from 'lucide-react';

const BLOOD_GROUPS = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
const LOW_STOCK = 5;

type Summary = {
  totalStockUnits: number;
  stockByGroup: { bloodGroup: string; units: number }[];
  expiringSoonUnits: number;
  pendingRequests: number;
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

function Bar({ label, value, max, tone = 'primary' }: { label: string; value: number; max: number; tone?: string }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 5 : 0) : 0;
  const color = value < LOW_STOCK ? 'bg-red-500' : tone === 'primary' ? 'bg-primary' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 text-sm font-medium text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
        <div className={`h-full ${color} rounded transition-all`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-8 text-sm text-foreground text-right shrink-0">{value}</span>
    </div>
  );
}

export default function DashboardHome() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [hospitals, setHospitals] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [h, s] = await Promise.all([
          apiClient.get('/hospitals'),
          apiClient.get('/analytics/summary'),
        ]);
        setHospitals(h.data.length);
        setSummary(s.data);
      } catch (error) {
        console.error('Error fetching dashboard:', error);
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
  const stockMax = Math.max(1, ...stock.map((s) => s.units));
  const lowGroups = stock.filter((s) => s.units < LOW_STOCK).map((s) => s.bloodGroup);

  const links = [
    { name: 'Inventory', href: '/dashboard/inventory', icon: Boxes },
    { name: 'Donors', href: '/dashboard/donors', icon: Users },
    { name: 'Requests', href: '/dashboard/requests', icon: ArrowRightLeft },
    { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    ...(isSuperadmin ? [{ name: 'Users', href: '/dashboard/users', icon: UserCog }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back, {user?.name}</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Building2} label="Total Hospitals" value={hospitals} color="text-blue-600" bg="bg-blue-50" href="/dashboard/hospitals" />
        <Kpi icon={Droplet} label="Blood Units Available" value={summary?.totalStockUnits ?? 0} sub={`${summary?.expiringSoonUnits ?? 0} expiring ≤7d`} color="text-red-600" bg="bg-red-50" href="/dashboard/inventory" />
        <Kpi icon={Users} label="Registered Donors" value={summary?.donors.total ?? 0} sub={`${summary?.donors.eligible ?? 0} eligible`} color="text-green-600" bg="bg-green-50" href="/dashboard/donors" />
        <Kpi icon={Clock} label="Pending Requests" value={summary?.pendingRequests ?? 0} color="text-amber-600" bg="bg-amber-50" href="/dashboard/requests" />
      </div>

      {/* Alerts */}
      {(lowGroups.length > 0 || (summary?.expiringSoonUnits ?? 0) > 0) && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-2 font-medium text-amber-800">
              <AlertTriangle className="h-4 w-4" /> Attention
            </span>
            {lowGroups.length > 0 && (
              <span className="text-amber-800">
                Low stock: <strong>{lowGroups.join(', ')}</strong> (&lt;{LOW_STOCK} units)
              </span>
            )}
            {(summary?.expiringSoonUnits ?? 0) > 0 && (
              <span className="text-amber-800">
                <strong>{summary?.expiringSoonUnits}</strong> unit(s) expiring within 7 days
              </span>
            )}
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
              <Bar key={s.bloodGroup} label={s.bloodGroup} value={s.units} max={stockMax} />
            ))}
            <p className="text-xs text-muted-foreground pt-1">Red bars are below {LOW_STOCK} units.</p>
          </CardContent>
        </Card>

        {/* Operational health */}
        <Card>
          <CardHeader>
            <CardTitle>Last 30 days</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Metric icon={CheckCircle2} label="Fulfillment" value={pct(summary?.fulfillmentRate ?? 0)} tone="text-emerald-600" />
            <Metric icon={Clock} label="Avg delivery" value={summary?.avgDeliveryHours != null ? `${summary.avgDeliveryHours}h` : '—'} tone="text-blue-600" />
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
