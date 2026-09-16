"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import apiClient from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "react-hot-toast";
import { Droplet, Wind, ArrowRightLeft } from "lucide-react";

interface Hospital {
  _id: string;
  name: string;
  address: string;
  contactPhone: string;
}

interface InventoryItem {
  hospitalId: Hospital;
  bloodGroup: string;
  units: number;
}

interface ResourceRequest {
  _id: string;
  requestingHospitalId: Hospital;
  supplyingHospitalId: Hospital;
  resourceType: "blood" | "oxygen";
  bloodGroup?: string;
  units: number;
  status: "pending" | "approved" | "declined" | "completed" | "cancelled";
  requestedAt: string;
  respondedAt?: string;
  completedAt?: string;
  notes?: string;
}

export default function ResourceRequestsPage() {
  const [incomingRequests, setIncomingRequests] = useState<ResourceRequest[]>(
    [],
  );
  const [outgoingRequests, setOutgoingRequests] = useState<ResourceRequest[]>(
    [],
  );
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    requestingHospitalId: "", // superadmin only (others use their own hospital)
    supplyingHospitalId: "",
    resourceType: "blood" as "blood" | "oxygen",
    bloodGroup: "",
    units: "1", // string so it can be cleared/retyped on mobile
    notes: "",
  });
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const router = useRouter();
  const { user } = useAuth();
  const isSuper = user?.role === "superadmin";

  // Client-side status + date filtering of the loaded request lists.
  const applyFilters = (list: ResourceRequest[]) =>
    list.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (fromDate && new Date(r.requestedAt) < new Date(fromDate)) return false;
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        if (new Date(r.requestedAt) > end) return false;
      }
      return true;
    });

  // Fetch all data
 const fetchData = async () => {
  try {
    const [incomingRes, outgoingRes, hospitalsRes, inventoryRes] =
      await Promise.all([
        apiClient.get("/resource-requests/incoming"),
        apiClient.get("/resource-requests/outgoing"),
        apiClient.get("/hospitals"),
        apiClient.get("/inventory/blood"),
      ]);
    setIncomingRequests(incomingRes.data);
    setOutgoingRequests(outgoingRes.data);
    setHospitals(hospitalsRes.data);
    setInventory(inventoryRes.data);
  } catch (err) {
    console.error(err);
    toast.error("Failed to load data");
  } finally {
    setLoading(false);
  }
};
  useEffect(() => {
    // Check if hospital admin is logged in (token must exist)
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetchData();
  }, [router]);

  // Helper to get available supply options (hospitals that have the selected resource)
  // Helper to get available supply options (hospitals that have the selected resource)
  const getAvailableSuppliers = () => {
    if (formData.resourceType === "blood" && formData.bloodGroup) {
      const supplierIds = inventory
        .filter(
          (item) =>
            item.hospitalId && // guard: a deleted hospital leaves a null ref
            item.bloodGroup === formData.bloodGroup &&
            item.units > 0,
        )
        .map((item) =>
          typeof item.hospitalId === "string"
            ? item.hospitalId
            : item.hospitalId._id,
        );
      return hospitals.filter((h) => supplierIds.includes(h._id));
    }
    // For oxygen, return all hospitals
    return hospitals;
  };
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const units = parseInt(formData.units, 10);
    if (!units || units < 1) {
      toast.error("Enter how many units you need (1 or more).");
      return;
    }
    if (formData.resourceType === "blood" && !formData.bloodGroup) {
      toast.error("Select a blood group.");
      return;
    }
    if (isSuper && !formData.requestingHospitalId) {
      toast.error("Select which hospital is requesting.");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post("/resource-requests", {
        requestingHospitalId: isSuper ? formData.requestingHospitalId : undefined,
        supplyingHospitalId: formData.supplyingHospitalId,
        resourceType: formData.resourceType,
        bloodGroup:
          formData.resourceType === "blood" ? formData.bloodGroup : undefined,
        units,
        notes: formData.notes || undefined,
      });
      toast.success("Request sent");
      setDialogOpen(false);
      setFormData({
        requestingHospitalId: "",
        supplyingHospitalId: "",
        resourceType: "blood",
        bloodGroup: "",
        units: "1",
        notes: "",
      });
      fetchData(); // refresh lists
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to create request");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespond = async (
    requestId: string,
    status: "approved" | "declined",
  ) => {
    try {
      await apiClient.put(`/resource-requests/${requestId}/respond`, { status });
      toast.success(`Request ${status}`);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to respond");
    }
  };

  const handleComplete = async (requestId: string) => {
    try {
      await apiClient.put(`/resource-requests/${requestId}/complete`, {});
      toast.success("Request marked as completed");
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to complete");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
            Pending
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800">
            Approved
          </Badge>
        );
      case "declined":
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800">
            Declined
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800">
            Completed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="capitalize">
            {status}
          </Badge>
        );
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  // Filter suppliers based on current selection, excluding your own hospital
  // (you request from OTHER hospitals, not yourself).
  const availableSuppliers = getAvailableSuppliers();
  // Exclude the requesting hospital (your own, or the one superadmin picked) —
  // you can't request from yourself.
  const excludeId = isSuper ? formData.requestingHospitalId : user?.hospitalId;
  const uniqueSuppliers = Array.from(
    new Map(availableSuppliers.map((h) => [h._id, h])).values(),
  ).filter((h) => h._id !== excludeId);

  const filteredIncoming = applyFilters(incomingRequests);
  const filteredOutgoing = applyFilters(outgoingRequests);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resource Requests"
        subtitle="Request blood or oxygen from other hospitals"
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            New Request
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 border border-input rounded-lg px-3 text-sm bg-card"
        >
          <option value="">Any status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <div className="inline-flex items-center gap-1 border border-input rounded-lg px-2 py-1 bg-card">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="text-xs bg-transparent focus:outline-hidden"
              aria-label="Filter from date"
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
              aria-label="Filter to date"
            />
          </div>
        </div>
        {(statusFilter || fromDate || toDate) && (
          <Button variant="ghost" size="sm" className="text-muted-foreground"
            onClick={() => { setStatusFilter(""); setFromDate(""); setToDate(""); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Incoming Requests (network-wide for superadmin) */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">
          {isSuper ? "All Resource Requests (network)" : "Incoming Requests"}
        </h2>
        {filteredIncoming.length === 0 ? (
          <p className="text-muted-foreground">
            {isSuper ? "No resource requests yet." : "No incoming requests."}
          </p>
        ) : (
          <div className="bg-card rounded shadow overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requesting Hospital</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIncoming.map((req) => (
                  <TableRow key={req._id}>
                    <TableCell>
                      {req.requestingHospitalId?.name || "—"}
                      {isSuper && req.supplyingHospitalId?.name && (
                        <div className="text-xs text-muted-foreground">
                          → {req.supplyingHospitalId.name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {req.resourceType === "blood" ? (
                        <span className="flex items-center gap-1">
                          <Droplet className="h-4 w-4 text-red-500" />{" "}
                          {req.bloodGroup}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Wind className="h-4 w-4 text-blue-500" /> Oxygen
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{req.units}</TableCell>
                    <TableCell>{getStatusBadge(req.status)}</TableCell>
                    <TableCell className="max-w-[220px]">
                      {req.notes ? (
                        <span className="text-sm text-foreground whitespace-pre-wrap break-words">{req.notes}</span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(req.requestedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {req.status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleRespond(req._id, "approved")}
                            variant="default"
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleRespond(req._id, "declined")}
                            variant="destructive"
                          >
                            Decline
                          </Button>
                        </div>
                      )}
                      {/* Superadmin oversees the whole flow from this table, so
                          they can also mark an approved request received. */}
                      {isSuper && req.status === "approved" && (
                        <Button
                          size="sm"
                          onClick={() => handleComplete(req._id)}
                          variant="outline"
                          className="border-green-600 text-green-600"
                        >
                          Mark Received
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Outgoing Requests — superadmin acts from the network table above */}
      <div hidden={isSuper}>
        <h2 className="text-xl font-semibold mb-4">Outgoing Requests</h2>
        {filteredOutgoing.length === 0 ? (
          <p className="text-muted-foreground">No outgoing requests.</p>
        ) : (
          <div className="bg-card rounded shadow overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplying Hospital</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOutgoing.map((req) => (
                  <TableRow key={req._id}>
                    <TableCell>{req.supplyingHospitalId?.name}</TableCell>
                    <TableCell>
                      {req.resourceType === "blood" ? (
                        <span className="flex items-center gap-1">
                          <Droplet className="h-4 w-4 text-red-500" />{" "}
                          {req.bloodGroup}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Wind className="h-4 w-4 text-blue-500" /> Oxygen
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{req.units}</TableCell>
                    <TableCell>{getStatusBadge(req.status)}</TableCell>
                    <TableCell className="max-w-[220px]">
                      {req.notes ? (
                        <span className="text-sm text-foreground whitespace-pre-wrap break-words">{req.notes}</span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(req.requestedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {req.status === "approved" && (
                        <Button
                          size="sm"
                          onClick={() => handleComplete(req._id)}
                          variant="outline"
                          className="border-green-600 text-green-600"
                        >
                          Mark Received
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>Request Blood / Oxygen</DialogTitle>
            <DialogDescription>
              Request a resource from another hospital. The supplying hospital
              will be notified.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateRequest}>
            <div className="space-y-4 py-4">
              {isSuper && (
                <div className="space-y-2">
                  <Label>Requesting Hospital</Label>
                  <Select
                    value={formData.requestingHospitalId}
                    onValueChange={(val) =>
                      setFormData({ ...formData, requestingHospitalId: val ?? "", supplyingHospitalId: "" })
                    }
                    items={hospitals.map((h) => ({ label: h.name, value: h._id }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select requesting hospital" />
                    </SelectTrigger>
                    <SelectContent>
                      {hospitals.map((h) => (
                        <SelectItem key={h._id} value={h._id}>
                          {h.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Resource Type</Label>
                <Select
                  value={formData.resourceType}
                  onValueChange={(val) =>
                    setFormData({
                      ...formData,
                      resourceType: (val ?? "blood") as "blood" | "oxygen",
                      bloodGroup: "",
                    })
                  }
                  items={[
                    { label: "Blood", value: "blood" },
                    { label: "Oxygen", value: "oxygen" },
                  ]}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blood">Blood</SelectItem>
                    <SelectItem value="oxygen">Oxygen</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.resourceType === "blood" && (
                <div className="space-y-2">
                  <Label>Blood Group</Label>
                  <Select
                    value={formData.bloodGroup}
                    onValueChange={(val) =>
                      setFormData({ ...formData, bloodGroup: val ?? "" })
                    }
                    items={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                      (bg) => ({ label: bg, value: bg }),
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select blood group" />
                    </SelectTrigger>
                    <SelectContent>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                        (bg) => (
                          <SelectItem key={bg} value={bg}>
                            {bg}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Supplying Hospital</Label>
                <Select
                  value={formData.supplyingHospitalId}
                  onValueChange={(val) =>
                    setFormData({ ...formData, supplyingHospitalId: val ?? "" })
                  }
                  items={uniqueSuppliers.map((h) => ({ label: h.name, value: h._id }))}
                  disabled={
                    formData.resourceType === "blood" && !formData.bloodGroup
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select hospital" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueSuppliers.map((h) => (
                      <SelectItem key={h._id} value={h._id}>
                        {h.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.resourceType === "blood" && !formData.bloodGroup && (
                  <p className="text-xs text-muted-foreground">
                    Select blood group first
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Units</Label>
                <Input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={formData.units}
                  onChange={(e) =>
                    // Keep the raw string so the field can be cleared/retyped on
                    // mobile; it's coerced to a number on submit.
                    setFormData({ ...formData, units: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Input
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="Any special instructions"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!formData.supplyingHospitalId || submitting}
              >
                {submitting ? "Sending…" : "Send Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
