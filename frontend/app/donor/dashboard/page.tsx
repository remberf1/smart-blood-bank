'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '../../api/client';

interface DonorProfile {
  _id: string;
  name: string;
  email: string;
  phone: string;
  bloodGroup: string;
  eligibilityStatus: string;
  lastDonationDate: string | null;
  sosOptIn: boolean;
  createdAt: string;
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
  status: string;
  notes?: string;
}

export default function DonorDashboard() {
  const [donor, setDonor] = useState<DonorProfile | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ hospitalId: '', appointmentDate: '', notes: '' });
  const [message, setMessage] = useState('');
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('donorToken');
    if (!token) {
      router.push('/donor/login');
      return;
    }
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    Promise.all([
      apiClient.get('/donor/auth/profile'),
      apiClient.get('/hospitals'),
      apiClient.get('/donor/appointments'),
    ])
      .then(([profileRes, hospitalsRes, appointmentsRes]) => {
        setDonor(profileRes.data);
        setHospitals(hospitalsRes.data);
        setAppointments(appointmentsRes.data);
      })
      .catch(() => {
        localStorage.removeItem('donorToken');
        router.push('/donor/login');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/donor/appointments', formData);
      setMessage('Appointment scheduled!');
      setFormData({ hospitalId: '', appointmentDate: '', notes: '' });
      // Refresh appointments list
      const appointmentsRes = await apiClient.get('/donor/appointments');
      setAppointments(appointmentsRes.data);
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Failed to schedule');
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this appointment?')) return;
    try {
      await apiClient.delete(`/donor/appointments/${id}`);
      setMessage('Appointment cancelled');
      const appointmentsRes = await apiClient.get('/donor/appointments');
      setAppointments(appointmentsRes.data);
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Failed to cancel');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('donorToken');
    router.push('/donor/login');
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!donor) return null;

  const lastDonation = donor.lastDonationDate
    ? new Date(donor.lastDonationDate).toLocaleDateString()
    : 'Never';
  const eligibilityColor =
    donor.eligibilityStatus === 'eligible'
      ? 'text-green-600'
      : donor.eligibilityStatus === 'deferred'
      ? 'text-yellow-600'
      : 'text-gray-600';

  const futureAppointments = appointments.filter(a => a.status === 'scheduled' && new Date(a.appointmentDate) > new Date());
  const pastAppointments = appointments.filter(a => a.status !== 'scheduled' || new Date(a.appointmentDate) <= new Date());

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Donor Dashboard</h1>
        <button
          onClick={handleLogout}
          className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
        >
          Logout
        </button>
      </div>

      {message && (
        <div className="mb-4 p-2 bg-blue-100 text-blue-800 rounded">{message}</div>
      )}

      {/* Profile Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Profile</h2>
        <p><strong>Name:</strong> {donor.name}</p>
        <p><strong>Email:</strong> {donor.email}</p>
        <p><strong>Phone:</strong> {donor.phone}</p>
        <p><strong>Blood Group:</strong> {donor.bloodGroup}</p>
        <p><strong>Eligibility Status:</strong> <span className={eligibilityColor}>{donor.eligibilityStatus}</span></p>
        <p><strong>Last Donation:</strong> {lastDonation}</p>
        <p><strong>SOS Opt‑In:</strong> {donor.sosOptIn ? 'Yes' : 'No'}</p>
      </div>

      {/* Schedule Appointment Form */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Schedule a Donation Appointment</h2>
        <form onSubmit={handleSchedule} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Hospital</label>
            <select
              value={formData.hospitalId}
              onChange={(e) => setFormData({ ...formData, hospitalId: e.target.value })}
              className="w-full p-2 border rounded"
              required
            >
              <option value="">Select Hospital</option>
              {hospitals.map((h) => (
                <option key={h._id} value={h._id}>
                  {h.name} – {h.address}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Appointment Date & Time</label>
            <input
              type="datetime-local"
              value={formData.appointmentDate}
              onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
              className="w-full p-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Notes (optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full p-2 border rounded"
              rows={2}
            />
          </div>
          <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
            Schedule
          </button>
        </form>
      </div>

      {/* Upcoming Appointments */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Upcoming Appointments</h2>
        {futureAppointments.length === 0 ? (
          <p className="text-gray-500">No upcoming appointments.</p>
        ) : (
          <ul className="divide-y">
            {futureAppointments.map((apt) => (
              <li key={apt._id} className="py-3 flex justify-between items-center">
                <div>
                  <p className="font-medium">{apt.hospitalId?.name}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(apt.appointmentDate).toLocaleString()} – {apt.status}
                  </p>
                  {apt.notes && <p className="text-sm">Note: {apt.notes}</p>}
                </div>
                {apt.status === 'scheduled' && (
                  <button
                    onClick={() => handleCancel(apt._id)}
                    className="text-red-600 text-sm hover:underline"
                  >
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Past Appointments (optional) */}
      {pastAppointments.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Past Appointments</h2>
          <ul className="divide-y">
            {pastAppointments.map((apt) => (
              <li key={apt._id} className="py-3">
                <p className="font-medium">{apt.hospitalId?.name}</p>
                <p className="text-sm text-gray-500">
                  {new Date(apt.appointmentDate).toLocaleString()} – {apt.status}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}