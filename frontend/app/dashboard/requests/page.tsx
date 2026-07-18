"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import apiClient from "../../api/client";
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
import { Building2, Droplet, Wind, ArrowRightLeft } from "lucide-react";

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
  const [formData, setFormData] = useState({
    supplyingHospitalId: "",
    resourceType: "blood" as "blood" | "oxygen",
    bloodGroup: "",
    units: 1,
    notes: "",
  });
  const router = useRouter();

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
  }, []);

  // Helper to get available supply options (hospitals that have the selected resource)
  // Helper to get available supply options (hospitals that have the selected resource)
  const getAvailableSuppliers = () => {
    if (formData.resourceType === "blood" && formData.bloodGroup) {
      const supplierIds = inventory
        .filter(
          (item) => item.bloodGroup === formData.bloodGroup && item.units > 0,
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
    try {
      await apiClient.post("/resource-requests", {
        supplyingHospitalId: formData.supplyingHospitalId,
        resourceType: formData.resourceType,
        bloodGroup:
          formData.resourceType === "blood" ? formData.bloodGroup : undefined,
        units: formData.units,
        notes: formData.notes,
      });
      toast.success("Request sent");
      setDialogOpen(false);
      setFormData({
        supplyingHospitalId: "",
        resourceType: "blood",
        bloodGroup: "",
        units: 1,
        notes: "",
      });
      fetchData(); // refresh lists
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to create request");
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
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  // Filter suppliers based on current selection
  const availableSuppliers = getAvailableSuppliers();
  const uniqueSuppliers = Array.from(
    new Map(availableSuppliers.map((h) => [h._id, h])).values(),
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Resource Requests</h1>
          <p className="text-gray-500">
            Request blood or oxygen from other hospitals
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-red-600 hover:bg-red-700"
        >
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      {/* Incoming Requests */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Incoming Requests</h2>
        {incomingRequests.length === 0 ? (
          <p className="text-gray-500">No incoming requests.</p>
        ) : (
          <div className="bg-white rounded shadow overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requesting Hospital</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incomingRequests.map((req) => (
                  <TableRow key={req._id}>
                    <TableCell>{req.requestingHospitalId?.name}</TableCell>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Outgoing Requests */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Outgoing Requests</h2>
        {outgoingRequests.length === 0 ? (
          <p className="text-gray-500">No outgoing requests.</p>
        ) : (
          <div className="bg-white rounded shadow overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplying Hospital</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outgoingRequests.map((req) => (
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
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Request Blood / Oxygen</DialogTitle>
            <DialogDescription>
              Request a resource from another hospital. The supplying hospital
              will be notified.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateRequest}>
            <div className="space-y-4 py-4">
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
                  <p className="text-xs text-gray-500">
                    Select blood group first
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Units</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.units}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      units: parseInt(e.target.value) || 1,
                    })
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
              <Button type="submit" disabled={!formData.supplyingHospitalId}>
                Send Request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
