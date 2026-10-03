"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast, Toaster } from "react-hot-toast";
import apiClient from "../../api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Droplet,
  LogOut,
  CalendarPlus,
  CalendarClock,
  Phone,
  Mail,
  ShieldCheck,
  ShieldAlert,
  Clock,
  MapPin,
  Pencil,
  KeyRound,
  QrCode,
  Download,
  Award,
  Navigation,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

interface DonorProfile {
  _id: string;
  name: string;
  email: string;
  phone: string;
  bloodGroup: string;
  bloodGroupSelfReported?: string;
  bloodGroupVerified?: string | null;
  bloodGroupVerificationStatus?:
    | "unverified"
    | "pending_verification"
    | "verified"
    | "rejected";
  correctionRequest?: {
    requestedGroup: string;
    reason: string;
    requestedAt?: string;
    status: "pending" | "approved" | "rejected";
    reviewNotes?: string;
  };
  eligibilityStatus: string;
  lastDonationDate: string | null;
  sosOptIn: boolean;
  createdAt: string;
  qrCode?: string;
  ninMasked?: string;
  location?: { type: string; coordinates: [number, number] };
  allergies?: string;
}
interface Hospital {
  _id: string;
  name: string;
  address: string;
  contactPhone: string;
}
interface Appointment {
  _id: string;
  hospitalId: Hospital;
  appointmentDate: string;
  assignedDate?: string;
  assignedTime?: string;
  timeSlot?: string;
  preferredDay?: string;
  preferredWindow?: string;
  donationType?: "WHOLE_BLOOD" | "PLATELET_APHERESIS" | "PLASMA_APHERESIS";
  status: string;
  notes?: string;
}

const statusLabel = (s: string) =>
  s === "pending"
    ? "Offer submitted"
    : s === "scheduled"
      ? "Confirmed"
      : s.charAt(0).toUpperCase() + s.slice(1);
const isActive = (s: string) => s === "pending" || s === "scheduled";

function ApptStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    scheduled: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
    missed: "bg-gray-200 text-gray-700",
  };
  return <Badge className={map[status] || ""}>{statusLabel(status)}</Badge>;
}

export default function DonorDashboard() {
  const [donor, setDonor] = useState<DonorProfile | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [formData, setFormData] = useState({
    hospitalId: "",
    appointmentDate: "",
    preferredWindow: "morning",
    donationType: "WHOLE_BLOOD",
    notes: "",
  });
  const router = useRouter();

  // Digital Donor Pass & Certificate (Dynamic Rotating QR)
  const [qrOpen, setQrOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [dynamicQr, setDynamicQr] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(60);
  const [fetchingDynamic, setFetchingDynamic] = useState(false);

  const fetchDynamicPass = useCallback(async () => {
    try {
      setFetchingDynamic(true);
      const res = await apiClient.get("/donor-auth/dynamic-pass");
      if (res.data?.qrCode) {
        setDynamicQr(res.data.qrCode);
        setSecondsLeft(res.data.ttlSeconds || 60);
      }
    } catch {
      // Gracefully fall back to base profile QR if offline
    } finally {
      setFetchingDynamic(false);
    }
  }, []);

  useEffect(() => {
    if (!qrOpen) return;
    fetchDynamicPass();
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          fetchDynamicPass();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [qrOpen, fetchDynamicPass]);

  const handleDownloadPass = () => {
    const qrSrc = dynamicQr || donor?.qrCode;
    if (!qrSrc) return;
    const link = document.createElement("a");
    link.href = qrSrc;
    link.download = `Donor-Pass-${(donor?.name || "Donor").replace(/\s+/g, "_")}-${donor?.bloodGroup || "Blood"}.png`;
    link.click();
  };

  // Profile editing + password change + GPS location
  const [profileOpen, setProfileOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
    phone: "",
    bloodGroup: "",
    allergies: "",
    sosOptIn: true,
    location: null as { type: string; coordinates: [number, number] } | null,
  });
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locMsg, setLocMsg] = useState("");
  const [cancelingAppt, setCancelingAppt] = useState<{
    id: string;
    hospitalName?: string;
    date?: string;
  } | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirm: "",
  });

  // Blood group correction request dialog
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({
    requestedGroup: "O+",
    reason: "",
  });

  const openProfile = () => {
    if (!donor) return;
    setProfileForm({
      name: donor.name,
      email: donor.email || "",
      phone: donor.phone,
      bloodGroup: donor.bloodGroup || "",
      allergies: donor.allergies || "",
      sosOptIn: donor.sosOptIn,
      location: donor.location || null,
    });
    setLocMsg("");
    setProfileOpen(true);
  };

  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }
    setDetectingLocation(true);
    setLocMsg("Detecting current GPS coordinates…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [
          pos.coords.longitude,
          pos.coords.latitude,
        ];
        setProfileForm((prev) => ({
          ...prev,
          location: { type: "Point", coordinates: coords },
        }));
        setDetectingLocation(false);
        setLocMsg(
          `Detected: ${coords[1].toFixed(4)}° N, ${coords[0].toFixed(4)}° E ✓`,
        );
        toast.success("Current location detected!");
      },
      () => {
        setDetectingLocation(false);
        setLocMsg(
          "Could not detect location. Please allow browser location access.",
        );
        toast.error("Location detection failed. Check permissions.");
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  };

  const saveProfile = async () => {
    if (
      profileForm.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileForm.email.trim())
    ) {
      toast.error(
        "Please enter a valid email address (e.g., name@example.com).",
      );
      return;
    }
    setSavingProfile(true);
    try {
      const res = await apiClient.put("/donor/auth/profile", profileForm);
      const d = res.data.donor;
      setDonor((prev) =>
        prev
          ? {
              ...prev,
              name: d.name,
              email: d.email,
              phone: d.phone,
              bloodGroup: d.bloodGroup,
              qrCode: d.qrCode || prev.qrCode,
              sosOptIn: d.sosOptIn,
              location: d.location,
              allergies: d.allergies,
            }
          : prev,
      );
      toast.success("Profile updated");
      setProfileOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionForm.reason.trim()) {
      toast.error(
        "Please provide a medical reason or explanation for this correction.",
      );
      return;
    }
    setSubmittingCorrection(true);
    try {
      const res = await apiClient.post(
        "/donor/auth/request-correction",
        correctionForm,
      );
      toast.success(res.data.message || "Correction request submitted!");
      setDonor((prev) =>
        prev
          ? {
              ...prev,
              bloodGroupVerificationStatus: "pending_verification",
              correctionRequest: res.data.correctionRequest,
            }
          : prev,
      );
      setCorrectionOpen(false);
      setCorrectionForm({
        requestedGroup: donor?.bloodGroup || "O+",
        reason: "",
      });
    } catch (err: any) {
      toast.error(
        err.response?.data?.error || "Failed to submit correction request",
      );
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const savePassword = async () => {
    if (pwForm.newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (pwForm.newPassword !== pwForm.confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setSavingPw(true);
    try {
      await apiClient.post("/donor/auth/change-password", {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      toast.success("Password changed");
      setPwForm({ currentPassword: "", newPassword: "", confirm: "" });
      setPwOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to change password");
    } finally {
      setSavingPw(false);
    }
  };

  useEffect(() => {
    setNowMs(Date.now());
    const clockTimer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    const token = localStorage.getItem("donorToken");
    if (!token) {
      clearInterval(clockTimer);
      router.push("/donor/login");
      return;
    }
    Promise.all([
      apiClient.get("/donor/auth/profile"),
      apiClient.get("/hospitals"),
      apiClient.get("/donor/appointments"),
    ])
      .then(([p, h, a]) => {
        setDonor(p.data);
        setHospitals(h.data);
        setAppointments(a.data);
      })
      .catch(() => {
        localStorage.removeItem("donorToken");
        router.push("/donor/login");
      })
      .finally(() => setLoading(false));

    return () => clearInterval(clockTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAppointments = async () => {
    const r = await apiClient.get("/donor/appointments");
    setAppointments(r.data);
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setBooking(true);
    try {
      await apiClient.post("/donor/appointments", {
        hospitalId: formData.hospitalId,
        appointmentDate: formData.appointmentDate
          ? formData.appointmentDate
          : undefined,
        preferredWindow: formData.preferredWindow,
        donationType: formData.donationType,
        notes: formData.notes,
      });
      toast.success(
        "Donation offer submitted! The hospital blood bank will assign your date and time.",
      );
      setFormData({
        hospitalId: "",
        appointmentDate: "",
        preferredWindow: "morning",
        donationType: "WHOLE_BLOOD",
        notes: "",
      });
      await refreshAppointments();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error || "Failed to submit donation offer",
      );
    } finally {
      setBooking(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelingAppt) return;
    setCanceling(true);
    try {
      await apiClient.delete(`/donor/appointments/${cancelingAppt.id}`);
      toast.success("Appointment cancelled");
      setCancelingAppt(null);
      await refreshAppointments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to cancel appointment");
    } finally {
      setCanceling(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("donorToken");
    router.push("/donor/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
      </div>
    );
  }
  if (!donor) return null;

  const lastDonation = donor.lastDonationDate
    ? new Date(donor.lastDonationDate).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Never";

  const nextEligibleTime = donor.lastDonationDate
    ? new Date(donor.lastDonationDate).getTime() + 90 * 86400000
    : 0;
  const isDeferred =
    donor.eligibilityStatus === "deferred" ||
    (nextEligibleTime > 0 && (nowMs || Date.now()) < nextEligibleTime);
  const msUntilEligible = Math.max(0, nextEligibleTime - (nowMs || Date.now()));
  const countdownDays = Math.floor(msUntilEligible / 86400000);
  const countdownHours = Math.floor((msUntilEligible % 86400000) / 3600000);
  const countdownMins = Math.floor((msUntilEligible % 3600000) / 60000);
  const countdownSecs = Math.floor((msUntilEligible % 60000) / 1000);
  const nextEligibleDateObj =
    nextEligibleTime > 0 ? new Date(nextEligibleTime) : null;
  const nextEligibleDateFormatted = nextEligibleDateObj
    ? nextEligibleDateObj.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  const daysUntilEligible = countdownDays;

  const eligibilityBadge =
    donor.eligibilityStatus === "eligible" && !isDeferred ? (
      <Badge className="bg-emerald-100 text-emerald-700">
        Eligible to donate
      </Badge>
    ) : isDeferred ? (
      <Badge className="bg-amber-100 text-amber-800 border border-amber-300 font-semibold">
        Deferred (90d Rest Period)
      </Badge>
    ) : (
      <Badge className="bg-gray-100 text-gray-600">
        {donor.eligibilityStatus}
      </Badge>
    );

  const upcoming = appointments.filter((a) => isActive(a.status));
  const past = appointments.filter((a) => !isActive(a.status));

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster
        position="top-right"
        toastOptions={{ duration: 5000, error: { duration: 6500 } }}
      />
      {/* Top bar */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-red-600 rounded-xl flex items-center justify-center">
              <Droplet className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800 leading-none">
                Donor Portal
              </h1>
              <p className="text-xs text-gray-400">Smart Blood Bank</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" /> Logout
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Hero / profile */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-red-600 to-red-500 p-6 text-white">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-red-100 text-sm">Welcome back,</p>
                <h2 className="text-2xl font-bold">{donor.name}</h2>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-2 bg-white/20 rounded-xl px-4 py-2 text-white border border-white/30 shadow-sm">
                  <Droplet className="h-6 w-6 text-white" />
                  <span className="text-2xl font-bold">{donor.bloodGroup}</span>
                  {donor.bloodGroupVerificationStatus === "verified" ? (
                    <span className="text-[10px] bg-emerald-500/90 text-white font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                      ✓ Lab-Verified
                    </span>
                  ) : donor.bloodGroupVerificationStatus ===
                    "pending_verification" ? (
                    <span className="text-[10px] bg-amber-400 text-amber-950 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                      ⏳ Pending Lab Test
                    </span>
                  ) : (
                    <span className="text-[10px] bg-white/30 text-white font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                      ⚠️ Self-Reported
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCorrectionForm({
                      requestedGroup: donor.bloodGroup || "O+",
                      reason: "",
                    });
                    setCorrectionOpen(true);
                  }}
                  className="text-[11px] text-white/90 hover:text-white underline cursor-pointer flex items-center gap-1"
                >
                  <Pencil className="h-3 w-3" /> Request Blood Group Correction
                </button>
              </div>
            </div>
          </div>
          <CardContent className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              {eligibilityBadge}
              {isDeferred && (
                <span className="text-sm font-semibold text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 flex items-center gap-1.5 shadow-xs">
                  <Clock className="h-4 w-4 text-amber-600 animate-pulse" />{" "}
                  Next eligible: {nextEligibleDateFormatted} (~{countdownDays}d{" "}
                  {countdownHours}h {countdownMins}m {countdownSecs}s)
                </span>
              )}
              {!isDeferred && donor.eligibilityStatus === "eligible" && (
                <span className="text-sm text-emerald-700 flex items-center gap-1 font-medium">
                  <ShieldCheck className="h-4 w-4" /> You can book a donation
                  now
                </span>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <Info icon={Mail} label="Email" value={donor.email} />
              <Info icon={Phone} label="Phone" value={donor.phone} />
              <Info
                icon={CalendarClock}
                label="Last donation"
                value={lastDonation}
              />
              <Info
                icon={MapPin}
                label="GPS Location"
                value={
                  donor.location?.coordinates
                    ? `${donor.location.coordinates[1].toFixed(2)}° N, ${donor.location.coordinates[0].toFixed(2)}° E`
                    : "Lagos (Default)"
                }
              />
              <Info
                icon={AlertCircle}
                label="Allergies"
                value={donor.allergies || "None reported"}
              />
              <Info
                icon={ShieldCheck}
                label="NIN (NDPA Protected)"
                value={donor.ninMasked || "Verified on file"}
              />
              <Info
                icon={ShieldCheck}
                label="SOS alerts"
                value={donor.sosOptIn ? "Opted in (15km radius)" : "Off"}
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
              <Button
                variant="default"
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white font-medium"
                onClick={() => setQrOpen(true)}
              >
                <QrCode className="h-4 w-4 mr-1.5" /> View Digital Donor Pass
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCertOpen(true)}
              >
                <Award className="h-4 w-4 mr-1 text-amber-500" /> Donor
                Certificate
              </Button>
              <Button variant="outline" size="sm" onClick={openProfile}>
                <Pencil className="h-4 w-4 mr-1" /> Edit profile &amp; GPS
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPwOpen(true)}
              >
                <KeyRound className="h-4 w-4 mr-1" /> Change password
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Offer to donate blood (Select hospital, hospital admin assigns time) */}
        {/* Offer / Booking Card */}
        <Card
          className={
            isDeferred
              ? "border-amber-300 bg-linear-to-b from-amber-50/50 to-white shadow-sm"
              : ""
          }
        >
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2">
                {isDeferred ? (
                  <>
                    <ShieldAlert className="h-5 w-5 text-amber-600" />
                    <span>Mandatory Recovery Interval (Active Deferral)</span>
                  </>
                ) : (
                  <>
                    <CalendarPlus className="h-5 w-5 text-red-500" />
                    <span>Offer to donate blood</span>
                  </>
                )}
              </CardTitle>
              {isDeferred && (
                <span className="text-xs bg-amber-100 text-amber-900 border border-amber-300 font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  🔒 Booking Locked
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {isDeferred
                ? "Clinical donor protection standard under WHO and National Blood Service Commission (NBSC) regulations."
                : "Select the hospital blood bank and donation type. Hospital staff will check clinical capacity and assign your confirmed appointment date and time."}
            </p>
          </CardHeader>
          <CardContent>
            {isDeferred ? (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-950 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-500 text-white rounded-lg shrink-0 mt-0.5 shadow-xs">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-sm text-amber-950">
                        Physiological Rest Period in Progress
                      </h4>
                      <p className="text-xs text-amber-900 leading-relaxed">
                        To safeguard donor health and prevent iron-deficiency
                        anemia, the National Blood Service Commission requires a
                        mandatory <strong>90-day rest interval</strong>{" "}
                        following whole blood donation. This allows complete red
                        blood cell and ferritin regeneration before your next
                        donation.
                      </p>
                    </div>
                  </div>

                  {/* Real-time countdown clock */}
                  <div className="pt-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800 text-center mb-1.5">
                      Live countdown until next eligible donation
                    </p>
                    <div className="grid grid-cols-4 gap-2 text-center max-w-md mx-auto">
                      <div className="bg-white border border-amber-300 rounded-xl p-2.5 shadow-xs">
                        <span className="text-2xl font-black text-amber-950 font-mono">
                          {String(countdownDays).padStart(2, "0")}
                        </span>
                        <span className="block text-[10px] uppercase font-bold text-amber-700 tracking-wider">
                          Days
                        </span>
                      </div>
                      <div className="bg-white border border-amber-300 rounded-xl p-2.5 shadow-xs">
                        <span className="text-2xl font-black text-amber-950 font-mono">
                          {String(countdownHours).padStart(2, "0")}
                        </span>
                        <span className="block text-[10px] uppercase font-bold text-amber-700 tracking-wider">
                          Hours
                        </span>
                      </div>
                      <div className="bg-white border border-amber-300 rounded-xl p-2.5 shadow-xs">
                        <span className="text-2xl font-black text-amber-950 font-mono">
                          {String(countdownMins).padStart(2, "0")}
                        </span>
                        <span className="block text-[10px] uppercase font-bold text-amber-700 tracking-wider">
                          Mins
                        </span>
                      </div>
                      <div className="bg-white border border-amber-300 rounded-xl p-2.5 shadow-xs">
                        <span className="text-2xl font-black text-amber-950 font-mono">
                          {String(countdownSecs).padStart(2, "0")}
                        </span>
                        <span className="block text-[10px] uppercase font-bold text-amber-700 tracking-wider">
                          Secs
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2 text-xs pt-1 border-t border-amber-200">
                    <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
                      <span className="text-gray-500 block text-[11px]">
                        Last Donation Date
                      </span>
                      <strong className="text-amber-950">{lastDonation}</strong>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
                      <span className="text-gray-500 block text-[11px]">
                        Next Eligible Date
                      </span>
                      <strong className="text-emerald-700">
                        {nextEligibleDateFormatted}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="text-center text-xs text-gray-500 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  🔒 The appointment booking form is locked until{" "}
                  <strong>{nextEligibleDateFormatted}</strong> to protect donor
                  safety.
                </div>
              </div>
            ) : upcoming.length > 0 ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-900 space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <CalendarClock className="h-5 w-5 text-blue-600" />
                  <span>Active Appointment in Progress</span>
                </div>
                <p className="text-xs leading-relaxed text-blue-800">
                  You already have an active donation appointment booked below (
                  {upcoming[0].status === "scheduled"
                    ? "Confirmed appointment"
                    : "Offer awaiting hospital time assignment"}
                  ). Hospital phlebotomy capacity limits allow a maximum of 1
                  active appointment per donor. Please attend or cancel it
                  before offering another donation.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSchedule} className="space-y-4">
                <div>
                  <Label>Hospital Blood Bank *</Label>
                  <select
                    value={formData.hospitalId}
                    onChange={(e) =>
                      setFormData({ ...formData, hospitalId: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm mt-1"
                    required
                  >
                    <option value="">Select a hospital</option>
                    {hospitals.map((h) => (
                      <option key={h._id} value={h._id}>
                        {h.name} — {h.address}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label>Donation Type / Component *</Label>
                  <select
                    value={formData.donationType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        donationType: e.target.value as any,
                      })
                    }
                    className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm mt-1"
                  >
                    <option value="WHOLE_BLOOD">
                      🩸 Whole Blood (Standard ~450 mL donation, 90-day rest
                      interval)
                    </option>
                    <option value="PLATELET_APHERESIS">
                      🟡 Platelets (Apheresis, ~60–90 mins, 14-day rest
                      interval)
                    </option>
                    <option value="PLASMA_APHERESIS">
                      💧 Plasma (Apheresis, ~45 mins, 28-day rest interval)
                    </option>
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Whole blood is standard. Apheresis allows donating specific
                    components at equipped tertiary hospitals.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>Preferred day (Optional)</Label>
                      <span className="text-[11px] text-gray-400">
                        Optional
                      </span>
                    </div>
                    <Input
                      type="date"
                      min={new Date().toISOString().split("T")[0]}
                      value={formData.appointmentDate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          appointmentDate: e.target.value,
                        })
                      }
                      className="mt-1"
                    />
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Leave blank for hospital to assign earliest available
                      slot.
                    </p>
                  </div>
                  <div>
                    <Label>Preferred clinic window</Label>
                    <select
                      value={formData.preferredWindow}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          preferredWindow: e.target.value,
                        })
                      }
                      className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm mt-1"
                    >
                      <option value="morning">
                        Morning Clinic (8:00 AM – 12:00 PM)
                      </option>
                      <option value="afternoon">
                        Afternoon Clinic (12:00 PM – 4:00 PM)
                      </option>
                      <option value="flexible">
                        Flexible (Any time during clinic hours)
                      </option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label>Notes (optional)</Label>
                  <Input
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    placeholder="e.g. First-time donor, coming during lunch break, etc."
                    className="mt-1"
                  />
                </div>
                <Button type="submit" disabled={booking}>
                  {booking ? "Submitting offer…" : "Submit Donation Offer"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Upcoming */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-blue-500" /> Upcoming
              donation offers &amp; appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <div className="py-6 text-center text-gray-500 space-y-1">
                <CalendarClock className="h-8 w-8 text-gray-300 mx-auto" />
                <p className="text-sm font-medium text-gray-700">
                  No active appointments
                </p>
                <p className="text-xs text-gray-400">
                  {isDeferred
                    ? `Booking will unlock automatically on ${nextEligibleDateFormatted} upon deferral clearance.`
                    : "Submit an offer above to schedule your next donation."}
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {upcoming.map((a) => (
                  <li
                    key={a._id}
                    className="py-3 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <p className="font-medium text-gray-800 flex items-center gap-1">
                        <MapPin className="h-4 w-4 text-gray-400" />{" "}
                        {a.hospitalId?.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">
                          {a.assignedDate
                            ? new Date(a.assignedDate).toLocaleDateString(
                                "en-GB",
                                {
                                  weekday: "long",
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                },
                              )
                            : a.preferredDay ||
                              (a.appointmentDate
                                ? new Date(
                                    a.appointmentDate,
                                  ).toLocaleDateString("en-GB", {
                                    weekday: "long",
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "Earliest available")}
                        </span>
                        {a.donationType && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-800 border border-slate-200">
                            {a.donationType === "PLATELET_APHERESIS"
                              ? "🟡 Platelets"
                              : a.donationType === "PLASMA_APHERESIS"
                                ? "💧 Plasma"
                                : "🩸 Whole Blood"}
                          </span>
                        )}
                        {a.assignedTime ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-xs font-bold">
                            ⏰ {a.assignedTime}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                            ⏳ Awaiting time assignment
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-blue-600 font-medium">
                        {a.preferredWindow === "afternoon"
                          ? "Afternoon Clinic (12:00 PM – 4:00 PM)"
                          : a.preferredWindow === "flexible"
                            ? "Flexible (Clinic hours)"
                            : "Morning Clinic (8:00 AM – 12:00 PM)"}
                      </p>
                      {a.notes && (
                        <p className="text-xs text-gray-500">Note: {a.notes}</p>
                      )}
                      {(() => {
                        const coords = (a.hospitalId as any)?.location
                          ?.coordinates;
                        const mapsUrl =
                          coords && coords.length >= 2
                            ? `https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`
                            : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((a.hospitalId?.name || "") + " " + (a.hospitalId?.address || ""))}`;
                        return (
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium mt-1"
                          >
                            <Navigation className="h-3 w-3" /> Get Directions
                          </a>
                        );
                      })()}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <ApptStatusBadge status={a.status} />
                      <button
                        onClick={() =>
                          setCancelingAppt({
                            id: a._id,
                            hospitalName: a.hospitalId?.name,
                            date: a.assignedTime
                              ? `${new Date(a.appointmentDate).toLocaleDateString()} at ${a.assignedTime}`
                              : new Date(a.appointmentDate).toLocaleString(),
                          })
                        }
                        className="text-red-600 text-xs hover:underline font-medium cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Past */}
        {past.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-600">History</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {past.map((a) => (
                  <li
                    key={a._id}
                    className="py-3 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-gray-700">
                        {a.hospitalId?.name}
                      </p>
                      <p className="text-sm text-gray-400">
                        {new Date(a.appointmentDate).toLocaleString()}
                      </p>
                    </div>
                    <ApptStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Custom Cancel Appointment Confirmation Dialog */}
      <Dialog
        open={!!cancelingAppt}
        onOpenChange={(open) => !open && setCancelingAppt(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5 text-red-600" /> Cancel Donation
              Appointment
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this scheduled donation
              appointment? You can book a new one at any time.
            </DialogDescription>
          </DialogHeader>
          {cancelingAppt && (
            <div className="p-3 bg-red-50/80 border border-red-200 rounded-lg text-xs text-gray-700 space-y-1">
              <p>
                <strong className="text-gray-900">Hospital:</strong>{" "}
                {cancelingAppt.hospitalName || "Hospital"}
              </p>
              <p>
                <strong className="text-gray-900">Scheduled Time:</strong>{" "}
                {cancelingAppt.date}
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCancelingAppt(null)}
              disabled={canceling}
            >
              Keep Appointment
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              disabled={canceling}
              className="bg-red-600 hover:bg-red-700"
            >
              {canceling ? "Cancelling…" : "Yes, Cancel Appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit profile dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-red-500" /> Edit profile
            </DialogTitle>
            <DialogDescription>
              Update your contact details, blood group, and alert preferences.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full name</Label>
              <Input
                value={profileForm.name}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, name: e.target.value })
                }
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, email: e.target.value })
                  }
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, phone: e.target.value })
                  }
                  placeholder="08012345678"
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Blood Group</Label>
                {donor.bloodGroupVerificationStatus === "verified" ? (
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
                    ✓ Clinically Verified
                  </span>
                ) : donor.bloodGroupVerificationStatus ===
                  "pending_verification" ? (
                  <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full font-semibold border border-amber-200">
                    ⏳ Pending Lab Check
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
                    Self-Reported (Unverified)
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between p-2.5 rounded-lg border bg-muted/40">
                <div className="flex items-center gap-2">
                  <Droplet className="h-5 w-5 text-red-600" />
                  <span className="font-bold text-base text-foreground">
                    {donor.bloodGroup}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-red-200 text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setProfileOpen(false);
                    setCorrectionForm({
                      requestedGroup: donor.bloodGroup || "O+",
                      reason: "",
                    });
                    setCorrectionOpen(true);
                  }}
                >
                  Request Correction / Retest
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                To prevent dangerous transfusion mismatches, blood groups cannot
                be changed directly. A hospital laboratory scientist will
                confirm your type at your next visit.
              </p>
            </div>
            <div>
              <Label>Allergies / Medical Notes</Label>
              <Input
                value={profileForm.allergies}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, allergies: e.target.value })
                }
                placeholder="e.g. Penicillin, Latex, Aspirin, or None"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Clinical staff check this during pre-donation screening.
              </p>
            </div>
            <div className="rounded-xl border p-3.5 bg-muted/40 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                  <MapPin className="h-3.5 w-3.5 text-red-600" /> GPS
                  Coordinates for Proximity
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDetectGps}
                  disabled={detectingLocation}
                  className="h-7 text-xs px-2.5 bg-background shadow-xs hover:bg-muted"
                >
                  {detectingLocation ? "Detecting…" : "📍 Detect Current GPS"}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                {profileForm.location?.coordinates
                  ? `Lat: ${profileForm.location.coordinates[1].toFixed(4)}°, Lon: ${profileForm.location.coordinates[0].toFixed(4)}°`
                  : "No GPS coordinates saved (using Lagos default [3.38, 6.52])"}
              </div>
              {locMsg && (
                <p className="text-xs text-emerald-600 font-medium">{locMsg}</p>
              )}
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The WPS and SOS engines use your GPS coordinates to match you to
                patients needing blood within 15 km.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={profileForm.sosOptIn}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, sosOptIn: e.target.checked })
                }
                className="h-4 w-4 accent-red-600"
              />
              Receive urgent SOS donation alerts near me
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProfileOpen(false)}
              disabled={savingProfile}
            >
              Cancel
            </Button>
            <Button onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Blood Group Correction Dialog */}
      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Droplet className="h-5 w-5 text-red-600" /> Request Blood Group
              Correction
            </DialogTitle>
            <DialogDescription>
              Under clinical safety regulations (NBSC standards), blood group
              updates require laboratory crossmatch testing.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCorrectionSubmit} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">
                Current Recorded Blood Group
              </Label>
              <div className="p-2.5 rounded-md bg-muted text-sm font-bold text-foreground mt-1 flex items-center justify-between">
                <span>{donor.bloodGroup}</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  Status: {donor.bloodGroupVerificationStatus || "unverified"}
                </span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">
                Requested Correct Blood Group *
              </Label>
              <select
                value={correctionForm.requestedGroup}
                onChange={(e) =>
                  setCorrectionForm({
                    ...correctionForm,
                    requestedGroup: e.target.value,
                  })
                }
                className="w-full border border-input rounded-md p-2 bg-background focus:outline-none focus:ring-2 focus:ring-red-500 text-sm mt-1"
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
              <Label className="text-xs font-semibold">
                Reason / Clinical Context *
              </Label>
              <textarea
                value={correctionForm.reason}
                onChange={(e) =>
                  setCorrectionForm({
                    ...correctionForm,
                    reason: e.target.value,
                  })
                }
                rows={3}
                placeholder="e.g. Previous hospital crossmatch at LUTH confirmed O-negative, or registration typo."
                className="w-full border border-input rounded-md p-2 bg-background focus:outline-none focus:ring-2 focus:ring-red-500 text-xs mt-1"
                required
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />{" "}
                Clinical Safety Protocol
              </p>
              <p className="text-[11px] leading-relaxed">
                Submitting this request flags your profile as{" "}
                <strong>Pending Verification</strong>. A hospital laboratory
                scientist will perform an ABO/Rh confirmatory test when you
                check in for your next donation.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCorrectionOpen(false)}
                disabled={submittingCorrection}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submittingCorrection}>
                {submittingCorrection
                  ? "Submitting…"
                  : "Submit Correction Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change password dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-red-500" /> Change password
            </DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Current password</Label>
              <PasswordInput
                value={pwForm.currentPassword}
                onChange={(e) =>
                  setPwForm({ ...pwForm, currentPassword: e.target.value })
                }
              />
            </div>
            <div>
              <Label>New password</Label>
              <PasswordInput
                value={pwForm.newPassword}
                onChange={(e) =>
                  setPwForm({ ...pwForm, newPassword: e.target.value })
                }
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <Label>Confirm new password</Label>
              <PasswordInput
                value={pwForm.confirm}
                onChange={(e) =>
                  setPwForm({ ...pwForm, confirm: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPwOpen(false)}
              disabled={savingPw}
            >
              Cancel
            </Button>
            <Button onClick={savePassword} disabled={savingPw}>
              {savingPw ? "Saving…" : "Change password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Digital Donor Pass Modal */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-xl font-bold">
              <Droplet className="h-5 w-5 text-red-600" /> Digital Donor Pass
            </DialogTitle>
            <DialogDescription>
              Present this verified pass at any hospital or blood drive to check
              in instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-4 space-y-4">
            {/* Live Anti-Screenshot Rotating Badge */}
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>
                Dynamic Anti-Screenshot Pass • Refreshes in {secondsLeft}s
              </span>
            </div>

            <div className="relative bg-white p-4 rounded-2xl border-2 border-red-100 shadow-sm">
              {dynamicQr || donor.qrCode ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={dynamicQr || donor.qrCode}
                  alt="Donor QR Code"
                  className="w-56 h-56 object-contain rounded-lg"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center bg-gray-100 rounded-lg text-gray-400 text-sm">
                  Generating QR Code...
                </div>
              )}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-bold px-3 py-0.5 rounded-full shadow">
                Group {donor.bloodGroup}
              </div>
            </div>

            <div className="space-y-1 text-center">
              <h3 className="font-bold text-lg text-gray-800">{donor.name}</h3>
              <p className="text-xs text-muted-foreground font-mono">
                ID: {donor._id}
              </p>
              {donor.ninMasked && (
                <p className="text-[11px] text-emerald-700 font-mono">
                  NIN: {donor.ninMasked}
                </p>
              )}

              <div className="pt-1.5 flex justify-center">
                {donor.bloodGroupVerificationStatus === "verified" ? (
                  <Badge
                    variant="outline"
                    className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[11px] font-semibold gap-1 py-0.5 px-2.5"
                  >
                    <ShieldCheck className="h-3 w-3 text-emerald-600" />{" "}
                    Lab-Verified Blood Type
                  </Badge>
                ) : donor.bloodGroupVerificationStatus ===
                  "pending_verification" ? (
                  <Badge
                    variant="outline"
                    className="bg-amber-50 text-amber-800 border-amber-300 text-[11px] font-semibold gap-1 py-0.5 px-2.5"
                  >
                    <Clock className="h-3 w-3 text-amber-600" /> Lab
                    Verification Pending
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-amber-50/70 text-amber-700 border-amber-200 text-[11px] font-normal gap-1 py-0.5 px-2.5"
                  >
                    <AlertTriangle className="h-3 w-3 text-amber-600" />{" "}
                    Self-Reported (Confirmatory Test Required)
                  </Badge>
                )}
              </div>

              <div className="pt-2">{eligibilityBadge}</div>
            </div>

            <p className="text-[11px] text-gray-500 max-w-xs text-center leading-relaxed">
              Static screenshots will be rejected by clinical staff for patient
              safety.
            </p>
          </div>
          <DialogFooter className="sm:justify-between flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPass}
              disabled={!donor.qrCode}
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-1.5" /> Download Pass
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setQrOpen(false)}
              className="flex-1"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Donor Certificate of Appreciation Modal */}
      <Dialog open={certOpen} onOpenChange={setCertOpen}>
        <DialogContent className="sm:max-w-xl text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-xl font-bold">
              <Award className="h-5 w-5 text-amber-500" /> Voluntary Donor
              Certificate
            </DialogTitle>
            <DialogDescription>
              Official Certificate of Appreciation recognizing your voluntary
              blood donation commitment.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 px-2">
            <div className="border-4 border-double border-amber-600/60 bg-gradient-to-b from-amber-50/50 via-white to-red-50/30 rounded-xl p-8 space-y-4 shadow-inner relative">
              <div className="flex items-center justify-center gap-2 text-red-600 font-bold tracking-widest text-xs uppercase">
                <Droplet className="h-4 w-4 fill-red-600" /> Smart Blood Bank
                &bull; Nigeria
              </div>

              <h2 className="text-2xl font-serif font-bold text-gray-900 tracking-wide uppercase">
                Certificate of Appreciation
              </h2>

              <p className="text-xs text-muted-foreground uppercase tracking-widest">
                This certificate is proudly awarded to
              </p>

              <h3 className="text-2xl font-bold text-red-700 underline decoration-red-300 underline-offset-8">
                {donor.name}
              </h3>

              <p className="text-xs text-gray-600 max-w-md mx-auto leading-relaxed pt-2">
                In sincere gratitude for your selfless dedication as a
                registered voluntary blood donor (Blood Group{" "}
                <strong className="text-red-700">{donor.bloodGroup}</strong>).
                Your commitment saves lives in critical maternal, trauma, and
                surgical emergencies across Nigerian healthcare facilities.
              </p>

              <div className="pt-4 flex items-center justify-between text-left text-xs border-t border-amber-200">
                <div>
                  <p className="text-muted-foreground">
                    Donor ID:{" "}
                    <span className="font-mono font-bold text-gray-700">
                      {donor._id.slice(-8).toUpperCase()}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    Issued: {new Date(donor.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <Badge className="bg-amber-100 text-amber-900 border-amber-300">
                    Certified Voluntary Donor
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="sm:justify-between flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-1.5" /> Print / Save Certificate
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setCertOpen(false)}
              className="flex-1"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ icon: Icon, label, value }: any) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-gray-300 shrink-0" />
      <span className="text-gray-400">{label}:</span>
      <span className="text-gray-700 font-medium truncate">{value}</span>
    </div>
  );
}
