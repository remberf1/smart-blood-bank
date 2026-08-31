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
  AlertCircle
} from 'lucide-react';

interface Donor {
  _id: string;
  name: string;
  phone: string;
  email: string;
  bloodGroup: string;
  eligibilityStatus: string;
  lastDonationDate: string;
  createdAt: string;
}

const PAGE_SIZE = 20;

export default function DonorsPage() {
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ total: 0, eligible: 0, deferred: 0, bloodGroups: 0 });
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const fetchDonors = async (pageArg: number, search: string) => {
    setLoading(true);
    try {
      const response = await apiClient.get('/donors', {
        params: { page: pageArg, limit: PAGE_SIZE, search: search || undefined },
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

  // Fetch whenever the page or the (debounced) search changes.
  useEffect(() => {
    fetchDonors(page, debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch]);

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

  const getEligibilityBadge = (status: string) => {
    switch (status) {
      case 'eligible':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">Eligible</Badge>;
      case 'deferred':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Deferred</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-gray-100 text-gray-600">Pending</Badge>;
      default:
        return <Badge variant="destructive">{status}</Badge>;
    }
  };

  const getLastDonationStatus = (lastDonationDate: string | null) => {
    if (!lastDonationDate) {
      return { text: 'Never donated', icon: Clock, color: 'text-gray-400' };
    }
    const daysSince = Math.floor((Date.now() - new Date(lastDonationDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince < 90) {
      return { text: `${daysSince} days ago`, icon: AlertCircle, color: 'text-yellow-600' };
    }
    return { text: `${daysSince} days ago`, icon: CheckCircle, color: 'text-green-600' };
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Donors</h1>
          <p className="text-gray-500 text-sm mt-1">Manage registered blood donors</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-gray-500">Total Donors</p>
            <p className="text-2xl font-bold text-primary">{stats.total}</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total Donors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-gray-400 mt-1">Registered volunteers</p>
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
            <CardTitle className="text-sm font-medium text-gray-500">Blood Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.bloodGroups}</div>
            <p className="text-xs text-gray-400 mt-1">Types represented</p>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name, phone, or blood group..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
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
                  <TableHead>Blood Group</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Donation</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        Loading donors...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : donors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      {searchTerm ? 'No donors match your search.' : 'No donors registered yet.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  donors.map((donor) => {
                    const lastDonation = getLastDonationStatus(donor.lastDonationDate);
                    const LastDonationIcon = lastDonation.icon;
                    return (
                      <TableRow key={donor._id} className="hover:bg-gray-50">
                        <TableCell>
                          <div>
                            <div className="font-medium text-gray-800">{donor.name}</div>
                            {donor.email && (
                              <div className="flex items-center gap-1 text-xs text-gray-400">
                                <Mail className="h-3 w-3" />
                                {donor.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3 text-gray-400" />
                            {donor.phone}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            <Droplet className="h-3 w-3 mr-1" />
                            {donor.bloodGroup}
                          </Badge>
                        </TableCell>
                        <TableCell>{getEligibilityBadge(donor.eligibilityStatus)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <LastDonationIcon className={`h-3 w-3 ${lastDonation.color}`} />
                            <span className={`text-sm ${lastDonation.color}`}>
                              {lastDonation.text}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(donor.createdAt).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewQr(donor)}
                            className="h-8 px-3 text-primary hover:text-primary hover:bg-primary/10"
                          >
                            <QrCode className="h-4 w-4 mr-1" />
                            QR Code
                          </Button>
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
          <p className="text-sm text-gray-500">
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
                <div className="w-48 h-48 mx-auto bg-white p-4 rounded-lg border">
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