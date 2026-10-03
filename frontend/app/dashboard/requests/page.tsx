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
import {
  Droplet, Wind, ArrowRightLeft, Truck, PackageCheck, CheckCircle2, ShieldCheck, Thermometer, Clock,
} from "lucide-react";

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
  reservedUnits?: number;
  availableUnits?: number;
}

interface ResourceRequest {
  _id: string;
  requestingHospitalId: Hospital;
  supplyingHospitalId: Hospital;
  resourceType: "blood" | "oxygen";
  bloodGroup?: string;
  componentType?: string;
  units: number;
  status: "pending" | "approved" | "dispatched" | "completed" | "declined" | "cancelled";
  requestedAt: string;
  respondedAt?: string;
  dispatchedAt?: string;
  dispatchedBy?: { name: string; role: string };
  courierName?: string;
  trackingNumber?: string;
  coldBoxSealNumber?: string;
  dispatchNotes?: string;
  completedAt?: string;
  receivedBy?: { name: string; role: string };
  receivedNotes?: string;
  temperatureOnArrival?: number;
  intakeVerified?: boolean;
  notes?: string;
}

function SlaTimer({ requestedAt, slaMinutes = 60 }: { requestedAt: string; slaMinutes?: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => {
      const diffMs = Date.now() - new Date(requestedAt).getTime();
      setElapsed(Math.max(0, Math.floor(diffMs / 60000)));
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [requestedAt]);

  const remaining = slaMinutes - elapsed;
  const isOverdue = remaining <= 0;
  const isEscalation = remaining <= 15 && !isOverdue;

  return (
    <div className="inline-flex items-center gap-1 text-[11px] font-mono mt-0.5">
      {isOverdue ? (
        <span className="text-red-700 bg-red-100 border border-red-300 px-1.5 py-0.5 rounded font-bold animate-pulse">
          ⚠️ SLA Overdue (+{Math.abs(remaining)}m)
        </span>
      ) : isEscalation ? (
        <span className="text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded font-bold">
          ⏳ Escalating: {remaining}m left
        </span>
      ) : (
        <span className="text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
          ⏱️ SLA: {remaining}m left
        </span>
      )}
    </div>
  );
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

  // Pack & Dispatch Dialog state
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [selectedDispatchReq, setSelectedDispatchReq] = useState<ResourceRequest | null>(null);
  const [dispatchData, setDispatchData] = useState({
    courierName: "",
    coldBoxSealNumber: "",
    trackingNumber: "",
    notes: "",
  });

  // Confirm Receipt & Intake Dialog state
  const [intakeDialogOpen, setIntakeDialogOpen] = useState(false);
  const [selectedIntakeReq, setSelectedIntakeReq] = useState<ResourceRequest | null>(null);
  const [intakeData, setIntakeData] = useState({
    temperatureOnArrival: "4.0",
    sealIntact: true,
    notes: "",
  });

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
      if (status === "approved") {
        toast.success("Request approved! Units moved from Available to Reserved at supplying facility.");
      } else {
        toast.success("Request declined.");
      }
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to respond");
    }
  };

  const openDispatchModal = (req: ResourceRequest) => {
    setSelectedDispatchReq(req);
    setDispatchData({
      courierName: "MedEx Cold Chain Courier",
      coldBoxSealNumber: `SEAL-${Math.floor(10000 + Math.random() * 90000)}`,
      trackingNumber: `TRK-${Math.floor(1000 + Math.random() * 9000)}`,
      notes: "Packed in validated insulated cold box with ice packs (target 2°C - 6°C).",
    });
    setDispatchDialogOpen(true);
  };

  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispatchReq) return;
    setSubmitting(true);
    try {
      await apiClient.put(`/resource-requests/${selectedDispatchReq._id}/dispatch`, {
        courierName: dispatchData.courierName,
        coldBoxSealNumber: dispatchData.coldBoxSealNumber,
        trackingNumber: dispatchData.trackingNumber,
        notes: dispatchData.notes,
      });
      toast.success("Packed & Dispatched! Blood officially deducted from supplying hospital inventory ledger.");
      setDispatchDialogOpen(false);
      setSelectedDispatchReq(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to dispatch request");
    } finally {
      setSubmitting(false);
    }
  };

  const openIntakeModal = (req: ResourceRequest) => {
    setSelectedIntakeReq(req);
    setIntakeData({
      temperatureOnArrival: "4.2",
      sealIntact: true,
      notes: "Cold box seal inspected and concordant. Transferred to quarantine stock.",
    });
    setIntakeDialogOpen(true);
  };

  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIntakeReq) return;
    setSubmitting(true);
    try {
      await apiClient.put(`/resource-requests/${selectedIntakeReq._id}/complete`, {
        temperatureOnArrival: parseFloat(intakeData.temperatureOnArrival) || 4.0,
        notes: intakeData.notes,
      });
      toast.success("Delivery verified! Blood units added to receiving hospital inventory ledger.");
      setIntakeDialogOpen(false);
      setSelectedIntakeReq(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to confirm intake");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (requestId: string) => {
    try {
      await apiClient.put(`/resource-requests/${requestId}/cancel`, {});
      toast.success("Request cancelled. Any reserved units have been released back to available.");
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to cancel request");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 font-medium">
            1. Pending Approval
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 font-medium">
            2. Approved (Reserved)
          </Badge>
        );
      case "dispatched":
        return (
          <Badge variant="outline" className="bg-purple-100 text-purple-900 border-purple-300 font-semibold animate-pulse flex items-center gap-1">
            <Truck className="h-3 w-3 text-purple-700" /> 3. In-Transit
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 font-semibold flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-700" /> 4. Delivered (In Ledger)
          </Badge>
        );
      case "declined":
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 font-medium">
            Declined
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300 font-medium">
            Cancelled (Released)
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
        subtitle="Inter-hospital resource transfers with verifiable chain-of-custody tracking"
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            New Request
          </Button>
        }
      />

      {/* Chain of Custody State Machine Workflow Banner */}
      <div className="border border-blue-200 bg-gradient-to-r from-blue-50/90 to-indigo-50/80 rounded-xl p-4 shadow-2xs">
        <div className="flex items-center gap-2 font-semibold text-sm text-blue-950 mb-2">
          <ArrowRightLeft className="h-4 w-4 text-blue-700" />
          <span>Inter-Hospital Transfer Chain-of-Custody Lifecycle & Ledger Invariant</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-white/90 p-2.5 rounded-lg border border-blue-100 shadow-2xs">
            <p className="font-bold text-amber-800 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600" /> 1. Pending Request
            </p>
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              Facility requests units. Both hospital inventory ledgers remain untouched.
            </p>
          </div>
          <div className="bg-white/90 p-2.5 rounded-lg border border-blue-100 shadow-2xs">
            <p className="font-bold text-blue-800 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" /> 2. Approved (Reserved)
            </p>
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              Supplier approves. Units move to <strong>Reserved</strong>. Total physical inventory intact.
            </p>
          </div>
          <div className="bg-white/90 p-2.5 rounded-lg border border-blue-100 shadow-2xs">
            <p className="font-bold text-purple-800 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-600" /> 3. Dispatched (In-Transit)
            </p>
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              Lab scans &amp; hands to courier. <strong>Officially deducted</strong> from supplier physical ledger.
            </p>
          </div>
          <div className="bg-white/90 p-2.5 rounded-lg border border-blue-100 shadow-2xs">
            <p className="font-bold text-emerald-800 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> 4. Delivered (In Ledger)
            </p>
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              Requester inspects seal/temp. Units <strong>added to recipient ledger</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 border border-input rounded-lg px-3 text-sm bg-card"
        >
          <option value="">Any status</option>
          <option value="pending">1. Pending</option>
          <option value="approved">2. Approved (Reserved)</option>
          <option value="dispatched">3. In-Transit</option>
          <option value="completed">4. Delivered</option>
          <option value="declined">Declined</option>
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
          {isSuper ? "All Resource Requests (network)" : "Incoming Requests (We Supply)"}
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
                  <TableHead>Status &amp; Chain</TableHead>
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
                        <span className="flex items-center gap-1 font-medium">
                          <Droplet className="h-4 w-4 text-red-500" />{" "}
                          {req.bloodGroup}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Wind className="h-4 w-4 text-blue-500" /> Oxygen
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">{req.units}</TableCell>
                    <TableCell>
                      {getStatusBadge(req.status)}
                      {req.status === "dispatched" && (
                        <p className="text-[10px] text-purple-700 font-mono mt-0.5">
                          {req.courierName || "Courier"} {req.coldBoxSealNumber ? `· ${req.coldBoxSealNumber}` : ""}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {req.notes ? (
                        <span className="text-sm text-foreground whitespace-pre-wrap break-words">{req.notes}</span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>{new Date(req.requestedAt).toLocaleString()}</div>
                      {req.status === "pending" && <SlaTimer requestedAt={req.requestedAt} />}
                    </TableCell>
                    <TableCell>
                      {req.status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleRespond(req._id, "approved")}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Approve (Reserve)
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
                      {req.status === "approved" && (
                        <Button
                          size="sm"
                          onClick={() => openDispatchModal(req)}
                          className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1 shadow-xs"
                        >
                          <Truck className="h-3.5 w-3.5" /> Pack &amp; Dispatch
                        </Button>
                      )}
                      {req.status === "dispatched" && (
                        <div className="text-xs text-purple-900 bg-purple-50 border border-purple-200 px-2 py-1 rounded inline-flex items-center gap-1">
                          <Truck className="h-3 w-3 text-purple-700 shrink-0" />
                          <span>In-Transit ({req.courierName || "Courier"})</span>
                        </div>
                      )}
                      {req.status === "completed" && (
                        <span className="text-xs text-green-800 bg-green-50 border border-green-200 px-2 py-1 rounded inline-flex items-center gap-1 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Delivered
                        </span>
                      )}
                      {/* Superadmin oversight action if in dispatched state */}
                      {isSuper && req.status === "dispatched" && (
                        <Button
                          size="sm"
                          onClick={() => openIntakeModal(req)}
                          variant="outline"
                          className="border-green-600 text-green-600 ml-2"
                        >
                          Confirm Intake
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
        <h2 className="text-xl font-semibold mb-4">Outgoing Requests (We Receive)</h2>
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
                  <TableHead>Status &amp; Chain</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOutgoing.map((req) => (
                  <TableRow key={req._id}>
                    <TableCell className="font-medium">{req.supplyingHospitalId?.name}</TableCell>
                    <TableCell>
                      {req.resourceType === "blood" ? (
                        <span className="flex items-center gap-1 font-medium">
                          <Droplet className="h-4 w-4 text-red-500" />{" "}
                          {req.bloodGroup}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Wind className="h-4 w-4 text-blue-500" /> Oxygen
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">{req.units}</TableCell>
                    <TableCell>
                      {getStatusBadge(req.status)}
                      {req.status === "approved" && (
                        <p className="text-[10px] text-blue-700 mt-0.5">Reserved at supplier</p>
                      )}
                      {req.status === "dispatched" && (
                        <p className="text-[10px] text-purple-700 font-mono mt-0.5">
                          {req.courierName || "Courier"} {req.coldBoxSealNumber ? `· ${req.coldBoxSealNumber}` : ""}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {req.notes ? (
                        <span className="text-sm text-foreground whitespace-pre-wrap break-words">{req.notes}</span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>{new Date(req.requestedAt).toLocaleString()}</div>
                      {req.status === "pending" && <SlaTimer requestedAt={req.requestedAt} />}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {req.status === "pending" && (
                          <Button
                            size="sm"
                            onClick={() => handleCancel(req._id)}
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            Cancel Request
                          </Button>
                        )}
                        {req.status === "approved" && (
                          <span className="text-xs text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded inline-flex items-center gap-1 font-medium">
                            <Clock className="h-3.5 w-3.5 text-blue-600" /> Reserved · Packing
                          </span>
                        )}
                        {req.status === "dispatched" && (
                          <Button
                            size="sm"
                            onClick={() => openIntakeModal(req)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 shadow-xs"
                          >
                            <PackageCheck className="h-3.5 w-3.5" /> Confirm Receipt &amp; Intake
                          </Button>
                        )}
                        {req.status === "completed" && (
                          <span className="text-xs text-green-800 bg-green-50 border border-green-200 px-2.5 py-1 rounded inline-flex items-center gap-1 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Added to Ledger
                          </span>
                        )}
                      </div>
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

      {/* Pack & Dispatch Dialog */}
      <Dialog open={dispatchDialogOpen} onOpenChange={setDispatchDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-900">
              <Truck className="h-5 w-5 text-purple-600" /> Pack &amp; Handover to Courier
            </DialogTitle>
            <DialogDescription>
              Physically pulling units from cold storage for {selectedDispatchReq?.requestingHospitalId?.name}.
              Submitting this will officially deduct {selectedDispatchReq?.units} unit(s) of {selectedDispatchReq?.bloodGroup || selectedDispatchReq?.resourceType} from your physical inventory ledger.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDispatchSubmit}>
            <div className="space-y-4 py-3 text-sm">
              <div className="space-y-2">
                <Label>Logistics / Courier Partner</Label>
                <Input
                  value={dispatchData.courierName}
                  onChange={(e) => setDispatchData({ ...dispatchData, courierName: e.target.value })}
                  placeholder="e.g. MedEx Cold Chain Logistics, Red Cross Van"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Cold Box Tamper Seal #</Label>
                  <Input
                    value={dispatchData.coldBoxSealNumber}
                    onChange={(e) => setDispatchData({ ...dispatchData, coldBoxSealNumber: e.target.value })}
                    placeholder="e.g. SEAL-99214"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Waybill / Tracking #</Label>
                  <Input
                    value={dispatchData.trackingNumber}
                    onChange={(e) => setDispatchData({ ...dispatchData, trackingNumber: e.target.value })}
                    placeholder="e.g. TRK-LOS-019"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Phlebotomy / Lab Packaging Notes</Label>
                <Input
                  value={dispatchData.notes}
                  onChange={(e) => setDispatchData({ ...dispatchData, notes: e.target.value })}
                  placeholder="Insulated cold box temp at handover, ice packs verified"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDispatchDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-purple-600 hover:bg-purple-700 text-white">
                {submitting ? "Deducting & Dispatching…" : "Confirm Handover & Deduct Stock"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Receipt & Intake Dialog */}
      <Dialog open={intakeDialogOpen} onOpenChange={setIntakeDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-900">
              <PackageCheck className="h-5 w-5 text-emerald-600" /> Confirm Delivery &amp; Inventory Intake
            </DialogTitle>
            <DialogDescription>
              Confirm physical receipt of {selectedIntakeReq?.units} unit(s) of {selectedIntakeReq?.bloodGroup || selectedIntakeReq?.resourceType} from {selectedIntakeReq?.supplyingHospitalId?.name}.
              This will add the units to your hospital&apos;s physical inventory ledger.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleIntakeSubmit}>
            <div className="space-y-4 py-3 text-sm">
              <div className="space-y-2">
                <Label>Arrival Temperature (°C)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={intakeData.temperatureOnArrival}
                  onChange={(e) => setIntakeData({ ...intakeData, temperatureOnArrival: e.target.value })}
                  placeholder="Target: 2.0°C to 6.0°C"
                  required
                />
                <p className="text-[11px] text-muted-foreground">Cold chain compliance check: Must be between 2°C and 10°C upon receipt.</p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="sealCheckbox"
                  checked={intakeData.sealIntact}
                  onChange={(e) => setIntakeData({ ...intakeData, sealIntact: e.target.checked })}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  required
                />
                <label htmlFor="sealCheckbox" className="text-xs font-medium cursor-pointer">
                  Tamper-evident seal {selectedIntakeReq?.coldBoxSealNumber ? `(${selectedIntakeReq.coldBoxSealNumber})` : ""} verified intact and concordant.
                </label>
              </div>
              <div className="space-y-2">
                <Label>Intake / Crossmatch Notes</Label>
                <Input
                  value={intakeData.notes}
                  onChange={(e) => setIntakeData({ ...intakeData, notes: e.target.value })}
                  placeholder="Bag integrity verified, forwarded to quarantine stock"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIntakeDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !intakeData.sealIntact} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? "Adding to Ledger…" : "Accept Units into Inventory"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
