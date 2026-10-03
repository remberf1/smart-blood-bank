'use client';
import { useEffect, useState, useCallback } from 'react';
import apiClient from '../../api/client';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Building2, Plus, Edit, Power, PowerOff, MapPin, Phone, ShieldCheck, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';

interface Hospital {
  _id: string;
  name: string;
  address: string;
  contactPhone: string;
  isActive?: boolean;
  createdAt: string;
}

export default function HospitalsPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [recentlyAddedCount, setRecentlyAddedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingHospital, setEditingHospital] = useState<Hospital | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [hospitalToToggle, setHospitalToToggle] = useState<Hospital | null>(null);
  const [toggling, setToggling] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    contactPhone: '',
    location: {
      type: 'Point',
      coordinates: [4.5667, 7.7667]
    }
  });

  const fetchHospitals = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/hospitals');
      setHospitals(response.data);
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      setRecentlyAddedCount(
        response.data.filter((h: Hospital) => new Date(h.createdAt).getTime() > cutoff).length
      );
    } catch (error) {
      console.error('Error fetching hospitals:', error);
      toast.error('Failed to load hospitals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHospitals();
  }, [fetchHospitals]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = formData.contactPhone.replace(/[\s()+-]/g, '');
    if (!/^\d{10,14}$/.test(digits)) {
      toast.error('Enter a valid phone number — 10 to 14 digits, no letters.');
      return;
    }
    try {
      if (editingHospital) {
        await apiClient.put(`/hospitals/${editingHospital._id}`, formData);
        toast.success('Hospital updated successfully');
        setEditingHospital(null);
      } else {
        await apiClient.post('/hospitals', formData);
        toast.success('Hospital added successfully');
      }
      setFormData({ name: '', address: '', contactPhone: '', location: { type: 'Point', coordinates: [4.5667, 7.7667] } });
      setDialogOpen(false);
      fetchHospitals();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Operation failed');
    }
  };

  const handleEdit = (hospital: Hospital) => {
    setEditingHospital(hospital);
    setFormData({
      name: hospital.name,
      address: hospital.address,
      contactPhone: hospital.contactPhone,
      location: { type: 'Point', coordinates: [4.5667, 7.7667] }
    });
    setDialogOpen(true);
  };

  const handleToggleStatus = async () => {
    if (!hospitalToToggle) return;
    setToggling(true);
    try {
      const res = await apiClient.patch(`/hospitals/${hospitalToToggle._id}/toggle-active`);
      toast.success(res.data.message || 'Hospital status updated');
      fetchHospitals();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update hospital status');
    } finally {
      setToggling(false);
      setToggleDialogOpen(false);
      setHospitalToToggle(null);
    }
  };

  const openToggleDialog = (hospital: Hospital) => {
    setHospitalToToggle(hospital);
    setToggleDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingHospital(null);
    setFormData({ name: '', address: '', contactPhone: '', location: { type: 'Point', coordinates: [4.5667, 7.7667] } });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Hospitals"
        subtitle="Manage registered healthcare facilities"
        action={
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Hospital
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Hospitals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hospitals.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Registered facilities</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recently Added</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {recentlyAddedCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary">Active Facilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{hospitals.length}</div>
            <p className="text-xs text-primary/70 mt-1">All active</p>
          </CardContent>
        </Card>
      </div>

      {/* Hospitals Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hospital Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        Loading hospitals...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : hospitals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                      No hospitals found. Click &quot;Add Hospital&quot; to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  hospitals.map((hospital) => (
                    <TableRow key={hospital._id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="font-medium text-foreground">{hospital.name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {hospital.address}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {hospital.contactPhone}
                        </div>
                      </TableCell>
                      <TableCell>
                        {hospital.isActive !== false ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300">Deactivated</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-muted/50">
                          {new Date(hospital.createdAt).toLocaleDateString()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(hospital)}
                            className="h-8 w-8 p-0"
                            title="Edit Hospital Details"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openToggleDialog(hospital)}
                            className={`h-8 px-2 text-xs font-medium rounded-md ${
                              hospital.isActive !== false
                                ? 'text-amber-700 hover:text-amber-800 hover:bg-amber-50'
                                : 'text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50'
                            }`}
                            title={hospital.isActive !== false ? 'Deactivate Hospital Facility' : 'Reactivate Hospital Facility'}
                          >
                            {hospital.isActive !== false ? (
                              <span className="flex items-center gap-1"><PowerOff className="h-3.5 w-3.5" /> Deactivate</span>
                            ) : (
                              <span className="flex items-center gap-1"><Power className="h-3.5 w-3.5" /> Activate</span>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingHospital ? 'Edit Hospital' : 'Add New Hospital'}</DialogTitle>
            <DialogDescription>
              {editingHospital 
                ? 'Update the hospital information below.'
                : 'Enter the hospital details to add it to the system.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Hospital Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Lagos University Teaching Hospital"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Full address"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Contact Phone</Label>
                <Input
                  id="contactPhone"
                  type="tel"
                  inputMode="tel"
                  maxLength={17}
                  value={formData.contactPhone}
                  onChange={(e) =>
                    // Only allow phone characters (digits, +, space, dash, parens).
                    setFormData({ ...formData, contactPhone: e.target.value.replace(/[^\d+\s()-]/g, '') })
                  }
                  placeholder="e.g., 08012345678"
                  required
                />
                <p className="text-xs text-muted-foreground">10–14 digits, no letters.</p>
              </div>
              {editingHospital && (
                <p className="text-xs text-muted-foreground">
                  Reference: <span className="font-mono">{editingHospital._id.slice(-6).toUpperCase()}</span>
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingHospital ? 'Update' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate/Activate Confirmation Dialog */}
      <Dialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PowerOff className="h-5 w-5 text-amber-600" />
              {hospitalToToggle?.isActive !== false ? 'Deactivate Hospital Facility?' : 'Reactivate Hospital Facility?'}
            </DialogTitle>
            <DialogDescription className="pt-2 text-xs leading-relaxed">
              {hospitalToToggle?.isActive !== false
                ? `Deactivating ${hospitalToToggle?.name} will prevent new appointments, emergency SOS triage, and stock allocation to this facility. To maintain clinical compliance, all historical donor records, blood units, and audit logs remain permanently preserved.`
                : `Reactivating ${hospitalToToggle?.name} will restore its active status for donor appointments, blood bank inventory, and emergency requisitions.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setToggleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={toggling}
              className={hospitalToToggle?.isActive !== false ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
              onClick={handleToggleStatus}
            >
              {toggling ? 'Updating…' : hospitalToToggle?.isActive !== false ? 'Confirm Deactivation' : 'Confirm Reactivation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}