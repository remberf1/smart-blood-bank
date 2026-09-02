'use client';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Toaster } from 'react-hot-toast';
import {
  LayoutDashboard,
  Droplet,
  Users,
  Building2,
  LogOut,
  Menu,
  ArrowRightLeft,
  BarChart3,
  UserCog,
  HeartPulse,
  CalendarCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Inventory', href: '/dashboard/inventory', icon: Droplet },
  { name: 'Donors', href: '/dashboard/donors', icon: Users },
  { name: 'Appointments', href: '/dashboard/appointments', icon: CalendarCheck },
  { name: 'Hospitals', href: '/dashboard/hospitals', icon: Building2 },
  { name: 'Patient Requests', href: '/dashboard/patient-requests', icon: HeartPulse },
   { name: 'Resource Requests', href: '/dashboard/requests', icon: ArrowRightLeft },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'Users', href: '/dashboard/users', icon: UserCog, superadminOnly: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

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
      <Toaster position="top-right" />

      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button variant="outline" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="bg-card shadow-sm">
          <Menu className="h-4 w-4" />
        </Button>
      </div>

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
                <p className="text-[11px] text-muted-foreground">Admin dashboard</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Menu</p>
            <div className="space-y-0.5">
              {navItems
                .filter((item) => !(item as any).superadminOnly || user.role === 'superadmin')
                .map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
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
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
            </div>
          </nav>

          {/* User Info & Logout */}
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-3 rounded-lg px-2 py-2 mb-2">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary text-sm font-semibold">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
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
        <div className="mx-auto max-w-[1400px] p-5 md:p-8 pt-16 lg:pt-8">{children}</div>
      </main>
    </div>
  );
}