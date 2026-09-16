'use client';
import { useEffect, useState, useCallback } from 'react';
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
  Printer,
  UserCheck,
  Stethoscope,
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
  homeHospitalId?: { _id?: string; name: string } | null;
  weight?: number;
  gender?: string;
  dateOfBirth?: string;
  allergies?: string;
  notes?: string;
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
  const [nowMs, setNowMs] = useState(0);
  const [bloodFilter, setBloodFilter] = useState('');
  const [eligFilter, setEligFilter] = useState('');
  const [homeFilter, setHomeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
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
  const [triage, setTriage] = useState({
    weight: '65',
    hemoglobin: '13.5',
    bloodPressure: '120/80',
    ttiPassed: true,
  });

  // QR Scanner / Verifier state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifiedDonor, setVerifiedDonor] = useState<{
    id?: string;
    name: string;
    bloodGroup: string;
    phone: string;
    eligibilityStatus: string;
    lastDonationDate?: string | null;
    deferralReason?: string | null;
  } | null>(null);
  const [recordingQrDonation, setRecordingQrDonation] = useState(false);

  // Clinical Manage Donor modal state
  const [manageDonor, setManageDonor] = useState<Donor | null>(null);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [savingManage, setSavingManage] = useState(false);
  const [manageForm, setManageForm] = useState({
    name: '',
    phone: '',
    email: '',
    bloodGroup: 'O+',
    weight: '',
    gender: '',
    dateOfBirth: '',
    allergies: '',
    notes: '',
    eligibilityStatus: 'auto',
    deferralReason: '',
    homeHospitalId: '',
  });

  const fetchDonors = useCallback(async (pageArg: number, search: string) => {
    setLoading(true);
    try {
      const response = await apiClient.get('/donors', {
        params: {
          page: pageArg,
          limit: PAGE_SIZE,
          search: search || undefined,
          bloodGroup: bloodFilter || undefined,
          eligibility: eligFilter || undefined,
          homeHospital: homeFilter || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
          sort,
        },
      });
      setDonors(response.data.data);
      setTotalPages(response.data.totalPages);
      setStats(response.data.stats);
      setNowMs(Date.now());
    } catch (error) {
      console.error('Error fetching donors:', error);
      toast.error('Failed to load donors');
    } finally {
      setLoading(false);
    }
  }, [bloodFilter, eligFilter, homeFilter, fromDate, toDate, sort]);

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
  }, [bloodFilter, eligFilter, homeFilter, fromDate, toDate, sort]);

  // Fetch whenever the page, search, filters, or sort change.
  useEffect(() => {
    fetchDonors(page, debouncedSearch);
  }, [page, debouncedSearch, fetchDonors]);

  // Load hospitals once for the home-hospital filter (superadmin) + record dialog.
  useEffect(() => {
    if (isSuperadmin) {
      apiClient.get('/hospitals').then((r) => setHospitals(r.data)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const openRecord = async (donor: Donor) => {
    setRecordDonor(donor);
    setTriage({
      weight: '65',
      hemoglobin: '13.5',
      bloodPressure: '120/80',
      ttiPassed: true,
    });
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

  const openManageModal = async (d: Donor) => {
    setManageDonor(d);
    let list = hospitals;
    if (list.length === 0) {
      try {
        const res = await apiClient.get('/hospitals');
        list = res.data;
        setHospitals(res.data);
      } catch {}
    }
    setManageForm({
      name: d.name || '',
      phone: d.phone || '',
      email: d.email || '',
      bloodGroup: d.bloodGroup || 'O+',
      weight: d.weight != null ? String(d.weight) : '',
      gender: d.gender || '',
      dateOfBirth: d.dateOfBirth ? d.dateOfBirth.slice(0, 10) : '',
      allergies: d.allergies || '',
      notes: d.notes || '',
      eligibilityStatus: d.eligibilityStatus || 'auto',
      deferralReason: d.deferralReason || '',
      homeHospitalId: (d.homeHospitalId as any)?._id || (typeof d.homeHospitalId === 'string' ? d.homeHospitalId : ''),
    });
    setManageModalOpen(true);
  };

  const handleSaveManage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageDonor) return;
    setSavingManage(true);
    try {
      const payload: any = {
        name: manageForm.name,
        phone: manageForm.phone,
        bloodGroup: manageForm.bloodGroup,
        weight: manageForm.weight !== '' ? Number(manageForm.weight) : null,
        gender: manageForm.gender || undefined,
        dateOfBirth: manageForm.dateOfBirth || undefined,
        allergies: manageForm.allergies,
        notes: manageForm.notes,
        homeHospitalId: manageForm.homeHospitalId || null,
        eligibilityStatus: manageForm.eligibilityStatus,
        deferralReason: manageForm.deferralReason,
      };
      await apiClient.put(`/donors/${manageDonor._id}`, payload);
      toast.success(`Clinical profile for ${manageForm.name} updated!`);
      setManageModalOpen(false);
      fetchDonors(page, debouncedSearch);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update donor');
    } finally {
      setSavingManage(false);
    }
  };

  const handleRecordDonation = async () => {
    if (!recordDonor) return;
    if (isSuperadmin && !recordHospitalId) {
      toast.error('Select the hospital where the donation happened.');
      return;
    }
    const w = parseFloat(triage.weight);
    if (isNaN(w) || w < 50) {
      toast.error('Donor weight must be at least 50 kg for blood collection.');
      return;
    }
    const hb = parseFloat(triage.hemoglobin);
    if (isNaN(hb) || hb < 12.5) {
      toast.error('Hemoglobin must be at least 12.5 g/dL per national guidelines.');
      return;
    }
    if (!triage.ttiPassed) {
      toast.error('Donation cannot proceed: Rapid TTI screening must be non-reactive.');
      return;
    }
    setRecording(true);
    try {
      const res = await apiClient.post(`/donors/${recordDonor._id}/record-donation`, {
        hospitalId: isSuperadmin ? recordHospitalId : undefined,
        triage,
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

  const handleVerifyQr = async (codeToVerify?: string) => {
    const code = (codeToVerify || scanInput).trim();
    if (!code) {
      toast.error('Please enter or scan a QR code / token / donor ID');
      return;
    }
    setVerifying(true);
    try {
      const res = await apiClient.post('/donors/verify', { qrData: code });
      if (res.data.verified && res.data.donor) {
        setVerifiedDonor(res.data.donor);
        toast.success(`Verified: ${res.data.donor.name} (${res.data.donor.bloodGroup})`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Verification failed. Invalid QR code, token, or donor ID.');
      setVerifiedDonor(null);
    } finally {
      setVerifying(false);
    }
  };

  const handleRecordFromQr = async () => {
    const code = scanInput.trim();
    if (!code || !verifiedDonor) return;
    if (isSuperadmin && !recordHospitalId) {
      toast.error('Please select the hospital receiving the donation');
      return;
    }
    setRecordingQrDonation(true);
    try {
      const res = await apiClient.post('/donors/verify', {
        qrData: code,
        recordDonation: true,
        hospitalId: isSuperadmin ? recordHospitalId : undefined,
        triage: {
          weight: 65,
          hemoglobin: 13.5,
          bloodPressure: '120/80',
          ttiPassed: true,
        },
      });
      if (res.data.donationRecorded) {
        const { bloodGroup, units } = res.data.inventory;
        toast.success(`Donation recorded! ${bloodGroup} stock updated to ${units} unit(s). Donor deferred 90 days.`);
        setScannerOpen(false);
        setVerifiedDonor(null);
        setScanInput('');
        fetchDonors(page, debouncedSearch);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record donation');
    } finally {
      setRecordingQrDonation(false);
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
    const current = nowMs || new Date(lastDonationDate).getTime();
    const daysSince = Math.floor((current - new Date(lastDonationDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince < 90) {
      return { text: `${daysSince} days ago`, icon: AlertCircle, color: 'text-yellow-600' };
    }
    return { text: `${daysSince} days ago`, icon: CheckCircle, color: 'text-green-600' };
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Donors"
        subtitle="Manage registered blood donors"
        action={
          <Button
            onClick={() => {
              setScannerOpen(true);
              setVerifiedDonor(null);
              setScanInput('');
            }}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <QrCode className="h-4 w-4" /> Scan / Verify Donor QR
          </Button>
        }
      />

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
        {isSuperadmin && (
          <select
            value={homeFilter}
            onChange={(e) => setHomeFilter(e.target.value)}
            className="h-9 border border-input rounded-lg px-3 text-sm bg-card max-w-[200px]"
          >
            <option value="">All home hospitals</option>
            {hospitals.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
          </select>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Registered:</span>
          <div className="inline-flex items-center gap-1 border border-input rounded-lg px-2 py-1 bg-card">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="text-xs bg-transparent focus:outline-hidden"
              aria-label="Filter from registration date"
            />
          </div>
          <span>–</span>
          <div className="inline-flex items-center gap-1 border border-input rounded-lg px-2 py-1 bg-card">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="text-xs bg-transparent focus:outline-hidden"
              aria-label="Filter to registration date"
            />
          </div>
        </div>
        {(bloodFilter || eligFilter || homeFilter || fromDate || toDate || searchTerm) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setBloodFilter(''); setEligFilter(''); setHomeFilter(''); setFromDate(''); setToDate(''); setSearchTerm(''); }}
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
                              onClick={() => openManageModal(donor)}
                              title="Clinical exam & donor management"
                              className="h-8 px-2 text-blue-700 hover:text-blue-800 hover:bg-blue-50 text-xs"
                            >
                              <UserCheck className="h-3.5 w-3.5 mr-1" />
                              Manage
                            </Button>
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
                              className="h-8 px-2.5 text-emerald-700 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 text-xs"
                            >
                              <HeartHandshake className="h-3.5 w-3.5 mr-1" />
                              Record
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewQr(donor)}
                              title="Print official donor ID card / pass"
                              className="h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-muted text-xs"
                            >
                              <Printer className="h-3.5 w-3.5 mr-1" />
                              Pass
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

      {/* Clinical Exam & Manage Donor Dialog */}
      <Dialog open={manageModalOpen} onOpenChange={setManageModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-blue-600" /> Clinical Review & Donor Vitals
            </DialogTitle>
            <DialogDescription>
              Update clinical exam vitals, weight, eligibility overrides, and home hospital assignment.
            </DialogDescription>
          </DialogHeader>

          {manageDonor && (
            <form onSubmit={handleSaveManage} className="space-y-4 py-2">
              <div className="rounded-lg border border-border p-3 text-sm bg-muted/20 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-foreground">{manageDonor.name}</div>
                  <div className="text-xs text-muted-foreground">{manageDonor.phone} · {manageDonor.email || 'No email'}</div>
                </div>
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  <Droplet className="h-3 w-3 mr-1" />
                  {manageDonor.bloodGroup}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Body Weight (kg) *
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.1"
                      min="30"
                      max="250"
                      placeholder="e.g. 65"
                      value={manageForm.weight}
                      onChange={(e) => setManageForm({ ...manageForm, weight: e.target.value })}
                      required
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-medium">kg</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Threshold: &ge;50kg required for donation.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Blood Group
                  </label>
                  <select
                    value={manageForm.bloodGroup}
                    onChange={(e) => setManageForm({ ...manageForm, bloodGroup: e.target.value })}
                    className="w-full h-9 border border-input rounded-lg px-3 text-sm bg-card"
                  >
                    {BLOOD_GROUPS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Date of Birth
                  </label>
                  <Input
                    type="date"
                    value={manageForm.dateOfBirth}
                    onChange={(e) => setManageForm({ ...manageForm, dateOfBirth: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Must be 18–65 years.</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Gender
                  </label>
                  <select
                    value={manageForm.gender}
                    onChange={(e) => setManageForm({ ...manageForm, gender: e.target.value })}
                    className="w-full h-9 border border-input rounded-lg px-3 text-sm bg-card"
                  >
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Eligibility Status
                  </label>
                  <select
                    value={manageForm.eligibilityStatus}
                    onChange={(e) => setManageForm({ ...manageForm, eligibilityStatus: e.target.value })}
                    className="w-full h-9 border border-input rounded-lg px-3 text-sm bg-card font-medium"
                  >
                    <option value="auto">🔄 Auto-calculate from vitals</option>
                    <option value="eligible">✅ Eligible (Cleared)</option>
                    <option value="deferred">⏳ Deferred (Temporary)</option>
                    <option value="ineligible">❌ Ineligible (Permanent)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Home Hospital
                  </label>
                  <select
                    value={manageForm.homeHospitalId}
                    onChange={(e) => setManageForm({ ...manageForm, homeHospitalId: e.target.value })}
                    className="w-full h-9 border border-input rounded-lg px-3 text-sm bg-card"
                  >
                    <option value="">None / Unassigned</option>
                    {hospitals.map((h) => (
                      <option key={h._id} value={h._id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Deferral / Clearance Note
                </label>
                <Input
                  placeholder="e.g. Weight meets requirement, cleared by physician"
                  value={manageForm.deferralReason}
                  onChange={(e) => setManageForm({ ...manageForm, deferralReason: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Allergies & Clinical Notes
                </label>
                <textarea
                  value={manageForm.notes}
                  onChange={(e) => setManageForm({ ...manageForm, notes: e.target.value })}
                  rows={2}
                  className="w-full border border-input rounded-lg p-2 text-sm bg-card focus:outline-hidden"
                  placeholder="e.g. Normal blood pressure (120/80), negative rapid TTI screening, no known allergies."
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setManageModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={savingManage} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {savingManage ? 'Saving...' : 'Save Clinical Profile'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

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
              <div className="rounded-lg border border-border p-3 text-sm space-y-1 bg-muted/20">
                <p><strong>Donor:</strong> {recordDonor.name}</p>
                <p className="flex items-center gap-2">
                  <strong>Blood group:</strong>
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{recordDonor.bloodGroup}</Badge>
                </p>
                <p><strong>Phone:</strong> {recordDonor.phone}</p>
              </div>

              {/* Pre-Donation Clinical Triage Checklist (WHO / NBTS Protocol) */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> Pre-Donation Clinical Triage
                  </h4>
                  <span className="text-[10px] text-muted-foreground">WHO / NBTS Standards</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-foreground">Donor Weight (kg)</label>
                    <Input
                      type="number"
                      min="40"
                      step="0.5"
                      value={triage.weight}
                      onChange={(e) => setTriage({ ...triage, weight: e.target.value })}
                      className="h-8 text-xs mt-1 bg-background"
                      placeholder="Min 50 kg"
                    />
                    <span className="text-[10px] text-muted-foreground">Min 50 kg required</span>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-foreground">Hemoglobin (g/dL)</label>
                    <Input
                      type="number"
                      min="8"
                      step="0.1"
                      value={triage.hemoglobin}
                      onChange={(e) => setTriage({ ...triage, hemoglobin: e.target.value })}
                      className="h-8 text-xs mt-1 bg-background"
                      placeholder="Min 12.5 g/dL"
                    />
                    <span className="text-[10px] text-muted-foreground">Min 12.5 g/dL</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground">Blood Pressure (mmHg)</label>
                  <Input
                    type="text"
                    value={triage.bloodPressure}
                    onChange={(e) => setTriage({ ...triage, bloodPressure: e.target.value })}
                    className="h-8 text-xs mt-1 bg-background"
                    placeholder="e.g. 120/80"
                  />
                </div>

                <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={triage.ttiPassed}
                    onChange={(e) => setTriage({ ...triage, ttiPassed: e.target.checked })}
                    className="h-4 w-4 accent-emerald-600 mt-0.5 rounded shrink-0"
                  />
                  <span className="leading-snug">
                    <strong>TTI Rapid Screen Passed:</strong> Non-reactive for HIV 1/2, Hepatitis B (HBsAg), Hepatitis C (HCV), and Syphilis.
                  </span>
                </label>
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
      {/* Official Printable Donor ID Card Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" /> Official Donor ID Pass
            </DialogTitle>
            <DialogDescription>
              Printable identification badge for point-of-collection verification and donor records.
            </DialogDescription>
          </DialogHeader>
          {selectedDonor && (
            <div className="py-2 space-y-4">
              {/* Printable Card Area */}
              <div className="rounded-xl border-2 border-red-200 bg-gradient-to-br from-red-50/40 via-white to-gray-50 p-4 shadow-xs relative">
                <div className="flex items-center justify-between border-b pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Droplet className="h-5 w-5 text-red-600 fill-red-600" />
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wide text-gray-800">Smart Blood Bank</h4>
                      <p className="text-[10px] text-muted-foreground">{selectedDonor.homeHospitalId?.name || 'Verified Donor Network'}</p>
                    </div>
                  </div>
                  <Badge className="bg-red-600 text-white font-bold text-sm px-2.5 py-0.5">
                    {selectedDonor.bloodGroup}
                  </Badge>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-28 h-28 bg-white p-1.5 rounded-lg border shadow-xs shrink-0 flex items-center justify-center">
                    {qrCode ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qrCode} alt="Donor QR" className="w-full h-full object-contain" />
                    ) : (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    )}
                  </div>

                  <div className="space-y-1 text-xs text-left">
                    <p className="font-bold text-sm text-gray-900">{selectedDonor.name}</p>
                    <p className="text-muted-foreground font-mono">ID: {selectedDonor._id.slice(-8).toUpperCase()}</p>
                    <p className="text-gray-600">Tel: {selectedDonor.phone}</p>
                    <div className="pt-1">
                      {getEligibilityBadge(selectedDonor.eligibilityStatus)}
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-gray-400 text-center pt-3 border-t mt-3">
                  Valid at all participating hospital blood banks &bull; Federal Republic of Nigeria
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="sm:justify-between flex-row gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => window.print()}
              className="flex-1"
            >
              <Printer className="h-4 w-4 mr-1.5" /> Print Donor Badge
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQrDialogOpen(false)}
              className="flex-1"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scan / Verify Donor QR Dialog */}
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" /> Scan &amp; Verify Donor Pass
            </DialogTitle>
            <DialogDescription>
              Scan a donor&apos;s digital QR pass with a 2D barcode scanner, or paste their token or donor ID below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">QR Payload / JWT Token / Donor ID</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Paste QR payload, token, or 24-char donor ID..."
                  value={scanInput}
                  onChange={(e) => {
                    setScanInput(e.target.value);
                    if (verifiedDonor) setVerifiedDonor(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleVerifyQr();
                    }
                  }}
                  autoFocus
                />
                <Button
                  type="button"
                  onClick={() => handleVerifyQr()}
                  disabled={verifying || !scanInput.trim()}
                >
                  {verifying ? 'Verifying…' : 'Verify'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: Handheld 2D barcode scanners auto-fill this field upon scanning the donor&apos;s phone screen.
              </p>
            </div>

            {verifiedDonor && (
              <div className="rounded-xl border p-4 bg-muted/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-base text-foreground">{verifiedDonor.name}</h4>
                    <p className="text-xs text-muted-foreground">{verifiedDonor.phone}</p>
                  </div>
                  <Badge className="bg-red-100 text-red-800 text-base font-bold px-3 py-1">
                    {verifiedDonor.bloodGroup}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Eligibility:</span>
                  {getEligibilityBadge(verifiedDonor.eligibilityStatus)}
                </div>

                {verifiedDonor.deferralReason && (
                  <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    <strong>Notice:</strong> {verifiedDonor.deferralReason}
                  </div>
                )}

                {isSuperadmin && hospitals.length > 0 && (
                  <div className="space-y-1 pt-2">
                    <label className="text-xs font-medium">Receiving Hospital</label>
                    <select
                      value={recordHospitalId}
                      onChange={(e) => setRecordHospitalId(e.target.value)}
                      className="w-full h-9 border rounded-md px-3 text-sm bg-background"
                    >
                      <option value="">Select receiving hospital…</option>
                      {hospitals.map((h) => (
                        <option key={h._id} value={h._id}>{h.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    onClick={handleRecordFromQr}
                    disabled={recordingQrDonation || verifiedDonor.eligibilityStatus !== 'eligible'}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium"
                  >
                    <HeartHandshake className="h-4 w-4 mr-2" />
                    {recordingQrDonation
                      ? 'Recording donation…'
                      : verifiedDonor.eligibilityStatus === 'eligible'
                        ? `Record 1 Unit Donation (${verifiedDonor.bloodGroup})`
                        : 'Cannot Record (Donor Deferred)'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setScannerOpen(false);
                setVerifiedDonor(null);
                setScanInput('');
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}