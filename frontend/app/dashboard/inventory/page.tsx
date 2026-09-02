"use client";
import { useEffect, useState } from "react";
import apiClient from "../../api/client";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Droplet, Wind } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "@/components/ui/page-header";

interface Hospital {
  _id: string;
  name: string;
  address: string;
  contactPhone: string;
}

interface BloodInventoryItem {
  _id: string;
  hospitalId: Hospital;
  bloodGroup: string;
  units: number;
  lastUpdatedAt: string;
}

interface OxygenInventoryItem {
  _id: string;
  hospitalId: Hospital;
  oxygenCylinderCount: number;
  oxygenFillStatus: "full" | "partial" | "empty";
  lastUpdatedAt: string;
}

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function InventoryPage() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";
  const ownHospitalId = user?.hospitalId || "";

  // Blood state
  const [bloodInventory, setBloodInventory] = useState<BloodInventoryItem[]>(
    [],
  );
  const [oxygenInventory, setOxygenInventory] = useState<OxygenInventoryItem[]>(
    [],
  );
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"blood" | "oxygen">("blood");

  // Dialogs
  const [bloodDialogOpen, setBloodDialogOpen] = useState(false);
  const [oxygenDialogOpen, setOxygenDialogOpen] = useState(false);
  const [editingBlood, setEditingBlood] = useState<BloodInventoryItem | null>(
    null,
  );
  const [editingOxygen, setEditingOxygen] =
    useState<OxygenInventoryItem | null>(null);

  // Form data
  const [bloodForm, setBloodForm] = useState({
    hospitalId: "",
    bloodGroup: "O+",
    units: 0,
  });
  const [oxygenForm, setOxygenForm] = useState({
    hospitalId: "",
    oxygenCylinderCount: 0,
    oxygenFillStatus: "empty" as "full" | "partial" | "empty",
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const [bloodRes, oxygenRes, hospitalsRes] = await Promise.all([
        apiClient.get("/inventory/blood"),
        apiClient.get("/inventory/oxygen"),
        apiClient.get("/hospitals"),
      ]);
      setBloodInventory(bloodRes.data);
      setOxygenInventory(oxygenRes.data);
      setHospitals(hospitalsRes.data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  };

  // Blood handlers
  const handleBloodSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBlood) {
        await apiClient.put(`/inventory/blood/${editingBlood._id}`, {
          units: bloodForm.units,
        });
        toast.success("Blood inventory updated");
      } else {
        await apiClient.post("/inventory", {
          hospitalId: bloodForm.hospitalId,
          resourceType: "blood",
          bloodGroup: bloodForm.bloodGroup,
          units: bloodForm.units,
        });
        toast.success("Blood added");
      }
      setBloodDialogOpen(false);
      resetBloodForm();
      fetchAllData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Operation failed");
    }
  };

  const handleEditBlood = (item: BloodInventoryItem) => {
    setEditingBlood(item);
    setBloodForm({
      hospitalId: item.hospitalId._id,
      bloodGroup: item.bloodGroup,
      units: item.units,
    });
    setBloodDialogOpen(true);
  };

  const handleDeleteBlood = async (id: string) => {
    if (confirm("Delete this blood inventory?")) {
      try {
        await apiClient.delete(`/inventory/${id}`);
        toast.success("Deleted");
        fetchAllData();
      } catch (err: any) {
        toast.error(err.response?.data?.error || "Delete failed");
      }
    }
  };

  // Oxygen handlers
  const handleOxygenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingOxygen) {
        await apiClient.put(`/inventory/oxygen/${editingOxygen._id}`, {
          oxygenCylinderCount: oxygenForm.oxygenCylinderCount,
          oxygenFillStatus: oxygenForm.oxygenFillStatus,
        });
        toast.success("Oxygen inventory updated");
      } else {
        await apiClient.post("/inventory", {
          hospitalId: oxygenForm.hospitalId,
          resourceType: "oxygen",
          oxygenCylinderCount: oxygenForm.oxygenCylinderCount,
          oxygenFillStatus: oxygenForm.oxygenFillStatus,
        });
        toast.success("Oxygen added");
      }
      setOxygenDialogOpen(false);
      resetOxygenForm();
      fetchAllData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Operation failed");
    }
  };

  const handleEditOxygen = (item: OxygenInventoryItem) => {
    setEditingOxygen(item);
    setOxygenForm({
      hospitalId: item.hospitalId._id,
      oxygenCylinderCount: item.oxygenCylinderCount,
      oxygenFillStatus: item.oxygenFillStatus,
    });
    setOxygenDialogOpen(true);
  };

  const handleDeleteOxygen = async (id: string) => {
    if (confirm("Delete this oxygen inventory?")) {
      try {
        await apiClient.delete(`/inventory/${id}`);
        toast.success("Deleted");
        fetchAllData();
      } catch (err: any) {
        toast.error(err.response?.data?.error || "Delete failed");
      }
    }
  };

  const resetBloodForm = () => {
    setEditingBlood(null);
    // Non-superadmins can only add to their own hospital; default it in.
    setBloodForm({ hospitalId: isSuperadmin ? "" : ownHospitalId, bloodGroup: "O+", units: 0 });
  };

  const resetOxygenForm = () => {
    setEditingOxygen(null);
    setOxygenForm({
      hospitalId: isSuperadmin ? "" : ownHospitalId,
      oxygenCylinderCount: 0,
      oxygenFillStatus: "empty",
    });
  };

  const totalBloodUnits = bloodInventory.reduce(
    (sum, item) => sum + item.units,
    0,
  );
  const uniqueBloodTypes = new Set(bloodInventory.map((i) => i.bloodGroup))
    .size;
  const lowStockBlood = bloodInventory.filter(
    (i) => i.units > 0 && i.units < 10,
  ).length;
  const totalOxygenCylinders = oxygenInventory.reduce(
    (sum, item) => sum + item.oxygenCylinderCount,
    0,
  );

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" subtitle="Blood and oxygen stock across hospitals" />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Hospitals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hospitals.length}</div>
          </CardContent>
        </Card>
        {activeTab === "blood" ? (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Blood Types Available
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{uniqueBloodTypes} / 8</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Units
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalBloodUnits}</div>
              </CardContent>
            </Card>
            <Card className="bg-yellow-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-yellow-700">
                  Low Stock Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-700">
                  {lowStockBlood}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Cylinders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalOxygenCylinders}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Hospitals with Oxygen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {oxygenInventory.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Fill Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  Full:{" "}
                  {
                    oxygenInventory.filter((i) => i.oxygenFillStatus === "full")
                      .length
                  }
                </div>
                <div className="text-sm">
                  Partial:{" "}
                  {
                    oxygenInventory.filter(
                      (i) => i.oxygenFillStatus === "partial",
                    ).length
                  }
                </div>
                <div className="text-sm">
                  Empty:{" "}
                  {
                    oxygenInventory.filter(
                      (i) => i.oxygenFillStatus === "empty",
                    ).length
                  }
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={activeTab === "blood" ? "default" : "outline"}
          onClick={() => setActiveTab("blood")}
          className="flex items-center gap-2"
        >
          <Droplet className="h-4 w-4" /> Blood
        </Button>
        <Button
          variant={activeTab === "oxygen" ? "default" : "outline"}
          onClick={() => setActiveTab("oxygen")}
          className="flex items-center gap-2"
        >
          <Wind className="h-4 w-4" /> Oxygen
        </Button>
      </div>

      {/* Blood Inventory Section */}
      {activeTab === "blood" && (
        <>
          <div className="flex justify-end mb-4">
            <Button
              onClick={() => {
                resetBloodForm();
                setBloodDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Add Blood
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hospital</TableHead>
                    <TableHead>Blood Group</TableHead>
                    <TableHead>Units</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bloodInventory.map((item) => {
                    const status =
                      item.units === 0
                        ? "Out of Stock"
                        : item.units < 5
                          ? "Low Stock"
                          : item.units < 10
                            ? "Limited"
                            : "Available";
                    const badgeClass =
                      item.units === 0
                        ? "bg-red-100 text-red-800"
                        : item.units < 5
                          ? "bg-yellow-100 text-yellow-800"
                          : item.units < 10
                            ? "bg-blue-100 text-blue-800"
                            : "bg-green-100 text-green-800";
                    return (
                      <TableRow key={item._id}>
                        <TableCell>{item.hospitalId?.name}</TableCell>
                        <TableCell>{item.bloodGroup}</TableCell>
                        <TableCell>{item.units}</TableCell>
                        <TableCell>
                          <Badge className={badgeClass}>
                            {status} ({item.units})
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(item.lastUpdatedAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditBlood(item)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteBlood(item._id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {bloodInventory.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No blood inventory found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Oxygen Inventory Section */}
      {activeTab === "oxygen" && (
        <>
          <div className="flex justify-end mb-4">
            <Button
              onClick={() => {
                resetOxygenForm();
                setOxygenDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Add Oxygen
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hospital</TableHead>
                    <TableHead>Cylinders</TableHead>
                    <TableHead>Fill Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {oxygenInventory.map((item) => {
                    const fillBadge =
                      item.oxygenFillStatus === "full"
                        ? "bg-green-100 text-green-800"
                        : item.oxygenFillStatus === "partial"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800";
                    return (
                      <TableRow key={item._id}>
                        <TableCell>{item.hospitalId?.name}</TableCell>
                        <TableCell>{item.oxygenCylinderCount}</TableCell>
                        <TableCell>
                          <Badge className={fillBadge}>
                            {item.oxygenFillStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(item.lastUpdatedAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditOxygen(item)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteOxygen(item._id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {oxygenInventory.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No oxygen inventory found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Blood Dialog */}
      <Dialog open={bloodDialogOpen} onOpenChange={setBloodDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBlood ? "Edit Blood" : "Add Blood"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBloodSubmit}>
            <div className="space-y-4">
              <div>
                <Label>Hospital</Label>
                <select
                  value={bloodForm.hospitalId}
                  onChange={(e) =>
                    setBloodForm({ ...bloodForm, hospitalId: e.target.value })
                  }
                  className="w-full border border-input rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-muted disabled:text-muted-foreground"
                  disabled={!!editingBlood || !isSuperadmin}
                  required
                >
                  <option value="">Select hospital</option>
                  {hospitals.map((h) => (
                    <option key={h._id} value={h._id}>
                      {h.name}
                    </option>
                  ))}
                </select>
                {!isSuperadmin && (
                  <p className="text-xs text-muted-foreground mt-1">
                    You can only add stock to your own hospital.
                  </p>
                )}
              </div>
              <div>
                <Label>Blood Group</Label>
                <select
                  value={bloodForm.bloodGroup}
                  onChange={(e) =>
                    setBloodForm({ ...bloodForm, bloodGroup: e.target.value })
                  }
                  className="w-full border border-input rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  disabled={!!editingBlood}
                  required
                >
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg} value={bg}>
                      {bg}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Units</Label>
                <Input
                  type="number"
                  value={bloodForm.units}
                  onChange={(e) =>
                    setBloodForm({
                      ...bloodForm,
                      units: parseInt(e.target.value) || 0,
                    })
                  }
                  required
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button
                variant="outline"
                onClick={() => setBloodDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">{editingBlood ? "Update" : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Oxygen Dialog */}
      <Dialog open={oxygenDialogOpen} onOpenChange={setOxygenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingOxygen ? "Edit Oxygen" : "Add Oxygen"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleOxygenSubmit}>
            <div className="space-y-4">
              <div>
                <Label>Hospital</Label>
                <select
                  value={oxygenForm.hospitalId}
                  onChange={(e) =>
                    setOxygenForm({ ...oxygenForm, hospitalId: e.target.value })
                  }
                  className="w-full border border-input rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-muted disabled:text-muted-foreground"
                  disabled={!!editingOxygen || !isSuperadmin}
                  required
                >
                  <option value="">Select hospital</option>
                  {hospitals.map((h) => (
                    <option key={h._id} value={h._id}>
                      {h.name}
                    </option>
                  ))}
                </select>
                {!isSuperadmin && (
                  <p className="text-xs text-muted-foreground mt-1">
                    You can only add stock to your own hospital.
                  </p>
                )}
              </div>
              <div>
                <Label>Cylinder Count</Label>
                <Input
                  type="number"
                  value={oxygenForm.oxygenCylinderCount}
                  onChange={(e) =>
                    setOxygenForm({
                      ...oxygenForm,
                      oxygenCylinderCount: parseInt(e.target.value) || 0,
                    })
                  }
                  required
                />
              </div>
              <div>
                <Label>Fill Status</Label>
                <select
                  value={oxygenForm.oxygenFillStatus}
                  onChange={(e) =>
                    setOxygenForm({
                      ...oxygenForm,
                      oxygenFillStatus: e.target.value as
                        | "full"
                        | "partial"
                        | "empty",
                    })
                  }
                  className="w-full border border-input rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="full">Full</option>
                  <option value="partial">Partial</option>
                  <option value="empty">Empty</option>
                </select>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button
                variant="outline"
                onClick={() => setOxygenDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">{editingOxygen ? "Update" : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
