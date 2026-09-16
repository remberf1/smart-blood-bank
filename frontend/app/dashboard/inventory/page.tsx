"use client";
import { useEffect, useState, useCallback } from "react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const canManageStock = user?.role === "admin" || user?.role === "superadmin";

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

  // Blood table filters + pagination (the table can have a row per hospital ×
  // group, so it gets long — condense it).
  const [groupFilter, setGroupFilter] = useState("");
  const [hospitalFilter, setHospitalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // '', 'available', 'low', 'out'
  const [invSearch, setInvSearch] = useState(""); // hospital-name search
  const [invSort, setInvSort] = useState<{ key: "units" | "updated" | null; dir: "asc" | "desc" }>({ key: "updated", dir: "desc" });
  const toggleInvSort = (key: "units" | "updated") =>
    setInvSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  const [bloodPage, setBloodPage] = useState(1);
  const BLOOD_PER_PAGE = 10;
  const resetBloodPage = () => setBloodPage(1);

  const fetchAllData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

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
    const hId = (item.hospitalId as any)?._id || (typeof item.hospitalId === 'string' ? item.hospitalId : '');
    setBloodForm({
      hospitalId: hId,
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
    const hId = (item.hospitalId as any)?._id || (typeof item.hospitalId === 'string' ? item.hospitalId : '');
    setOxygenForm({
      hospitalId: hId,
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
  const validBloodInventory = bloodInventory.filter((i) => i.hospitalId != null);
  const validOxygenInventory = oxygenInventory.filter((i) => i.hospitalId != null);
  const totalOxygenCylinders = validOxygenInventory.reduce(
    (sum, item) => sum + item.oxygenCylinderCount,
    0,
  );

  // Availability per blood group across the (optionally hospital-filtered) rows —
  // shows at a glance which of the 8 groups are out/low, including groups with
  // no rows at all (which the table alone can't show).
  const overviewRows = hospitalFilter
    ? validBloodInventory.filter((i) => i.hospitalId?._id === hospitalFilter)
    : validBloodInventory;
  const groupTotals = BLOOD_GROUPS.map((bg) => ({
    bloodGroup: bg,
    units: overviewRows
      .filter((i) => i.bloodGroup === bg)
      .reduce((s, i) => s + i.units, 0),
  }));
  const stockLevel = (u: number) => (u === 0 ? "out" : u < 10 ? "low" : "ok");

  // Filtered + paginated detail rows.
  const filteredBlood = validBloodInventory
    .filter((i) => {
      if (groupFilter && i.bloodGroup !== groupFilter) return false;
      if (hospitalFilter && i.hospitalId?._id !== hospitalFilter) return false;
      if (invSearch && !(i.hospitalId?.name || "").toLowerCase().includes(invSearch.toLowerCase())) return false;
      if (statusFilter) {
        const lvl = i.units === 0 ? "out" : i.units < 10 ? "low" : "available";
        if (lvl !== statusFilter) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!invSort.key) return 0;
      const mul = invSort.dir === "asc" ? 1 : -1;
      if (invSort.key === "units") return (a.units - b.units) * mul;
      return (new Date(a.lastUpdatedAt).getTime() - new Date(b.lastUpdatedAt).getTime()) * mul;
    });
  const bloodTotalPages = Math.max(Math.ceil(filteredBlood.length / BLOOD_PER_PAGE), 1);
  const pagedBlood = filteredBlood.slice(
    (bloodPage - 1) * BLOOD_PER_PAGE,
    bloodPage * BLOOD_PER_PAGE,
  );

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" subtitle="Blood and oxygen stock across hospitals" />

      {!canManageStock && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900 flex items-center justify-between">
          <div>
            <span className="font-semibold">Staff Inventory Notice:</span> Blood units and batches update automatically as donations and hospital transfers are recorded. Direct manual stock overrides require administrator authorization.
          </div>
        </div>
      )}

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
          {/* Availability overview — all 8 groups, so out-of-stock groups are visible */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Availability by group{hospitalFilter ? " (selected hospital)" : " (all hospitals)"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {groupTotals.map((g) => {
                  const lvl = stockLevel(g.units);
                  const cls =
                    lvl === "out"
                      ? "bg-red-50 border-red-200 text-red-700"
                      : lvl === "low"
                        ? "bg-amber-50 border-amber-200 text-amber-700"
                        : "bg-emerald-50 border-emerald-200 text-emerald-700";
                  return (
                    <button
                      key={g.bloodGroup}
                      type="button"
                      onClick={() => { setGroupFilter(g.bloodGroup === groupFilter ? "" : g.bloodGroup); resetBloodPage(); }}
                      className={`rounded-lg border p-2 text-center transition-colors ${cls} ${groupFilter === g.bloodGroup ? "ring-2 ring-primary" : ""}`}
                      title={lvl === "out" ? "Unavailable" : `${g.units} units`}
                    >
                      <div className="text-sm font-bold">{g.bloodGroup}</div>
                      <div className="text-xs">{lvl === "out" ? "Out" : `${g.units}u`}</div>
                    </button>
                  );
                })}
              </div>
              {groupTotals.some((g) => g.units === 0) && (
                <p className="text-xs text-red-600 mt-3">
                  Unavailable: {groupTotals.filter((g) => g.units === 0).map((g) => g.bloodGroup).join(", ")}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Filters + Add */}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search hospital…"
              value={invSearch}
              onChange={(e) => { setInvSearch(e.target.value); resetBloodPage(); }}
              className="h-9 w-44"
            />
            <select
              value={groupFilter}
              onChange={(e) => { setGroupFilter(e.target.value); resetBloodPage(); }}
              className="h-9 border border-input rounded-lg px-3 text-sm bg-card"
            >
              <option value="">All groups</option>
              {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
            </select>
            {isSuperadmin && (
              <select
                value={hospitalFilter}
                onChange={(e) => { setHospitalFilter(e.target.value); resetBloodPage(); }}
                className="h-9 border border-input rounded-lg px-3 text-sm bg-card max-w-[220px]"
              >
                <option value="">All hospitals</option>
                {hospitals.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            )}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); resetBloodPage(); }}
              className="h-9 border border-input rounded-lg px-3 text-sm bg-card"
            >
              <option value="">Any status</option>
              <option value="available">Available</option>
              <option value="low">Low (&lt;10)</option>
              <option value="out">Out of stock</option>
            </select>
            {(groupFilter || hospitalFilter || statusFilter || invSearch) && (
              <Button variant="ghost" size="sm" className="text-muted-foreground"
                onClick={() => { setGroupFilter(""); setHospitalFilter(""); setStatusFilter(""); setInvSearch(""); resetBloodPage(); }}>
                Clear
              </Button>
            )}
            {canManageStock && (
              <div className="ml-auto">
                <Button
                  onClick={() => {
                    resetBloodForm();
                    setBloodDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Blood
                </Button>
              </div>
            )}
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hospital</TableHead>
                    <TableHead>Blood Group</TableHead>
                    <TableHead>
                      <button type="button" onClick={() => toggleInvSort("units")} className="inline-flex items-center gap-1 hover:text-foreground">
                        Units {invSort.key === "units" ? (invSort.dir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <button type="button" onClick={() => toggleInvSort("updated")} className="inline-flex items-center gap-1 hover:text-foreground">
                        Last Updated {invSort.key === "updated" ? (invSort.dir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedBlood.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No matching inventory.
                      </TableCell>
                    </TableRow>
                  )}
                  {pagedBlood.map((item) => {
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
                        <TableCell className="font-medium">{item.hospitalId?.name || "Unknown Hospital"}</TableCell>
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
                          {canManageStock ? (
                            <>
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
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
                              Auto-managed
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {filteredBlood.length > BLOOD_PER_PAGE && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {bloodPage} of {bloodTotalPages} · {filteredBlood.length} rows
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={bloodPage <= 1}
                  onClick={() => setBloodPage((p) => Math.max(p - 1, 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={bloodPage >= bloodTotalPages}
                  onClick={() => setBloodPage((p) => Math.min(p + 1, bloodTotalPages))}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Oxygen Inventory Section */}
      {activeTab === "oxygen" && (
        <>
          {canManageStock && (
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
          )}
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
                  {validOxygenInventory.map((item) => {
                    const fillBadge =
                      item.oxygenFillStatus === "full"
                        ? "bg-green-100 text-green-800"
                        : item.oxygenFillStatus === "partial"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800";
                    return (
                      <TableRow key={item._id}>
                        <TableCell className="font-medium">{item.hospitalId?.name || "Unknown Hospital"}</TableCell>
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
                          {canManageStock ? (
                            <>
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
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
                              Auto-managed
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {validOxygenInventory.length === 0 && (
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
