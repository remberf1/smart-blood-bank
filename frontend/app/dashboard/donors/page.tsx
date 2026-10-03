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
  ShieldCheck,
  FlaskConical,
  AlertTriangle,
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
  bloodGroupSelfReported?: string;
  bloodGroupVerified?: string | null;
  bloodGroupVerificationStatus?: 'unverified' | 'pending_verification' | 'verified' | 'rejected';
  correctionRequest?: {
    requestedGroup: string;
    reason: string;
    status?: string;
    requestedAt?: string;
  };
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
const VERIFICATION_METHODS = [
  { value: 'tube_agglutination', label: 'Tube Agglutination (Gold Standard: Forward & Reverse)' },
  { value: 'gel_card', label: 'Gel Card / Column Agglutination Technology' },
  { value: 'automated_analyzer', label: 'Automated Immunohematology Analyzer' },
  { value: 'slide_test', label: 'Slide Test (Rapid Field Screening)' },
  { value: 'prior_lab_record', label: 'Official Prior Hospital Transfusion Record' },
];
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
  const [verificationFilter, setVerificationFilter] = useState('');
  const [eligFilter, setEligFilter] = useState('');
  const [homeFilter, setHomeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState('recent');
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);

  // Blood Group Verification Dialog state
  const [verifyDonor, setVerifyDonor] = useState<Donor | null>(null);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyingBlood, setVerifyingBlood] = useState(false);
  const [verifyForm, setVerifyForm] = useState({
    verifiedGroup: 'O+',
    verificationMethod: 'tube_agglutination',
    notes: '',
    action: 'approve' as 'approve' | 'reject',
  });

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
    verifiedGroup: '',
    verificationMethod: 'tube_agglutination',
  });

  // QR Scanner / Verifier state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifiedDonor, setVerifiedDonor] = useState<{
    id?: string;
    _id?: string;
    name: string;
    bloodGroup: string;
    bloodGroupSelfReported?: string;
    bloodGroupVerified?: string | null;
    bloodGroupVerificationStatus?: 'unverified' | 'pending_verification' | 'verified' | 'rejected';
    phone: string;
    eligibilityStatus: string;
    lastDonationDate?: string | null;
    deferralReason?: string | null;
    ninMasked?: string;
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
          verificationStatus: verificationFilter || undefined,
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
  }, [bloodFilter, verificationFilter, eligFilter, homeFilter, fromDate, toDate, sort]);

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
  }, [bloodFilter, verificationFilter, eligFilter, homeFilter, fromDate, toDate, sort]);

  // Fetch whenever the page, search, filters, or sort change.
  useEffect(() => {
    fetchDonors(page, debouncedSearch);
  }, [page, debouncedSearch, fetchDonors]);

  const openVerifyModal = (d: Donor) => {
    setVerifyDonor(d);
    setVerifyForm({
      verifiedGroup: d.correctionRequest?.requestedGroup || d.bloodGroupVerified || d.bloodGroup || 'O+',
      verificationMethod: 'tube_agglutination',
      notes: d.correctionRequest?.reason ? `Reviewed request: ${d.correctionRequest.reason}` : '',
      action: 'approve',
    });
    setVerifyModalOpen(true);
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyDonor) return;
    setVerifyingBlood(true);
    try {
      const res = await apiClient.post(`/donors/${verifyDonor._id}/verify-blood-group`, {
        verifiedGroup: verifyForm.action === 'reject' ? undefined : verifyForm.verifiedGroup,
        verificationMethod: verifyForm.action === 'reject' ? undefined : verifyForm.verificationMethod,
        notes: verifyForm.notes,
        action: verifyForm.action,
      });
      toast.success(res.data.message || (verifyForm.action === 'reject' ? 'Correction request rejected' : `Blood group ${verifyForm.verifiedGroup} verified!`));
      setVerifyModalOpen(false);
      fetchDonors(page, debouncedSearch);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit verification');
    } finally {
      setVerifyingBlood(false);
    }
  };

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
      verifiedGroup: donor.bloodGroupVerified || donor.bloodGroup || 'O+',
      verificationMethod: 'tube_agglutination',
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

    const payloadTriage: any = { ...triage };
    if (recordDonor.bloodGroupVerificationStatus !== 'verified') {
      payloadTriage.verifiedGroup = triage.verifiedGroup || recordDonor.bloodGroupVerified || recordDonor.bloodGroup || 'O+';
      payloadTriage.verificationMethod = triage.verificationMethod || 'tube_agglutination';
    }

    setRecording(true);
    try {
      const res = await apiClient.post(`/donors/${recordDonor._id}/record-donation`, {
        hospitalId: isSuperadmin ? recordHospitalId : undefined,
        triage: payloadTriage,
      });
      const { bloodGroup, units } = res.data.inventory;
      toast.success(`Donation recorded & verified — ${bloodGroup} stock is now ${units} unit${units === 1 ? '' : 's'}. Donor deferred 90 days.`);
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
        <select
          value={verificationFilter}
          onChange={(e) => setVerificationFilter(e.target.value)}
          className="h-9 border border-input rounded-lg px-3 text-sm bg-card"
        >
          <option value="">All verifications</option>
          <option value="verified">Lab-Verified</option>
          <option value="pending_verification">Pending Review</option>
          <option value="unverified">Self-Reported</option>
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
        {(bloodFilter || verificationFilter || eligFilter || homeFilter || fromDate || toDate || searchTerm) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setBloodFilter(''); setVerificationFilter(''); setEligFilter(''); setHomeFilter(''); setFromDate(''); setToDate(''); setSearchTerm(''); }}
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
                          <div className="space-y-1">
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-bold">
                              <Droplet className="h-3 w-3 mr-1 text-red-600" />
                              {donor.bloodGroupVerified || donor.bloodGroup}
                            </Badge>
                            <div>
                              {donor.bloodGroupVerificationStatus === 'verified' ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-medium py-0 px-1.5 flex items-center gap-1 w-fit">
                                  <ShieldCheck className="h-2.5 w-2.5 text-emerald-600" /> Lab-Verified
                                </Badge>
                              ) : donor.bloodGroupVerificationStatus === 'pending_verification' ? (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-semibold py-0.5 px-2 flex items-center gap-1 w-fit cursor-help shadow-2xs"
                                  title={`Discrepancy: Profile lists ${donor.bloodGroup}, but donor claims ${donor.correctionRequest?.requestedGroup}. Confirmatory ABO/Rh laboratory test required.`}
                                >
                                  <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                                  Discrepancy: Claims {donor.correctionRequest?.requestedGroup || '?'}
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-slate-100 text-slate-700 border-slate-300 text-[10px] font-medium py-0.5 px-1.5 flex items-center gap-1 w-fit cursor-help"
                                  title="Self-reported blood type. Confirmatory ABO/Rh test required before units can be logged into blood inventory."
                                >
                                  <FlaskConical className="h-3 w-3 text-slate-500 shrink-0" />
                                  Self-Reported (Confirmatory Test Req.)
                                </Badge>
                              )}
                            </div>
                          </div>
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
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {donor.eligibilityStatus === 'eligible' && (
                              <Button
                                size="sm"
                                onClick={() => openRecord(donor)}
                                className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center gap-1 shadow-2xs"
                                title="Log phlebotomy donation and update inventory"
                              >
                                <HeartHandshake className="h-3.5 w-3.5" /> Log Donation
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openVerifyModal(donor)}
                              title="Laboratory blood group verification / correction review"
                              className={`h-8 px-2 text-xs flex items-center gap-1 ${
                                donor.bloodGroupVerificationStatus === 'pending_verification'
                                  ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 font-semibold border-amber-300'
                                  : donor.bloodGroupVerificationStatus === 'verified'
                                  ? 'text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200'
                                  : 'text-blue-700 hover:text-blue-800 hover:bg-blue-50 border-blue-200'
                              }`}
                            >
                              <FlaskConical className="h-3.5 w-3.5" />
                              {donor.bloodGroupVerificationStatus === 'pending_verification'
                                ? 'Resolve Review'
                                : donor.bloodGroupVerificationStatus === 'verified'
                                ? 'Re-verify'
                                : 'Verify ABO/Rh'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openManageModal(donor)}
                              title="Clinical exam & donor management"
                              className="h-8 px-2 text-gray-700 hover:text-gray-900 border-gray-200 hover:bg-gray-50 text-xs flex items-center gap-1"
                            >
                              <UserCheck className="h-3.5 w-3.5" /> Edit Profile
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewQr(donor)}
                              title="Print official donor ID card / pass"
                              className="h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-muted text-xs flex items-center gap-1"
                            >
                              <Printer className="h-3.5 w-3.5" /> Pass
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

              {/* Mandatory Confirmatory ABO/Rh Testing for Unverified / Discrepancy Donors */}
              {recordDonor.bloodGroupVerificationStatus !== 'verified' && (
                <div className="rounded-lg border-2 border-amber-300 bg-amber-50/80 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                      <FlaskConical className="h-4 w-4 text-amber-700" /> Mandatory Confirmatory ABO/Rh Test
                    </h4>
                    <span className="text-[10px] font-semibold text-amber-900 bg-amber-200 px-2 py-0.5 rounded border border-amber-300">
                      Intake Safety Protocol
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-snug">
                    This donor&apos;s blood group is <strong>{recordDonor.bloodGroupVerificationStatus === 'pending_verification' ? 'Pending Review (Discrepancy)' : 'Self-Reported'}</strong>.
                    Per National Blood Safety protocols, perform a confirmatory laboratory test before phlebotomy.
                  </p>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-xs font-semibold text-amber-950 block mb-1">Confirmed ABO/Rh *</label>
                      <select
                        value={triage.verifiedGroup || recordDonor.bloodGroup}
                        onChange={(e) => setTriage({ ...triage, verifiedGroup: e.target.value })}
                        className="w-full h-8 border border-amber-300 rounded px-2 text-xs bg-white font-bold text-red-700"
                      >
                        {BLOOD_GROUPS.map((bg) => (
                          <option key={bg} value={bg}>{bg}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-amber-950 block mb-1">Test Method *</label>
                      <select
                        value={triage.verificationMethod}
                        onChange={(e) => setTriage({ ...triage, verificationMethod: e.target.value })}
                        className="w-full h-8 border border-amber-300 rounded px-2 text-xs bg-white"
                      >
                        {VERIFICATION_METHODS.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

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
                  <div className="text-right">
                    <Badge className="bg-red-600 text-white font-bold text-sm px-2.5 py-0.5">
                      {selectedDonor.bloodGroupVerified || selectedDonor.bloodGroup}
                    </Badge>
                    <div className="text-[9px] font-medium text-muted-foreground mt-0.5">
                      {selectedDonor.bloodGroupVerificationStatus === 'verified' ? '✓ Lab-Verified' : 'Self-Reported'}
                    </div>
                  </div>
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

      {/* Laboratory Blood Group Verification Dialog */}
      <Dialog open={verifyModalOpen} onOpenChange={setVerifyModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-indigo-600" /> Laboratory Blood Group Verification
            </DialogTitle>
            <DialogDescription>
              Record confirmatory laboratory ABO/Rh grouping or review a donor&apos;s blood type correction request.
            </DialogDescription>
          </DialogHeader>

          {verifyDonor && (
            <form onSubmit={handleVerifySubmit} className="space-y-4 py-2">
              {/* Donor Summary Header */}
              <div className="rounded-lg border bg-muted/40 p-3 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-foreground">{verifyDonor.name}</h4>
                  <p className="text-xs text-muted-foreground">Tel: {verifyDonor.phone}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Current Status</div>
                  <Badge variant="outline" className="font-semibold text-xs mt-0.5">
                    {verifyDonor.bloodGroup} &bull; {verifyDonor.bloodGroupVerificationStatus || 'unverified'}
                  </Badge>
                </div>
              </div>

              {/* Pending Correction Alert */}
              {verifyDonor.correctionRequest && verifyDonor.bloodGroupVerificationStatus === 'pending_verification' && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-amber-900 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-amber-600" /> Pending Correction Request
                    </span>
                    <span className="text-[11px] font-mono">
                      Requested: <strong className="text-amber-950 font-bold">{verifyDonor.correctionRequest.requestedGroup}</strong>
                    </span>
                  </div>
                  <p className="text-amber-800 text-[11px] bg-white/70 p-2 rounded border border-amber-200">
                    &ldquo;{verifyDonor.correctionRequest.reason}&rdquo;
                  </p>
                  <div className="flex items-center gap-4 pt-1">
                    <label className="flex items-center gap-1.5 cursor-pointer font-medium text-amber-900">
                      <input
                        type="radio"
                        name="verifyAction"
                        checked={verifyForm.action === 'approve'}
                        onChange={() => setVerifyForm({ ...verifyForm, action: 'approve' })}
                        className="accent-emerald-600"
                      />
                      Approve &amp; Certify Lab Result
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer font-medium text-amber-900">
                      <input
                        type="radio"
                        name="verifyAction"
                        checked={verifyForm.action === 'reject'}
                        onChange={() => setVerifyForm({ ...verifyForm, action: 'reject' })}
                        className="accent-red-600"
                      />
                      Reject Request
                    </label>
                  </div>
                </div>
              )}

              {verifyForm.action === 'approve' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-foreground">Verified Blood Group *</label>
                      <select
                        value={verifyForm.verifiedGroup}
                        onChange={(e) => setVerifyForm({ ...verifyForm, verifiedGroup: e.target.value })}
                        className="w-full mt-1 border border-input rounded-md p-2 bg-background text-sm font-bold focus:ring-2 focus:ring-indigo-500"
                        required
                      >
                        {BLOOD_GROUPS.map((bg) => (
                          <option key={bg} value={bg}>{bg}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-foreground">Verification Method *</label>
                      <select
                        value={verifyForm.verificationMethod}
                        onChange={(e) => setVerifyForm({ ...verifyForm, verificationMethod: e.target.value })}
                        className="w-full mt-1 border border-input rounded-md p-2 bg-background text-xs focus:ring-2 focus:ring-indigo-500"
                        required
                      >
                        {VERIFICATION_METHODS.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-foreground">Laboratory Notes / Findings</label>
                    <textarea
                      value={verifyForm.notes}
                      onChange={(e) => setVerifyForm({ ...verifyForm, notes: e.target.value })}
                      rows={2}
                      placeholder="e.g. Forward and reverse typing concordant. Anti-D (4+) confirmed."
                      className="w-full mt-1 border border-input rounded-md p-2 bg-background text-xs focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-foreground">Rejection Reason / Findings *</label>
                  <textarea
                    value={verifyForm.notes}
                    onChange={(e) => setVerifyForm({ ...verifyForm, notes: e.target.value })}
                    rows={3}
                    placeholder="e.g. Laboratory re-test confirmed original blood group A+. Correction request rejected."
                    className="w-full mt-1 border border-input rounded-md p-2 bg-background text-xs focus:ring-2 focus:ring-red-500"
                    required
                  />
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-[11px] text-blue-900 space-y-1">
                <p className="font-semibold flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-600" /> Clinical Quality &amp; Transfusion Safety
                </p>
                <p className="text-blue-800">
                  Only lab-verified donors are matched for emergency SOS notifications and direct clinical crossmatching. Verification cryptographically signs the donor&apos;s digital pass.
                </p>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setVerifyModalOpen(false)}
                  disabled={verifyingBlood}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={verifyingBlood}
                  className={verifyForm.action === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}
                >
                  {verifyingBlood
                    ? 'Submitting…'
                    : verifyForm.action === 'reject'
                    ? 'Reject Correction Request'
                    : 'Certify & Sign Blood Group'}
                </Button>
              </DialogFooter>
            </form>
          )}
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
                    {verifiedDonor.ninMasked && (
                      <p className="text-[11px] text-muted-foreground font-mono">{verifiedDonor.ninMasked}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <Badge className="bg-red-100 text-red-800 text-base font-bold px-3 py-1">
                      {verifiedDonor.bloodGroup}
                    </Badge>
                  </div>
                </div>

                {/* Blood Group Verification Status Banner */}
                {verifiedDonor.bloodGroupVerificationStatus === 'verified' ? (
                  <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-2.5 text-xs text-emerald-900 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>
                      <strong>Lab-Verified Blood Type ({verifiedDonor.bloodGroup})</strong> — Confirmed by hospital laboratory testing.
                    </span>
                  </div>
                ) : (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 text-xs text-amber-900 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-800">
                      <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                      <span>WARNING: Self-Reported / Unverified Blood Group</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Donor reported <strong>{verifiedDonor.bloodGroup}</strong>. Mandatory confirmatory tube agglutination typing must be conducted prior to phlebotomy collection or clinical allocation.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Eligibility:</span>
                  {getEligibilityBadge(verifiedDonor.eligibilityStatus)}
                </div>

                {verifiedDonor.deferralReason && (
                  <div className="text-xs text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">
                    <strong className="font-semibold">Clinical Deferral:</strong> {verifiedDonor.deferralReason}
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