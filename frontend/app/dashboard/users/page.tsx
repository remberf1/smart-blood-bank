'use client';
import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Plus, ShieldAlert } from 'lucide-react';

interface Hospital { _id: string; name: string }
interface User {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'superadmin' | 'staff';
  hospitalId: Hospital | null;
  isActive: boolean;
}

const ROLES = ['staff', 'admin', 'superadmin'] as const;
const emptyForm = { name: '', email: '', password: '', role: 'admin' as User['role'], hospitalId: '' };

export default function UsersPage() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';

  const [users, setUsers] = useState<User[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchData = async () => {
    try {
      const [u, h] = await Promise.all([apiClient.get('/auth/users'), apiClient.get('/hospitals')]);
      setUsers(u.data);
      setHospitals(h.data);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperadmin) fetchData();
    else setLoading(false);
  }, [isSuperadmin]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, hospitalId: u.hospitalId?._id || '' });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.role !== 'superadmin' && !form.hospitalId) {
      toast.error('Select a hospital for this role');
      return;
    }
    try {
      if (editing) {
        await apiClient.put(`/auth/users/${editing._id}`, {
          role: form.role,
          hospitalId: form.role === 'superadmin' ? '' : form.hospitalId,
        });
        toast.success('User updated');
      } else {
        await apiClient.post('/auth/register', {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          hospitalId: form.role === 'superadmin' ? undefined : form.hospitalId,
        });
        toast.success('User created');
      }
      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.details?.[0]?.message || 'Operation failed');
    }
  };

  const toggleActive = async (u: User) => {
    try {
      await apiClient.put(`/auth/users/${u._id}`, { isActive: !u.isActive });
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isSuperadmin) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center gap-3 text-muted-foreground">
          <ShieldAlert className="h-5 w-5 text-amber-500" />
          Only a super admin can manage users.
        </CardContent>
      </Card>
    );
  }

  const roleColor = (r: string) =>
    r === 'superadmin' ? 'bg-purple-100 text-purple-700' : r === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-foreground';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Create and assign hospital admins & staff"
        action={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add User</Button>}
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Hospital</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u._id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge className={roleColor(u.role)}>{u.role}</Badge>
                  </TableCell>
                  <TableCell>{u.hospitalId?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <Badge className={u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(u)}>Edit</Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive(u)}
                      disabled={u._id === user?.id}
                    >
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add User'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              {!editing && (
                <>
                  <div>
                    <Label>Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
                    <p className="text-xs text-muted-foreground mt-1">At least 8 characters.</p>
                  </div>
                </>
              )}
              <div>
                <Label>Role</Label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as User['role'] })}
                  className="w-full border border-input rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-muted disabled:text-muted-foreground"
                  disabled={!!editing && editing._id === user?.id}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {!!editing && editing._id === user?.id && (
                  <p className="text-xs text-muted-foreground mt-1">You can&apos;t change your own role.</p>
                )}
              </div>
              {form.role !== 'superadmin' && (
                <div>
                  <Label>Hospital</Label>
                  <select
                    value={form.hospitalId}
                    onChange={(e) => setForm({ ...form, hospitalId: e.target.value })}
                    className="w-full border border-input rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                    required
                  >
                    <option value="">Select hospital</option>
                    {hospitals.map((h) => (
                      <option key={h._id} value={h._id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{editing ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
