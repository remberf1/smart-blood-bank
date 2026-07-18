'use client';
import { useEffect, useState } from 'react';
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
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, Edit, Trash2, MapPin, Phone } from 'lucide-react';

interface Hospital {
  _id: string;
  name: string;
  address: string;
  contactPhone: string;
  createdAt: string;
}

export default function HospitalsPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingHospital, setEditingHospital] = useState<Hospital | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [hospitalToDelete, setHospitalToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    contactPhone: '',
    location: {
      type: 'Point',
      coordinates: [4.5667, 7.7667]
    }
  });

  useEffect(() => {
    fetchHospitals();
  }, []);

  const fetchHospitals = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/hospitals');
      setHospitals(response.data);
    } catch (error) {
      console.error('Error fetching hospitals:', error);
      toast.error('Failed to load hospitals');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const handleDelete = async () => {
    if (!hospitalToDelete) return;
    try {
      await apiClient.delete(`/hospitals/${hospitalToDelete}`);
      toast.success('Hospital deleted successfully');
      fetchHospitals();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Delete failed');
    } finally {
      setDeleteDialogOpen(false);
      setHospitalToDelete(null);
    }
  };

  const openDeleteDialog = (id: string) => {
    setHospitalToDelete(id);
    setDeleteDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingHospital(null);
    setFormData({ name: '', address: '', contactPhone: '', location: { type: 'Point', coordinates: [4.5667, 7.7667] } });
    setDialogOpen(true);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Hospitals</h1>
          <p className="text-gray-500 text-sm mt-1">Manage registered healthcare facilities</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-gray-500">Total Hospitals</p>
            <p className="text-2xl font-bold text-primary">{hospitals.length}</p>
          </div>
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Hospital
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total Hospitals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hospitals.length}</div>
            <p className="text-xs text-gray-400 mt-1">Registered facilities</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Recently Added</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {hospitals.filter(h => new Date(h.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length}
            </div>
            <p className="text-xs text-gray-400 mt-1">Last 30 days</p>
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
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        Loading hospitals...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : hospitals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      <Building2 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      No hospitals found. Click "Add Hospital" to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  hospitals.map((hospital) => (
                    <TableRow key={hospital._id} className="hover:bg-gray-50">
                      <TableCell>
                        <div className="font-medium text-gray-800">{hospital.name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <MapPin className="h-3 w-3" />
                          {hospital.address}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3 text-gray-400" />
                          {hospital.contactPhone}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-gray-50">
                          {new Date(hospital.createdAt).toLocaleDateString()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(hospital)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(hospital._id)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
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
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  placeholder="e.g., 08012345678"
                  required
                />
              </div>
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this hospital? This will also delete all associated inventory records. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete}>
              Delete Hospital
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}