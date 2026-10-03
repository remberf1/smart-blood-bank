'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import apiClient from '../../api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Droplet, ArrowLeft, CheckCircle2, ShieldCheck, Mail, MessageSquare, RefreshCw, AlertCircle } from 'lucide-react';

function VerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialEmail = searchParams.get('email') || '';
  const initialPhone = searchParams.get('phone') || '';
  const initialToken = searchParams.get('token') || '';
  const initialCode = searchParams.get('code') || '';

  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [autoVerifying, setAutoVerifying] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [verified, setVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [infoBanner, setInfoBanner] = useState('');

  // Handle countdown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Auto-verify if email token is present in URL
  useEffect(() => {
    if (initialToken && initialEmail && !verified) {
      setAutoVerifying(true);
      apiClient
        .get(`/donor/auth/verify-link?token=${encodeURIComponent(initialToken)}&email=${encodeURIComponent(initialEmail)}`)
        .then((res) => {
          if (res.data.token) {
            localStorage.setItem('donorToken', res.data.token);
          }
          setVerified(true);
          setSuccessMsg(res.data.message || 'Email verified successfully! Welcome to Smart Blood Bank.');
          setTimeout(() => {
            router.push('/donor/dashboard');
          }, 2000);
        })
        .catch((err) => {
          setError(err.response?.data?.error || 'Verification link expired or invalid. Please enter OTP or request a new code.');
        })
        .finally(() => {
          setAutoVerifying(false);
        });
    }
  }, [initialToken, initialEmail, router, verified]);

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!code || code.trim().length !== 6) {
      setError('Please enter the 6-digit OTP code.');
      return;
    }
    setError('');
    setInfoBanner('');
    setLoading(true);

    try {
      const res = await apiClient.post('/donor/auth/verify-code', {
        email: email ? email.trim().toLowerCase() : undefined,
        phone: phone ? phone.trim() : undefined,
        code: code.trim(),
      });

      if (res.data.token) {
        localStorage.setItem('donorToken', res.data.token);
      }
      setVerified(true);
      setSuccessMsg(res.data.message || 'Account verified successfully!');
      setTimeout(() => {
        router.push('/donor/dashboard');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    if (!email && !phone) {
      setError('Please provide your email or phone number to resend verification.');
      return;
    }

    setError('');
    setResending(true);
    try {
      const res = await apiClient.post('/donor/auth/resend-code', {
        email: email ? email.trim().toLowerCase() : undefined,
        phone: phone ? phone.trim() : undefined,
      });
      setInfoBanner(res.data.message || 'New verification code and email link sent successfully.');
      setResendCooldown(60); // 60s cooldown
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not resend verification code. Please try again shortly.');
    } finally {
      setResending(false);
    }
  };

  const maskEmail = (str: string) => {
    if (!str || !str.includes('@')) return str;
    const [name, domain] = str.split('@');
    if (name.length <= 2) return `**@${domain}`;
    return `${name.slice(0, 2)}***@${domain}`;
  };

  const maskPhone = (str: string) => {
    if (!str) return '';
    const clean = str.replace(/\s+/g, '');
    if (clean.length < 7) return clean;
    return `${clean.slice(0, 4)}****${clean.slice(-3)}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link href="/donor/login" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 mb-4 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to donor login
        </Link>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-2 shadow-xs">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900">
              Verify Your Donor Account
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-1">
              Confirm your contact details to activate your voluntary donor pass and enable emergency life-saving SOS alerts.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {autoVerifying && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-center gap-3">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
                <span>Confirming your email verification link…</span>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {infoBanner && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{infoBanner}</span>
              </div>
            )}

            {verified ? (
              <div className="text-center py-6 space-y-3">
                <div className="mx-auto w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600 animate-in zoom-in-75 duration-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Account Activated!</h3>
                <p className="text-xs text-slate-600 max-w-xs mx-auto">
                  {successMsg || 'Your donor account is fully verified. Redirecting to your dashboard…'}
                </p>
                <div className="pt-2">
                  <Button
                    onClick={() => router.push('/donor/dashboard')}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  >
                    Go to Donor Dashboard →
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-2">
                    <MessageSquare className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-700">WhatsApp / SMS</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {phone ? maskPhone(phone) : 'Your mobile number'}
                      </div>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-2">
                    <Mail className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-700">Email Address</div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5" title={email}>
                        {email ? maskEmail(email) : 'Your email'}
                      </div>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        Enter 6-Digit OTP Code
                      </label>
                      <span className="text-[11px] text-slate-400">Valid for 15 mins</span>
                    </div>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      autoFocus
                      placeholder="e.g. 481920"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      className="text-center font-mono text-xl tracking-widest h-12"
                      required
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Check your WhatsApp messages or SMS for the 6-digit one-time passcode.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium h-10 shadow-xs"
                    disabled={loading || code.length !== 6}
                  >
                    {loading ? 'Verifying Code…' : 'Verify & Activate Account'}
                  </Button>
                </form>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Didn&apos;t receive the code?</span>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0 || resending}
                    className="font-medium text-red-600 hover:text-red-700 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                  >
                    {resending ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                  </button>
                </div>

                <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                  <strong>💡 Pro-tip:</strong> You can also verify by clicking the confirmation link sent directly to your inbox. Once verified, your donor digital pass will be immediately generated.
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DonorVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-red-500" />
            Loading verification portal…
          </div>
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  );
}
