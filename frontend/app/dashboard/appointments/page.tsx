'use client';
import { useEffect, useState, useCallback } from 'react';
import apiClient from '../../api/client';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Droplet, CalendarCheck, HeartHandshake, Clock, AlertTriangle, Users,
  CheckCircle2, Calendar, ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Loading, EmptyState } from '@/components/ui/states';
import { useAuth } from '../../contexts/AuthContext';

interface Appt {
  _id: string;
  donorId?: { _id: string; name: string; phone: string; email?: string; bloodGroup: string; eligibilityStatus: string; ninMasked?: string } | null;
  hospitalId?: { _id: string; name: string; dailyDonationCapacity?: number } | null;
  appointmentDate: string;
  assignedDate?: string;
  assignedTime?: string;
  timeSlot?: string;
  preferredDay?: string;
  preferredWindow?: string;
  donorNinMasked?: string;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled' | 'missed';
  notes?: string;
}

interface CapacityData {
  hospitalId: string;
  hospitalName?: string;
  date: string;
  dailyCapacity: number;
  hourlyCapacity?: number;
  totalBooked: number;
  remainingSlots: number;
  capacityPercent: number;
  isOverbooked: boolean;
  slotCounts: Record<string, number>;
  scheduledDonors?: { id: string; name: string; bloodGroup?: string; assignedTime?: string }[];
}

const FILTERS = ['', 'pending', 'scheduled', 'completed', 'cancelled', 'missed'];
const LABEL: Record<string, string> = { pending: 'offer submitted', scheduled: 'confirmed' };

const MORNING_SLOTS = ['08:30 AM', '09:15 AM', '10:00 AM', '10:45 AM', '11:30 AM'];
const AFTERNOON_SLOTS = ['01:00 PM', '01:45 PM', '02:30 PM', '03:15 PM', '04:00 PM'];

function badge(s: string) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
    missed: 'bg-gray-200 text-foreground',
  };
  return <Badge className={map[s] || ''}>{LABEL[s] || s}</Badge>;
}

export default function AppointmentsPage() {
  const [appts, setAppts] = useState<Appt[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [recordingId, setRecordingId] = useState<string | null>(null);

  // Overview capacity for today and tomorrow
  const [todayCapacity, setTodayCapacity] = useState<CapacityData | null>(null);
  const [tomorrowCapacity, setTomorrowCapacity] = useState<CapacityData | null>(null);

  // Scheduling Modal State
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedulingAppt, setSchedulingAppt] = useState<Appt | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:30 AM');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [overrideCapacity, setOverrideCapacity] = useState(false);
  const [modalCapacity, setModalCapacity] = useState<CapacityData | null>(null);
  const [modalCapacityLoading, setModalCapacityLoading] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fetchCapacityForDate = async (dateStr: string, hospitalId?: string): Promise<CapacityData | null> => {
    try {
      const res = await apiClient.get('/appointments/capacity', {
        params: { date: dateStr, hospitalId: hospitalId || undefined },
      });
      return res.data;
    } catch {
      return null;
    }
  };

  const fetchOverviewCapacities = useCallback(async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const [todayCap, tomorrowCap] = await Promise.all([
      fetchCapacityForDate(todayStr),
      fetchCapacityForDate(tomorrowStr),
    ]);
    setTodayCapacity(todayCap);
    setTomorrowCapacity(tomorrowCap);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/appointments', { params: { status: status || undefined } });
      setAppts(r.data.data);
    } catch {
      toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchData();
    fetchOverviewCapacities();
  }, [fetchData, fetchOverviewCapacities]);

  const openScheduleModal = async (appt: Appt) => {
    setSchedulingAppt(appt);
    setOverrideCapacity(false);
    setScheduleNotes(appt.notes || '');

    // Default to tomorrow or today's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const initialDate = tomorrow.toISOString().split('T')[0];
    setScheduleDate(initialDate);

    const initialTime = appt.preferredWindow === 'afternoon' ? '01:30 PM' : '09:30 AM';
    setScheduleTime(initialTime);

    setScheduleModalOpen(true);
    setModalCapacityLoading(true);

    const hId = appt.hospitalId?._id;
    const cap = await fetchCapacityForDate(initialDate, hId);
    setModalCapacity(cap);
    setModalCapacityLoading(false);
  };

  const handleDateChange = async (newDate: string) => {
    setScheduleDate(newDate);
    if (!newDate || !schedulingAppt) return;
    setModalCapacityLoading(true);
    const cap = await fetchCapacityForDate(newDate, schedulingAppt.hospitalId?._id);
    setModalCapacity(cap);
    setModalCapacityLoading(false);
  };

  const handleConfirmSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingAppt) return;
    if (!scheduleDate || !scheduleTime) {
      toast.error('Please specify both appointment date and time.');
      return;
    }

    if (modalCapacity?.isOverbooked && !overrideCapacity) {
      toast.error('Hospital capacity reached for this date. Check the capacity override box if extra staff is arranged.');
      return;
    }

    setSavingSchedule(true);
    try {
      await apiClient.put(`/appointments/${schedulingAppt._id}/schedule`, {
        scheduledDate: scheduleDate,
        assignedTime: scheduleTime,
        notes: scheduleNotes,
        overrideCapacity,
      });
      toast.success(`Appointment confirmed for ${scheduleTime}! Donor has been notified.`);
      setScheduleModalOpen(false);
      setSchedulingAppt(null);
      fetchData();
      fetchOverviewCapacities();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to schedule appointment');
    } finally {
      setSavingSchedule(false);
    }
  };

  const setStatusFor = async (id: string, newStatus: string) => {
    try {
      await apiClient.put(`/appointments/${id}/status`, { status: newStatus });
      toast.success(newStatus === 'scheduled' ? 'Appointment confirmed' : `Marked ${newStatus}`);
      fetchData();
      fetchOverviewCapacities();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
  };

  // Record a donation straight from the appointment: adds a unit to inventory,
  // defers the donor, and marks a scheduled appointment completed.
  const recordDonation = async (a: Appt) => {
    if (!a.donorId?._id) return;
    setRecordingId(a._id);
    try {
      const res = await apiClient.post(`/donors/${a.donorId._id}/record-donation`, {
        hospitalId: isSuperadmin ? a.hospitalId?._id : undefined,
      });
      const { bloodGroup, units } = res.data.inventory;
      if (a.status === 'scheduled') {
        try { await apiClient.put(`/appointments/${a._id}/status`, { status: 'completed' }); } catch {}
      }
      toast.success(`Donation recorded — ${bloodGroup} stock now ${units}. Donor deferred 90 days.`);
      fetchData();
      fetchOverviewCapacities();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record donation');
    } finally {
      setRecordingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Donation Appointments & Capacity" subtitle="Schedule donor visits, assign specific times, and prevent phlebotomy overbooking" />

      {/* Hospital Capacity Overview Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" /> Today&apos;s Capacity Load
              </span>
              <span className="text-xs font-normal">
                {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {todayCapacity ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-extrabold text-gray-900">
                    {todayCapacity.totalBooked} <span className="text-sm font-normal text-muted-foreground">/ {todayCapacity.dailyCapacity} donors</span>
                  </span>
                  <Badge className={todayCapacity.isOverbooked ? 'bg-red-100 text-red-800' : todayCapacity.capacityPercent >= 80 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}>
                    {todayCapacity.isOverbooked ? 'Overbooked' : todayCapacity.capacityPercent >= 80 ? 'Near Capacity' : `${todayCapacity.remainingSlots} slots open`}
                  </Badge>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all ${todayCapacity.isOverbooked ? 'bg-red-500' : todayCapacity.capacityPercent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, todayCapacity.capacityPercent)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Phlebotomy capacity limit prevents donor congestion and staff fatigue.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground py-2">Select hospital to view capacity</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-blue-600" /> Tomorrow&apos;s Capacity Load
              </span>
              <span className="text-xs font-normal">
                {(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); })()}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tomorrowCapacity ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-extrabold text-gray-900">
                    {tomorrowCapacity.totalBooked} <span className="text-sm font-normal text-muted-foreground">/ {tomorrowCapacity.dailyCapacity} donors</span>
                  </span>
                  <Badge className={tomorrowCapacity.isOverbooked ? 'bg-red-100 text-red-800' : tomorrowCapacity.capacityPercent >= 80 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}>
                    {tomorrowCapacity.isOverbooked ? 'Overbooked' : tomorrowCapacity.capacityPercent >= 80 ? 'Near Capacity' : `${tomorrowCapacity.remainingSlots} slots open`}
                  </Badge>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all ${tomorrowCapacity.isOverbooked ? 'bg-red-500' : tomorrowCapacity.capacityPercent >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(100, tomorrowCapacity.capacityPercent)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Advance bookings for tomorrow&apos;s donor donation intake.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground py-2">Select hospital to view capacity</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              status === s ? 'bg-primary text-white border-primary font-medium' : 'bg-card text-muted-foreground border-border hover:bg-muted/50'
            }`}
          >
            {s === '' ? 'All' : (LABEL[s] || s)}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Donor</TableHead>
                <TableHead>Blood</TableHead>
                <TableHead>Hospital</TableHead>
                <TableHead>Offered / Scheduled Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7}><Loading /></TableCell></TableRow>
              ) : appts.length === 0 ? (
                <TableRow><TableCell colSpan={7}><EmptyState icon={CalendarCheck} title={`No appointments${status ? ` (${LABEL[status] || status})` : ''}`} hint="Donor appointment requests will appear here to accept and assign times." /></TableCell></TableRow>
              ) : (
                appts.map((a) => (
                  <TableRow key={a._id}>
                    <TableCell>
                      <div className="font-medium text-gray-900">{a.donorId?.name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{a.donorId?.phone}</div>
                      {(a.donorId?.ninMasked || a.donorNinMasked) && (
                        <div className="text-[11px] font-mono text-emerald-700 font-semibold">NIN: {a.donorId?.ninMasked || a.donorNinMasked}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 font-bold text-red-600">
                        <Droplet className="h-4 w-4 fill-red-600" /> {a.donorId?.bloodGroup}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{a.hospitalId?.name || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {a.status === 'scheduled' ? (
                        <div className="space-y-0.5">
                          <div className="font-semibold text-gray-900 flex items-center gap-1">
                            <span>{new Date(a.assignedDate || a.appointmentDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                            {a.assignedTime && (
                              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.2 rounded text-xs font-bold">
                                ⏰ {a.assignedTime}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">Confirmed by blood bank</div>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="font-medium text-gray-800">
                            {a.preferredDay
                              ? new Date(a.preferredDay + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                              : a.appointmentDate ? new Date(a.appointmentDate).toLocaleDateString() : 'Earliest open day'}
                          </div>
                          <div className="text-xs capitalize text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded inline-block font-medium">
                            {a.preferredWindow ? `${a.preferredWindow} window` : 'Awaiting time assignment'}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{badge(a.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px]">{a.notes || <span className="text-muted-foreground/60">—</span>}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {/* Pending Offer: Admin gives time & schedules */}
                        {a.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white font-semibold"
                              onClick={() => openScheduleModal(a)}
                            >
                              <Clock className="h-4 w-4 mr-1" /> Accept &amp; Give Time
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setStatusFor(a._id, 'cancelled')}
                            >
                              Decline
                            </Button>
                          </>
                        )}

                        {/* Scheduled: Allow Recording Donation or Marking Complete */}
                        {a.status === 'scheduled' && (
                          <>
                            {a.donorId?.eligibilityStatus === 'eligible' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => recordDonation(a)}
                                disabled={recordingId === a._id}
                                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-medium"
                              >
                                <HeartHandshake className="h-4 w-4 mr-1" />
                                {recordingId === a._id ? 'Recording…' : 'Record donation'}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setStatusFor(a._id, 'completed')}
                            >
                              Completed
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-700 text-xs"
                              onClick={() => setStatusFor(a._id, 'cancelled')}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Schedule Appointment & Capacity Management Modal */}
      <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900">
              <Clock className="h-5 w-5 text-red-600" />
              Schedule Donation &amp; Assign Time
            </DialogTitle>
            <DialogDescription>
              Assign the confirmed appointment date and exact time slot for this voluntary donor while maintaining hospital phlebotomy capacity.
            </DialogDescription>
          </DialogHeader>

          {schedulingAppt && (
            <form onSubmit={handleConfirmSchedule} className="space-y-4 py-2">
              {/* Donor Summary Header */}
              <div className="p-3 bg-muted/60 rounded-xl flex items-center justify-between text-xs border border-border">
                <div>
                  <p className="font-bold text-gray-900 text-sm">{schedulingAppt.donorId?.name}</p>
                  <p className="text-muted-foreground">{schedulingAppt.donorId?.phone}</p>
                  {schedulingAppt.preferredDay && (
                    <p className="text-blue-700 font-medium mt-0.5">Offered day: {schedulingAppt.preferredDay}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-full text-xs">
                    <Droplet className="h-3.5 w-3.5 fill-red-600" /> {schedulingAppt.donorId?.bloodGroup}
                  </span>
                </div>
              </div>

              {/* Date Selection */}
              <div>
                <Label htmlFor="scheduleDate">Appointment Date *</Label>
                <Input
                  id="scheduleDate"
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={scheduleDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>

              {/* Live Capacity Determination & Overbooking Alert */}
              <div className="rounded-xl border border-border p-3.5 bg-card space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1 text-gray-800">
                    <Users className="h-3.5 w-3.5 text-primary" /> Hospital Phlebotomy Capacity
                  </span>
                  {modalCapacityLoading ? (
                    <span className="text-muted-foreground text-[11px]">Checking capacity…</span>
                  ) : modalCapacity ? (
                    <span className={modalCapacity.isOverbooked ? 'text-red-600 font-bold' : modalCapacity.capacityPercent >= 80 ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}>
                      {modalCapacity.totalBooked} / {modalCapacity.dailyCapacity} booked ({modalCapacity.remainingSlots} slots free)
                    </span>
                  ) : null}
                </div>

                {modalCapacity && (
                  <>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all ${modalCapacity.isOverbooked ? 'bg-red-600' : modalCapacity.capacityPercent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, modalCapacity.capacityPercent)}%` }}
                      />
                    </div>

                    {modalCapacity.isOverbooked ? (
                      <div className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs text-red-900 space-y-2 mt-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                          <div>
                            <strong className="text-red-950">Capacity Reached ({modalCapacity.totalBooked}/{modalCapacity.dailyCapacity}):</strong>
                            <p className="mt-0.5 text-red-800 leading-relaxed text-[11px]">
                              This date is already fully booked. Scheduling additional donors may overwhelm phlebotomy staff, deplete sterile supplies, or cause long wait times.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1 border-t border-red-200">
                          <input
                            type="checkbox"
                            id="overrideCheck"
                            checked={overrideCapacity}
                            onChange={(e) => setOverrideCapacity(e.target.checked)}
                            className="rounded border-red-300 text-red-600 focus:ring-red-500 cursor-pointer"
                          />
                          <label htmlFor="overrideCheck" className="text-xs font-semibold text-red-950 cursor-pointer">
                            Override Capacity (Extra phlebotomy staff available)
                          </label>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Safe capacity: Hospital phlebotomy can accommodate this donor.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Time Slot Picker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Assign Time Slot *</Label>
                  <span className="text-xs text-muted-foreground font-mono font-bold text-red-600">{scheduleTime}</span>
                </div>

                {/* Quick Chips for Morning & Afternoon */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground">Morning Slots (8:30 AM – 12:00 PM):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {MORNING_SLOTS.map((t) => {
                      const bookedInSlot = modalCapacity?.slotCounts?.[t] || 0;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setScheduleTime(t)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                            scheduleTime === t
                              ? 'bg-red-600 text-white border-red-600 shadow-xs'
                              : 'bg-card text-gray-700 border-border hover:bg-muted/60'
                          }`}
                        >
                          {t} {bookedInSlot > 0 && <span className="opacity-75 text-[10px]">({bookedInSlot})</span>}
                        </button>
                      );
                    })}
                  </div>

                  <div className="text-[11px] font-semibold text-muted-foreground pt-1">Afternoon Slots (1:00 PM – 4:00 PM):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {AFTERNOON_SLOTS.map((t) => {
                      const bookedInSlot = modalCapacity?.slotCounts?.[t] || 0;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setScheduleTime(t)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                            scheduleTime === t
                              ? 'bg-red-600 text-white border-red-600 shadow-xs'
                              : 'bg-card text-gray-700 border-border hover:bg-muted/60'
                          }`}
                        >
                          {t} {bookedInSlot > 0 && <span className="opacity-75 text-[10px]">({bookedInSlot})</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-1">
                  <Input
                    type="text"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    placeholder="Or type custom time (e.g. 10:15 AM)"
                    className="text-xs"
                    required
                  />
                </div>
              </div>

              {/* Instructions / Notes for Donor */}
              <div>
                <Label htmlFor="schedNotes">Instructions for Donor (Optional)</Label>
                <Input
                  id="schedNotes"
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  placeholder="e.g. Report to Blood Bank Unit on 1st Floor; fast 2 hours prior"
                  className="mt-1 text-xs"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setScheduleModalOpen(false)}
                  disabled={savingSchedule}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingSchedule || (Boolean(modalCapacity?.isOverbooked) && !overrideCapacity)}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {savingSchedule ? 'Scheduling & Notifying…' : 'Confirm & Notify Donor'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

