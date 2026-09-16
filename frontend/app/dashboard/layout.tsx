'use client';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';
import Link from 'next/link';
import { Toaster, toast } from 'react-hot-toast';
import {
  LayoutDashboard,
  Droplet,
  Users,
  Building2,
  LogOut,
  Menu,
  ArrowRightLeft,
  BarChart3,
  TrendingUp,
  UserCog,
  HeartPulse,
  CalendarCheck,
  Siren,
  ScrollText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// `roles` lists who may see (and act on) each tab — mirroring what the backend
// actually permits, so a role never sees a tab that only 403s for them.
const STAFF = ['staff', 'admin', 'superadmin'];
const ADMIN = ['admin', 'superadmin'];
const SUPER = ['superadmin'];
const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: STAFF },
  { name: 'Inventory', href: '/dashboard/inventory', icon: Droplet, roles: STAFF, badgeKey: 'lowStock' }, // staff add/update
  { name: 'Donors', href: '/dashboard/donors', icon: Users, roles: STAFF }, // staff record donations
  { name: 'Appointments', href: '/dashboard/appointments', icon: CalendarCheck, roles: STAFF, badgeKey: 'appointments' },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, roles: STAFF },
  { name: 'Forecast', href: '/dashboard/forecast', icon: TrendingUp, roles: STAFF },
  { name: 'Patient Requests', href: '/dashboard/patient-requests', icon: HeartPulse, roles: ADMIN, badgeKey: 'patientRequests' }, // approve/assign
  { name: 'Resource Requests', href: '/dashboard/requests', icon: ArrowRightLeft, roles: ADMIN, badgeKey: 'resourceRequests' },
  { name: 'Hospitals', href: '/dashboard/hospitals', icon: Building2, roles: ADMIN },
  { name: 'SOS', href: '/dashboard/sos', icon: Siren, roles: ADMIN, badgeKey: 'sos' },
  { name: 'Users', href: '/dashboard/users', icon: UserCog, roles: SUPER },
  { name: 'Audit Log', href: '/dashboard/audit', icon: ScrollText, roles: SUPER },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [badges, setBadges] = useState<Record<string, number>>({});
  const prevSos = useRef<number | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Poll "needs attention" counts for the sidebar badges, and raise a toast when
  // a NEW emergency SOS appears — the in-app alert for urgent matters.
  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      try {
        const r = await apiClient.get('/badges');
        if (!active) return;
        setBadges(r.data);
        const sos = r.data.sos || 0;
        if (prevSos.current !== null && sos > prevSos.current) {
          toast('🚨 New emergency SOS — check the SOS tab.', { icon: '🚨', duration: 8000 });
        }
        prevSos.current = sos;
      } catch { /* ignore transient errors */ }
    };
    load();
    const id = setInterval(load, 45000);
    return () => { active = false; clearInterval(id); };
    // Re-runs on navigation too, so counts refresh right after you act on something.
  }, [user, pathname]);

  // Auto sign-out after a period of inactivity (security: unattended dashboards).
  useEffect(() => {
    if (!user) return;
    const IDLE_MS = 30 * 60 * 1000; // 30 minutes
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        toast('Signed out due to inactivity.', { icon: '🔒' });
        logout();
        router.push('/login');
      }, IDLE_MS);
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [user, logout, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  const initials = (user.name || 'A')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen bg-muted/40">
      <Toaster position="top-right" toastOptions={{ duration: 5000, error: { duration: 6500 } }} />

      {/* Mobile Top Navigation Header */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-card border-b border-border shadow-xs">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            aria-label="Toggle navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shadow-xs">
              <Droplet className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm text-foreground">Smart Blood Bank</span>
          </div>
        </div>
        <Link
          href="/dashboard/profile"
          className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold"
        >
          {initials}
        </Link>
      </header>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 w-64 h-screen bg-card border-r border-border transition-transform duration-300 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-5 h-16 flex items-center border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm">
                <Droplet className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="leading-tight">
                <h1 className="text-[15px] font-bold text-foreground">Smart Blood Bank</h1>
                <p className="text-[11px] text-muted-foreground">
                  {user.role === 'superadmin' ? 'Super admin' : user.role === 'admin' ? 'Admin dashboard' : 'Staff dashboard'}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Menu</p>
            <div className="space-y-0.5">
              {navItems
                .filter((item) => !item.roles || item.roles.includes(user.role))
                .map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  const badgeKey = (item as any).badgeKey as string | undefined;
                  const count = badgeKey ? badges[badgeKey] || 0 : 0;
                  // SOS = loud red (urgent); low stock = amber (caution); rest = calm.
                  const badgeClass =
                    badgeKey === 'sos'
                      ? 'bg-red-600 text-white animate-pulse'
                      : badgeKey === 'lowStock'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-primary/15 text-primary';
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary-light text-primary font-semibold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-primary" />}
                      <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                      <span className="flex-1">{item.name}</span>
                      {count > 0 && (
                        <span
                          className={cn(
                            "ml-auto min-w-5 h-5 px-1.5 rounded-full text-xs font-semibold flex items-center justify-center",
                            badgeClass
                          )}
                        >
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </Link>
                  );
                })}
            </div>
          </nav>

          {/* User Info & Logout */}
          <div className="p-3 border-t border-border">
            <Link
              href="/dashboard/profile"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 rounded-lg px-2 py-2 mb-2 hover:bg-muted/60 transition-colors"
              title="My profile"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary text-sm font-semibold">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </Link>
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-destructive/25 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <main className="lg:ml-64 min-h-screen">
        <div className="mx-auto max-w-[1400px] p-4 sm:p-6 md:p-8">
          {(badges.sos || 0) > 0 && pathname !== '/dashboard/sos' && (
            <div className="mb-6 p-4 rounded-xl bg-red-600 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <Siren className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-sm">🚨 ACTIVE EMERGENCY SOS IN PROGRESS</p>
                  <p className="text-xs text-red-100">
                    {badges.sos} urgent emergency alert(s) pending in your coverage area.
                  </p>
                </div>
              </div>
              <Link
                href="/dashboard/sos"
                className="px-4 py-1.5 rounded-lg bg-white text-red-700 font-bold text-xs hover:bg-red-50 transition-colors shrink-0 shadow-sm"
              >
                Open SOS Center →
              </Link>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}