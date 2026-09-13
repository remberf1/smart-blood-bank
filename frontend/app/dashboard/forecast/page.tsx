'use client';
import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { AlertTriangle, TrendingUp, PackagePlus, Info, Cpu } from 'lucide-react';

type GroupForecast = {
  bloodGroup: string;
  currentStock: number;
  forecast: {
    dailyMean: number;
    horizonTotal: number;
    confidence: 'high' | 'medium' | 'low';
    trend: number;
    perDay: { date: string; expected: number }[];
  };
  coverageDays: number | null;
  expectedHorizon: number;
  safetyStock: number;
  requiredUnits: number;
  suggestedRestock: number;
  riskLevel: 'critical' | 'at-risk' | 'watch' | 'ok' | 'none';
};

type Forecast = {
  scope: string;
  horizonDays: number;
  historyDays: number;
  totalSuggestedRestock: number;
  atRiskGroups: string[];
  groups: GroupForecast[];
  engine?: 'xgboost' | 'heuristic';
  modelInfo?: { trained_at?: string; metrics?: { mae?: number; improvement_pct?: number } } | null;
};

const RISK_META: Record<string, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'bg-red-100 text-red-700' },
  'at-risk': { label: 'At risk', className: 'bg-orange-100 text-orange-700' },
  watch: { label: 'Watch', className: 'bg-amber-100 text-amber-700' },
  ok: { label: 'OK', className: 'bg-emerald-100 text-emerald-700' },
  none: { label: 'No demand', className: 'bg-muted text-muted-foreground' },
};

// Validated colorblind-safe pair (dataviz validator: ΔE 28 protan).
const C_STOCK = '#2563eb'; // blue — what's on hand
const C_NEED = '#c2283b'; // red — what's forecast to be needed

// Quick-read horizontal bar chart: current stock vs predicted need per group,
// on one shared scale so bar lengths are comparable. Where the red (need) bar
// out-runs the blue (stock) bar, that group is short.
function StockVsNeedChart({ groups }: { groups: GroupForecast[] }) {
  const max = Math.max(1, ...groups.map((g) => Math.max(g.currentStock, g.expectedHorizon)));
  const pctOf = (v: number) => `${Math.max((v / max) * 100, v > 0 ? 2 : 0)}%`;
  return (
    <div>
      <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: C_STOCK }} /> In stock
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: C_NEED }} /> Predicted need
        </span>
      </div>
      <div className="space-y-3">
        {groups.map((g) => {
          const short = g.expectedHorizon > g.currentStock;
          return (
            <div key={g.bloodGroup} className="flex items-center gap-3">
              <span className="w-9 shrink-0 text-sm font-bold text-foreground">{g.bloodGroup}</span>
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 rounded-full bg-muted overflow-hidden" title={`In stock: ${g.currentStock} units`}>
                  <div className="h-full rounded-full" style={{ width: pctOf(g.currentStock), background: C_STOCK }} />
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden" title={`Predicted need (${g.forecast.confidence} confidence): ${g.expectedHorizon} units`}>
                  <div className="h-full rounded-full" style={{ width: pctOf(g.expectedHorizon), background: C_NEED }} />
                </div>
              </div>
              <span className={`w-16 shrink-0 text-right text-xs ${short ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                {short ? `−${g.expectedHorizon - g.currentStock} u` : 'covered'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tiny inline sparkline of expected demand across the horizon.
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const w = 80;
  const h = 24;
  const max = Math.max(...points, 1);
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="text-primary" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone = 'primary' }: any) {
  const color =
    tone === 'danger' ? 'text-red-600 bg-red-50' : tone === 'amber' ? 'text-amber-600 bg-amber-50' : 'text-primary bg-primary-light';
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

export default function ForecastPage() {
  const [horizon, setHorizon] = useState(14);
  const [data, setData] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiClient
      .get(`/forecast/demand?horizonDays=${horizon}`)
      .then((r) => {
        if (!active) return;
        setData(r.data);
        setError('');
      })
      .catch(() => active && setError('Failed to load forecast'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [horizon]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (error) return <p className="text-red-500">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Demand Forecast"
        subtitle={`${data.scope === 'network' ? 'Network-wide' : 'Your hospital'} · next ${data.horizonDays} days · from ${data.historyDays}d of history`}
        action={
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="border border-input rounded-lg px-3 py-2 text-sm bg-card"
          >
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
          </select>
        }
      />

      {/* Which engine produced this forecast */}
      {data.engine === 'xgboost' ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
          <Cpu className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium text-foreground">XGBoost model</span>
          {data.modelInfo?.metrics && (
            <span className="text-muted-foreground">
              · test MAE {data.modelInfo.metrics.mae}
              {typeof data.modelInfo.metrics.improvement_pct === 'number' &&
                ` · ${data.modelInfo.metrics.improvement_pct}% better than a 7-day average`}
            </span>
          )}
          {data.modelInfo?.trained_at && (
            <span className="text-muted-foreground">· trained {new Date(data.modelInfo.trained_at).toLocaleDateString()}</span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          Heuristic forecast (statistical baseline — the ML service is offline).
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Kpi
          icon={AlertTriangle}
          label="Groups at risk"
          value={data.atRiskGroups.length}
          sub={data.atRiskGroups.length ? data.atRiskGroups.join(', ') : 'All groups healthy'}
          tone={data.atRiskGroups.length ? 'danger' : 'primary'}
        />
        <Kpi icon={PackagePlus} label="Suggested restock" value={`${data.totalSuggestedRestock} u`} sub="across all groups" tone="amber" />
        <Kpi icon={TrendingUp} label="Horizon" value={`${data.horizonDays} days`} sub="forecast window" />
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold text-foreground mb-4">Stock vs predicted need · next {data.horizonDays} days</h3>
          <StockVsNeedChart groups={data.groups} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-4 font-medium">Group</th>
                  <th className="p-4 font-medium">Risk</th>
                  <th className="p-4 font-medium text-right">In stock</th>
                  <th className="p-4 font-medium text-right">Predicted need</th>
                  <th className="p-4 font-medium text-right">Coverage</th>
                  <th className="p-4 font-medium text-right">Restock</th>
                  <th className="p-4 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((g) => {
                  const meta = RISK_META[g.riskLevel];
                  return (
                    <tr key={g.bloodGroup} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="p-4 font-bold text-foreground">{g.bloodGroup}</td>
                      <td className="p-4">
                        <Badge className={meta.className}>{meta.label}</Badge>
                        {g.forecast.confidence === 'low' && g.riskLevel !== 'none' && (
                          <span className="ml-2 text-xs text-muted-foreground">low data</span>
                        )}
                      </td>
                      <td className="p-4 text-right text-foreground">{g.currentStock} u</td>
                      <td className="p-4 text-right text-foreground">
                        {g.expectedHorizon} u
                        <span className="block text-xs text-muted-foreground">~{g.forecast.dailyMean}/day</span>
                      </td>
                      <td className="p-4 text-right text-muted-foreground">
                        {g.coverageDays == null ? '—' : `${g.coverageDays}d`}
                      </td>
                      <td className="p-4 text-right">
                        {g.suggestedRestock > 0 ? (
                          <span className="font-semibold text-foreground">+{g.suggestedRestock} u</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        <Sparkline points={g.forecast.perDay.map((p) => p.expected)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Forecasts learn from past request volume (day-of-week patterns and recent trend) and compare it against current
          stock plus a safety buffer. &ldquo;Predicted need&rdquo; is expected demand over the horizon; &ldquo;Restock&rdquo; is the
          suggested units to order to stay covered. Groups marked <em>low data</em> have too little history for a confident
          forecast — treat those as rough guidance.
        </p>
      </div>
    </div>
  );
}
