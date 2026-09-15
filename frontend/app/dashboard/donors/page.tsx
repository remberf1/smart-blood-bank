'use client';
import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Loading, EmptyState } from '@/components/ui/states';
import { useAuth } from '../../contexts/AuthContext';
import {
  Users,
  Droplet,
  Calendar,
  Phone,
  Mail,
  Search,
  QrCode,
  Clock,
  CheckCircle,
  AlertCircle,
  HeartHandshake,
  ArrowUpDown,
} from 'lucide-react';

function SortHead({ label, col, sort, onSort }: { label: string; col: string; sort: string; onSort: (c: any) => void }) {
  const active = SORT_KEYS[col] === sort;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={`inline-flex items-center gap-1 hover:text-foreground ${active ? 'text-foreground font-medium' : ''}`}
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${active ? 'text-primary' : 'text-muted-foreground/50'}`} />
    </button>
  );
}

interface Hospital { _id: string; name: string }

interface Donor {
  _id: string;
  name: string;
  phone: string;
  email: string;
  bloodGroup: string;
  eligibilityStatus: string;
  deferralReason?: string;
  lastDonationDate: string;
  createdAt: string;
  homeHospitalId?: { name: string } | null;
}

const PAGE_SIZE = 20;
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
// Clickable column → backend sort key.
const SORT_KEYS: Record<string, string> = {
  bloodGroup: 'bloodGroup',
  status: 'status',
  lastDonation: 'lastDonation',
  registered: 'recent',
};

export default function DonorsPage() {
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ total: 0, eligible: 0, deferred: 0, bloodGroups: 0 });
  const [bloodFilter, setBloodFilter] = useState('');
  const [eligFilter, setEligFilter] = useState('');
  const [sort, setSort] = useState('recent');
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [recordDonor, setRecordDonor] = useState<Donor | null>(null);
  const [recording, setRecording] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [recordHospitalId, setRecordHospitalId] = useState('');

  const fetchDonors = async (pageArg: number, search: string) => {
    setLoading(true);
    try {
      const response = await apiClient.get('/donors', {
        params: {
          page: pageArg,
          limit: PAGE_SIZE,
          search: search || undefined,
          bloodGroup: bloodFilter || undefined,
          eligibility: eligFilter || undefined,
          sort,
        },
      });
      setDonors(response.data.data);
      setTotalPages(response.data.totalPages);
      setStats(response.data.stats);
    } catch (error) {
      console.error('Error fetching donors:', error);
      toast.error('Failed to load donors');
    } finally {
      setLoading(false);
    }
  };

  // Debounce the search box and reset to the first page on a new term.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Changing a filter or the sort resets to the first page.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloodFilter, eligFilter, sort]);

  // Fetch whenever the page, search, filters, or sort change.
  useEffect(() => {
    fetchDonors(page, debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, bloodFilter, eligFilter, sort]);

  const toggleSort = (col: keyof typeof SORT_KEYS) => setSort(SORT_KEYS[col]);

  const fetchQrCode = async (donorId: string) => {
    try {
      const response = await apiClient.get(`/donors/${donorId}/qrcode`);
      setQrCode(response.data.qrCode);
    } catch (error) {
      console.error('Error fetching QR code:', error);
      toast.error('Failed to load QR code');
    }
  };

  const handleViewQr = async (donor: Donor) => {
    setSelectedDonor(donor);
    await fetchQrCode(donor._id);
    setQrDialogOpen(true);
  };

  // Superadmin has no home hospital, so they must choose where the donation is
  // recorded; load the hospital list the first time the dialog is opened.
  const openRecord = async (donor: Donor) => {
    setRecordDonor(donor);
    let list = hospitals;
    if (isSuperadmin && list.length === 0) {
      try {
        const res = await apiClient.get('/hospitals');
        list = res.data;
        setHospitals(res.data);
      } catch {
        toast.error('Could not load hospitals');
      }
    }
    // Default the hospital so it's never left blank (superadmin can change it).
    setRecordHospitalId(isSuperadmin ? (list[0]?._id || '') : '');
  };

  const handleRecordDonation = async () => {
    if (!recordDonor) return;
    if (isSuperadmin && !recordHospitalId) {
      toast.error('Select the hospital where the donation happened.');
      return;
    }
    setRecording(true);
    try {
      const res = await apiClient.post(`/donors/${recordDonor._id}/record-donation`, {
        hospitalId: isSuperadmin ? recordHospitalId : undefined,
      });
      const { bloodGroup, units } = res.data.inventory;
      toast.success(`Donation recorded — ${bloodGroup} stock is now ${units} unit${units === 1 ? '' : 's'}. Donor deferred 90 days.`);
      setRecordDonor(null);
      fetchDonors(page, debouncedSearch); // refresh eligibility badges
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record donation');
    } finally {
      setRecording(false);
    }
  };

  const getEligibilityBadge = (status: string) => {
    switch (status) {
      case 'eligible':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">Eligible</Badge>;
      case 'deferred':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Deferred</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Pending</Badge>;
      default:
        return <Badge variant="destructive">{status}</Badge>;
    }
  };

  const getLastDonationStatus = (lastDonationDate: string | null) => {
    if (!lastDonationDate) {
      return { text: 'Never donated', icon: Clock, color: 'text-muted-foreground' };
    }
    const daysSince = Math.floor((Date.now() - new Date(lastDonationDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince < 90) {
      return { text: `${daysSince} days ago`, icon: AlertCircle, color: 'text-yellow-600' };
    }
    return { text: `${daysSince} days ago`, icon: CheckCircle, color: 'text-green-600' };
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Donors" subtitle="Manage registered blood donors" />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Donors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Registered volunteers</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Eligible Donors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{stats.eligible}</div>
            <p className="text-xs text-green-600 mt-1">Ready to donate</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-700">Deferred</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-700">{stats.deferred}</div>
            <p className="text-xs text-yellow-600 mt-1">Currently ineligible</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Blood Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.bloodGroups}</div>
            <p className="text-xs text-muted-foreground mt-1">Types represented</p>
          </CardContent>
        </Card>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or email…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={bloodFilter}
          onChange={(e) => setBloodFilter(e.target.value)}
          className="h-9 border border-input rounded-lg px-3 text-sm bg-card"
        >
          <option value="">All blood groups</option>
          {BLOOD_GROUPS.map((bg) => (
            <option key={bg} value={bg}>{bg}</option>
          ))}
        </select>
        <select
          value={eligFilter}
          onChange={(e) => setEligFilter(e.target.value)}
          className="h-9 border border-input rounded-lg px-3 text-sm bg-card"
        >
          <option value="">All statuses</option>
          <option value="eligible">Eligible</option>
          <option value="deferred">Deferred</option>
          <option value="pending">Pending</option>
          <option value="ineligible">Ineligible</option>
        </select>
        {(bloodFilter || eligFilter || searchTerm) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setBloodFilter(''); setEligFilter(''); setSearchTerm(''); }}
            className="text-muted-foreground"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Donors Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Donor</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>
                    <SortHead label="Blood Group" col="bloodGroup" sort={sort} onSort={toggleSort} />
                  </TableHead>
                  <TableHead>
                    <SortHead label="Status" col="status" sort={sort} onSort={toggleSort} />
                  </TableHead>
                  <TableHead>
                    <SortHead label="Last Donation" col="lastDonation" sort={sort} onSort={toggleSort} />
                  </TableHead>
                  <TableHead>
                    <SortHead label="Registered" col="registered" sort={sort} onSort={toggleSort} />
                  </TableHead>
                  <TableHead>Home Hospital</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8}><Loading label="Loading donors…" /></TableCell></TableRow>
                ) : donors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <EmptyState
                        icon={Users}
                        title={searchTerm ? 'No donors match your search' : 'No donors registered yet'}
                        hint={searchTerm ? undefined : 'Donors who sign up or are added by staff will appear here.'}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  donors.map((donor) => {
                    const lastDonation = getLastDonationStatus(donor.lastDonationDate);
                    const LastDonationIcon = lastDonation.icon;
                    return (
                      <TableRow key={donor._id} className="hover:bg-muted/50">
                        <TableCell>
                          <div>
                            <div className="font-medium text-foreground">{donor.name}</div>
                            {donor.email && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                {donor.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {donor.phone}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            <Droplet className="h-3 w-3 mr-1" />
                            {donor.bloodGroup}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {getEligibilityBadge(donor.eligibilityStatus)}
                          {donor.deferralReason &&
                            (donor.eligibilityStatus === 'deferred' || donor.eligibilityStatus === 'ineligible') && (
                              <div className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                                {donor.deferralReason}
                              </div>
                            )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <LastDonationIcon className={`h-3 w-3 ${lastDonation.color}`} />
                            <span className={`text-sm ${lastDonation.color}`}>
                              {lastDonation.text}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(donor.createdAt).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {donor.homeHospitalId?.name || <span className="text-muted-foreground/60">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openRecord(donor)}
                              disabled={donor.eligibilityStatus !== 'eligible'}
                              title={
                                donor.eligibilityStatus !== 'eligible'
                                  ? `Not eligible (${donor.eligibilityStatus})`
                                  : 'Record a donation'
                              }
                              className="h-8 px-3 text-emerald-700 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                            >
                              <HeartHandshake className="h-4 w-4 mr-1" />
                              Record
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewQr(donor)}
                              className="h-8 px-3 text-primary hover:text-primary hover:bg-primary/10"
                            >
                              <QrCode className="h-4 w-4 mr-1" />
                              QR
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {stats.total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {stats.total} donor{stats.total === 1 ? '' : 's'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Record Donation Dialog */}
      <Dialog open={!!recordDonor} onOpenChange={(o) => !o && setRecordDonor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HeartHandshake className="h-5 w-5 text-emerald-600" /> Record donation
            </DialogTitle>
            <DialogDescription>
              This logs the donation, adds one unit to inventory, and defers the donor for 90 days.
            </DialogDescription>
          </DialogHeader>
          {recordDonor && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border p-3 text-sm space-y-1">
                <p><strong>Donor:</strong> {recordDonor.name}</p>
                <p className="flex items-center gap-2">
                  <strong>Blood group:</strong>
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{recordDonor.bloodGroup}</Badge>
                </p>
                <p><strong>Phone:</strong> {recordDonor.phone}</p>
              </div>
              {isSuperadmin && (
                <div>
                  <label className="text-sm font-medium text-foreground">Record at hospital</label>
                  <select
                    value={recordHospitalId}
                    onChange={(e) => setRecordHospitalId(e.target.value)}
                    className="mt-1 w-full border border-input rounded-lg px-3 py-2 text-sm bg-card"
                  >
                    <option value="">Select hospital…</option>
                    {hospitals.map((h) => (
                      <option key={h._id} value={h._id}>{h.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    The unit will be added to this hospital&apos;s stock.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordDonor(null)} disabled={recording}>
              Cancel
            </Button>
            <Button onClick={handleRecordDonation} disabled={recording} className="bg-emerald-600 hover:bg-emerald-700">
              {recording ? 'Recording…' : 'Confirm donation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Donor QR Code</DialogTitle>
            <DialogDescription>
              Scan this QR code at the blood bank for quick donor verification.
            </DialogDescription>
          </DialogHeader>
          {selectedDonor && (
            <div className="text-center py-4">
              <div className="mb-4">
                <div className="w-48 h-48 mx-auto bg-card p-4 rounded-lg border">
                  {qrCode ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrCode} alt="QR Code" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2 text-left">
                <p><strong>Name:</strong> {selectedDonor.name}</p>
                <p><strong>Blood Group:</strong> {selectedDonor.bloodGroup}</p>
                <p><strong>Phone:</strong> {selectedDonor.phone}</p>
                <p><strong>Status:</strong> {selectedDonor.eligibilityStatus}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQrDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}