import Link from 'next/link';
import {
  Droplet,
  Wind,
  Siren,
  MessageSquare,
  Truck,
  QrCode,
  ArrowRight,
  CheckCircle2,
  Activity,
  ShieldCheck,
  PhoneCall,
  Search,
  Users,
} from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* Navigation Header */}
      <header className="border-b bg-white/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-red-600 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-sm">
              🩸
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900">
              Smart <span className="text-red-600">Blood Bank</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/track"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 hidden md:inline-block mr-1"
            >
              Track Request
            </Link>
            <Link
              href="/donor/login"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3.5 py-1.5 rounded-xl transition-colors shadow-2xs"
            >
              <Droplet className="h-3.5 w-3.5 fill-red-600 text-red-600" />
              <span>Donor Portal</span>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold bg-gray-900 hover:bg-black text-white px-3.5 py-1.5 rounded-xl shadow-xs transition-colors"
            >
              <span>Hospital Staff</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-red-50/70 via-white to-white py-16 sm:py-20 px-4 border-b">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold mb-6">
            <Activity className="h-3.5 w-3.5 text-red-600 animate-pulse" />
            Next-Gen Emergency Resource Network
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
            Blood and oxygen, <span className="text-red-600">when every minute counts.</span>
          </h1>
          <p className="mt-5 text-gray-600 text-base sm:text-xl max-w-2xl mx-auto leading-relaxed">
            Find available blood units near you, request emergency resources, coordinate bedside delivery,
            and get instant updates via WhatsApp and Email.
          </p>

          {/* Primary Action Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3.5 justify-center items-center">
            <Link
              href="/request"
              className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-7 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 shadow-md shadow-red-600/20 transition-all gap-2"
            >
              <Droplet className="h-4 w-4 fill-white" /> Request Blood or Oxygen
            </Link>
            <Link
              href="/donor/register"
              className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-7 rounded-xl border-2 border-gray-200 text-gray-800 font-semibold hover:border-gray-300 hover:bg-gray-50 transition-all gap-2"
            >
              <Users className="h-4 w-4 text-red-600" /> Become a Donor
            </Link>
          </div>

          {/* Emergency SOS Banner */}
          <div className="mt-6 flex justify-center">
            <Link
              href="/sos"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-red-100/90 text-red-800 font-semibold text-sm border border-red-200 hover:bg-red-200 transition-all shadow-sm group"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
              </span>
              <span>🚨 Critical Emergency? <strong>Trigger Instant SOS to Donors & Hospital Admins</strong></span>
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform text-red-700" />
            </Link>
          </div>

          {/* Quick Utility Links */}
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 justify-center text-sm font-medium text-gray-500">
            <Link href="/track" className="hover:text-red-600 flex items-center gap-1.5 transition-colors">
              <Search className="h-3.5 w-3.5" /> Track a request
            </Link>
            <span className="text-gray-300">•</span>
            <Link href="/education" className="hover:text-red-600 flex items-center gap-1.5 transition-colors">
              <ShieldCheck className="h-3.5 w-3.5" /> Eligibility & Education
            </Link>
            <span className="text-gray-300">•</span>
            <Link href="/donor/login" className="hover:text-red-600 flex items-center gap-1.5 transition-colors">
              <QrCode className="h-3.5 w-3.5" /> Digital Donor Pass
            </Link>
          </div>
        </div>
      </section>

      {/* Role-Based Portal Selectors — Obvious Navigation for Donors vs Hospital Staff */}
      <section className="max-w-5xl mx-auto px-4 -mt-7 sm:-mt-9 mb-6 z-10 relative">
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Card 1: Donors */}
          <div className="bg-white rounded-2xl border-2 border-red-100 p-5 shadow-sm hover:border-red-300 hover:shadow-md transition-all flex flex-col justify-between">
            <div className="flex items-start gap-3.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-red-600">For Voluntary Donors</span>
                <h3 className="font-bold text-gray-900 text-base">Blood Donor Portal</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Access your verified QR donor pass, book hospital donation appointments, track eligibility, and get your certificate.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <Link
                href="/donor/login"
                className="flex-1 text-center py-2 px-3 rounded-lg bg-red-600 text-white font-semibold text-xs hover:bg-red-700 transition-colors"
              >
                Sign In as Donor →
              </Link>
              <Link
                href="/donor/register"
                className="flex-1 text-center py-2 px-3 rounded-lg border border-gray-300 text-gray-700 font-semibold text-xs hover:bg-gray-50 transition-colors"
              >
                Register as Donor
              </Link>
            </div>
          </div>

          {/* Card 2: Hospital Staff */}
          <div className="bg-white rounded-2xl border-2 border-gray-200 p-5 shadow-sm hover:border-gray-400 hover:shadow-md transition-all flex flex-col justify-between">
            <div className="flex items-start gap-3.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-800 flex items-center justify-center shrink-0">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">For Clinical & Medical Teams</span>
                <h3 className="font-bold text-gray-900 text-base">Hospital Staff & Lab Dashboard</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Manage blood bags & oxygen cylinders, verify donor QR passes, triage emergency requests, and manage inventory.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <Link
                href="/login"
                className="w-full block text-center py-2 px-3 rounded-lg bg-gray-900 text-white font-semibold text-xs hover:bg-black transition-colors"
              >
                Hospital Staff Sign In →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* System Capabilities Showcase ("What It Can Do") */}
      <section className="py-16 px-4 bg-gray-50/70">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-xs font-bold uppercase tracking-wider text-red-600 mb-2">
              System Capabilities
            </h2>
            <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Everything Smart Blood Bank can do for patients, donors & hospitals.
            </p>
            <p className="mt-3 text-gray-600 text-sm sm:text-base">
              A fully integrated healthcare infrastructure designed to eliminate blood shortages, prevent inventory expiration, and expedite life-saving interventions.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1: Real-Time FEFO Blood Matching */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center text-red-600 mb-4">
                <Droplet className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Smart Compatibility & FEFO Matching
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                Advanced ABO and Rhesus compatibility algorithm matching universal donors (O-) and specific plasma recipients. First-Expiry-First-Out (FEFO) batch tracking prevents unit wastage across hospitals.
              </p>
              <div className="flex items-center gap-1 text-xs font-semibold text-red-600">
                <CheckCircle2 className="h-4 w-4" /> Zero-spoilage inventory rotation
              </div>
            </div>

            {/* Feature 2: Hospital Oxygen Cylinder Tracking */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-cyan-100 rounded-xl flex items-center justify-center text-cyan-600 mb-4">
                <Wind className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Hospital Oxygen Reserve Tracking
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                Real-time visibility into medical oxygen cylinder stocks (Full, In-Use, and Empty) across partner hospitals, with direct blood bank contact lines and turn-by-turn navigation.
              </p>
              <div className="flex items-center gap-1 text-xs font-semibold text-cyan-700">
                <CheckCircle2 className="h-4 w-4" /> Real-time cylinder fill monitoring
              </div>
            </div>

            {/* Feature 3: Geofenced SOS Emergency Dual-Dispatch */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600 mb-4">
                <Siren className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Instant Geofenced SOS Alerts
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                One-click emergency broadcast that searches within 15–50km and dispatches high-priority WhatsApp and Email alerts to compatible donors and hospital staff simultaneously.
              </p>
              <div className="flex items-center gap-1 text-xs font-semibold text-rose-700">
                <CheckCircle2 className="h-4 w-4" /> Dual WhatsApp & Email dispatch
              </div>
            </div>

            {/* Feature 4: WhatsApp Interactive Bot */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-4">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                24/7 WhatsApp Interactive Bot
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                No mobile app or mobile internet required. Check blood and oxygen inventory, register as a volunteer donor, trigger emergency alerts, and view commands directly inside WhatsApp.
              </p>
              <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Zero-data on-demand access
              </div>
            </div>

            {/* Feature 5: Clinical Cold-Chain & Bedside Delivery */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-4">
                <Truck className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Cold-Chain & Bedside Tracking
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                Track each requisition through every clinical phase: Requisition, Allocation, Cold-Chain Dispatch with digital handover slips, Arrival, and Bedside Transfusion completion.
              </p>
              <div className="flex items-center gap-1 text-xs font-semibold text-blue-700">
                <CheckCircle2 className="h-4 w-4" /> Verifiable digital handover slips
              </div>
            </div>

            {/* Feature 6: Digital Donor Pass & Clinical Vitals */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 mb-4">
                <QrCode className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Digital Donor Pass & Clinical Vitals
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                Registered donors get a cryptographically verifiable QR Pass for instant hospital check-in, pre-donation clinical screening records (weight, hemoglobin, TTI), and voluntary certificates.
              </p>
              <div className="flex items-center gap-1 text-xs font-semibold text-purple-700">
                <CheckCircle2 className="h-4 w-4" /> QR check-in & donor certificates
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 bg-white border-t">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-xs font-bold uppercase tracking-wider text-red-600 mb-2">How It Works</h2>
            <p className="text-2xl sm:text-3xl font-extrabold text-gray-900">Saving lives in 3 simple steps</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-8 text-center relative">
            <div className="space-y-3">
              <div className="w-14 h-14 bg-red-50 border-2 border-red-600 text-red-600 rounded-2xl flex items-center justify-center text-xl font-bold mx-auto">
                1
              </div>
              <h3 className="font-bold text-gray-900">Request or Alert</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Submit a blood or oxygen requisition via web or trigger an emergency SOS from your phone.
              </p>
            </div>

            <div className="space-y-3">
              <div className="w-14 h-14 bg-red-50 border-2 border-red-600 text-red-600 rounded-2xl flex items-center justify-center text-xl font-bold mx-auto">
                2
              </div>
              <h3 className="font-bold text-gray-900">Automated Match</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Our algorithm matches the closest hospital stock or alerts compatible donors within 15–50km instantly.
              </p>
            </div>

            <div className="space-y-3">
              <div className="w-14 h-14 bg-red-50 border-2 border-red-600 text-red-600 rounded-2xl flex items-center justify-center text-xl font-bold mx-auto">
                3
              </div>
              <h3 className="font-bold text-gray-900">Delivery & Transfusion</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Track temperature-monitored cold-chain dispatch directly to the patient&apos;s hospital bedside.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto bg-gray-900 text-gray-400 py-12 px-4 text-sm">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🩸</span>
            <span className="text-white font-bold tracking-tight">Smart Blood Bank &bull; Nigeria</span>
          </div>
          <div className="flex flex-wrap gap-6 text-xs text-gray-400">
            <Link href="/request" className="hover:text-white transition-colors">Request Resources</Link>
            <Link href="/sos" className="hover:text-white transition-colors">Emergency SOS</Link>
            <Link href="/track" className="hover:text-white transition-colors">Track Request</Link>
            <Link href="/donor/login" className="hover:text-white transition-colors">Donor Portal</Link>
            <Link href="/education" className="hover:text-white transition-colors">Donor Eligibility</Link>
            <Link href="/login" className="text-red-400 hover:text-red-300 transition-colors">Hospital Dashboard</Link>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-6 pt-6 border-t border-gray-800 text-center text-xs text-gray-500">
          Open-access healthcare emergency logistics platform dedicated to zero preventable blood and oxygen crisis casualties.
        </div>
      </footer>
    </div>
  );
}
