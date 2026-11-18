import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
import {
  ArrowRight,
  Bookmark,
  LogIn,
  LogOut,
  Mail,
  PenSquare,
  ShieldCheck,
  Smartphone,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useSite } from '../context/SiteContext';
import { isAdminEmail } from '../lib/editorialRules';
import {
  createPhoneRecaptcha,
  normalizePhoneNumberInput,
  sendPhoneOtpCode,
} from '../lib/firebase';
import type { AuthUser } from '../types/publication';
import { BrandLogo } from './BrandLogo';
import { GoogleGIcon } from './GoogleGIcon';

type Channel = 'email' | 'phone';
type EmailAuthMode = 'signin' | 'register';

export interface LoginPanelProps {
  redirectTo?: string | null;
  onClose?: () => void;
  isModal?: boolean;
  titleId?: string;
}

function mapFirebasePhoneError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('auth/operation-not-allowed')) {
    return 'Phone sign-in is not yet enabled in Firebase Authentication. Enable Phone under Firebase Console -> Authentication -> Sign-in method, or sign in with Google or Email.';
  }
  if (raw.includes('auth/invalid-phone-number')) {
    return 'Enter a valid mobile number with country code (for example, +91 9876543210).';
  }
  if (raw.includes('auth/invalid-verification-code')) {
    return 'Incorrect OTP code. Please check the 6-digit SMS code and try again.';
  }
  if (raw.includes('auth/code-expired')) {
    return 'This OTP code has expired. Request a fresh verification code.';
  }
  if (raw.includes('auth/too-many-requests')) {
    return 'Too many OTP attempts. Please wait a few minutes or sign in with Google or Email.';
  }
  if (raw.includes('auth/captcha-check-failed') || raw.includes('auth/unauthorized-domain')) {
    return 'Domain verification for Phone OTP is restricted in this preview window. Ensure the domain is authorized in Firebase Authentication or use Email / Google sign-in.';
  }
  return err instanceof Error ? err.message : 'Unable to verify phone number.';
}

export function LoginPanel({
  redirectTo = null,
  onClose,
  isModal = false,
  titleId,
}: LoginPanelProps) {
  const {
    user,
    authLoading,
    isAdmin,
    readingList,
    registerUser,
    loginWithPassword,
    signInWithGoogle,
    completeFirebaseUserLogin,
    signOutUser,
  } = useSite();
  const navigate = useNavigate();

  const safeRedirect =
    redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '';

  const [channel, setChannel] = useState<Channel>('email');
  const [authMode, setAuthMode] = useState<EmailAuthMode>('signin');
  const [googleLoading, setGoogleLoading] = useState(false);

  // Email & password state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Phone OTP state
  const [phoneName, setPhoneName] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          // ignore cleanup errors
        }
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  const finishSuccess = (signedInUser: AuthUser | null) => {
    if (onClose) {
      onClose();
    }
    if (signedInUser && isAdminEmail(signedInUser.email)) {
      navigate('/admin');
      return;
    }
    if (safeRedirect) {
      if (safeRedirect.startsWith('/admin')) {
        navigate('/');
      } else {
        navigate(safeRedirect);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const loggedInUser = await signInWithGoogle();
      finishSuccess(loggedInUser);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In could not be completed.';
      setError(
        msg.includes('popup') || msg.includes('unauthorized-domain')
          ? 'Google Sign-In popup was blocked or unavailable in this preview frame. Please use Email or Phone Number sign-in below.'
          : msg
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const signedInUser =
        authMode === 'register'
          ? await registerUser({ fullName, email, password })
          : await loginWithPassword({ email, password });
      finishSuccess(signedInUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete authentication.');
    } finally {
      setSubmitting(false);
    }
  };

  const clearRecaptcha = () => {
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch {
        // ignore cleanup errors
      }
      recaptchaVerifierRef.current = null;
    }
  };

  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const formatted = normalizePhoneNumberInput(phoneInput);
    if (!/^\+\d{8,15}$/.test(formatted)) {
      setError('Enter a valid phone number (for example, +91 9876543210 or 10-digit mobile).');
      return;
    }
    if (!recaptchaContainerRef.current) {
      setError('Verification widget is still initializing. Please try again.');
      return;
    }

    setPhoneLoading(true);
    try {
      clearRecaptcha();
      const verifier = createPhoneRecaptcha(recaptchaContainerRef.current);
      recaptchaVerifierRef.current = verifier;
      const result = await sendPhoneOtpCode(formatted, verifier);
      setNormalizedPhone(formatted);
      setConfirmationResult(result);
    } catch (err) {
      clearRecaptcha();
      setError(mapFirebasePhoneError(err));
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    const cleanOtp = otpCode.replace(/\s+/g, '').trim();
    if (cleanOtp.length < 4) {
      setError('Enter the 6-digit OTP code sent to your mobile number.');
      return;
    }

    setError(null);
    setPhoneLoading(true);
    try {
      const credential = await confirmationResult.confirm(cleanOtp);
      const signedInUser = await completeFirebaseUserLogin(
        credential.user,
        phoneName.trim() || undefined
      );
      clearRecaptcha();
      finishSuccess(signedInUser);
    } catch (err) {
      setError(mapFirebasePhoneError(err));
    } finally {
      setPhoneLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Verifying reader session...
      </div>
    );
  }

  if (user) {
    return (
      <div className="bg-[#FAF9F6] dark:bg-[#181818] p-7 sm:p-9">
        <div className="flex flex-col items-center text-center pb-5 mb-5 border-b border-neutral-300 dark:border-neutral-700">
          <BrandLogo className="h-16 sm:h-20 w-auto mb-4" />
          <div className="inline-flex items-center justify-center gap-2 text-[#8C1D24] dark:text-[#eb7a80] mb-1.5">
            {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
            <span className="text-xs font-bold uppercase tracking-[0.18em]">
              {isAdmin ? 'Administrator Session Active' : 'Reader & Contributor Session Active'}
            </span>
          </div>

          <h2 id={titleId} className="font-serif text-2xl sm:text-3xl font-bold text-neutral-950 dark:text-neutral-50">
            Welcome, {user.fullName}
          </h2>
        </div>

        <div className="mt-4 border-t border-b border-neutral-300 dark:border-neutral-700 py-4 space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
          {user.email && (
            <p>
              <span className="font-semibold text-neutral-950 dark:text-neutral-100">Email:</span> {user.email}
            </p>
          )}
          {user.phoneNumber && (
            <p>
              <span className="font-semibold text-neutral-950 dark:text-neutral-100">Phone:</span> {user.phoneNumber}
            </p>
          )}
          <p>
            <span className="font-semibold text-neutral-950 dark:text-neutral-100">Access Level:</span>{' '}
            {isAdmin
              ? 'Administrator (Full Editorial & Publication Control)'
              : 'Reader & Contributor'}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/reading-list"
            onClick={() => onClose?.()}
            data-testid="login-panel-reading-list-link"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#111111] dark:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold uppercase tracking-wider hover:bg-[#8C1D24] dark:hover:bg-[#8C1D24] dark:hover:text-white transition-colors"
          >
            <Bookmark className="w-4 h-4" />
            <span>Reading List ({readingList.length})</span>
          </Link>

          <Link
            to="/publish-your-writing"
            onClick={() => onClose?.()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#8C1D24] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#6e151a] transition-colors"
          >
            <PenSquare className="w-4 h-4" />
            <span>Publish Your Writing</span>
          </Link>

          {isAdmin && (
            <Link
              to="/admin"
              onClick={() => onClose?.()}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-neutral-900 dark:border-neutral-400 text-neutral-900 dark:text-neutral-100 text-xs font-semibold uppercase tracking-wider hover:bg-neutral-900 dark:hover:bg-neutral-100 hover:text-white dark:hover:text-neutral-950 transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Admin Console</span>
            </Link>
          )}

          <button
            type="button"
            onClick={async () => {
              await signOutUser();
              onClose?.();
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-neutral-900 dark:border-neutral-400 text-xs font-semibold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 hover:bg-neutral-900 dark:hover:bg-neutral-100 hover:text-white dark:hover:text-neutral-950 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        isModal
          ? 'bg-white dark:bg-[#181818] p-6 sm:p-8'
          : 'border-2 border-neutral-950 dark:border-neutral-600 bg-white dark:bg-[#181818] p-7 sm:p-9'
      }
    >
      <div className="flex flex-col items-center text-center pb-5 mb-5 border-b border-neutral-200 dark:border-neutral-800">
        <BrandLogo className="h-16 sm:h-20 w-auto mb-3.5" />
        <h2
          id={titleId}
          className="text-xs font-bold uppercase tracking-[0.18em] text-[#8C1D24] dark:text-[#eb7a80]"
        >
          Reader &amp; Contributor Access
        </h2>
      </div>

      {/* Google Login */}
      <div className="mt-5">
        <button
          type="button"
          data-testid="google-signin-btn"
          disabled={googleLoading}
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 px-5 py-3 bg-white dark:bg-neutral-50 text-neutral-950 border border-neutral-900 dark:border-neutral-300 text-xs font-semibold uppercase tracking-wider hover:bg-neutral-100 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50"
        >
          <GoogleGIcon className="w-4 h-4 shrink-0" />
          <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0 text-neutral-600" />
        </button>
      </div>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
          Or Continue With
        </span>
        <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
      </div>

      {/* Primary Method Toggle: Email vs Phone Number */}
      <div className="grid grid-cols-2 border border-neutral-900 dark:border-neutral-600 text-xs font-semibold">
        <button
          type="button"
          data-testid="login-method-email"
          onClick={() => {
            setChannel('email');
            setError(null);
          }}
          className={`py-2.5 px-3 flex items-center justify-center gap-2 transition-colors ${
            channel === 'email'
              ? 'bg-[#111111] dark:bg-neutral-100 text-white dark:text-neutral-950'
              : 'bg-white dark:bg-[#1e1e1e] text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#262626]'
          }`}
        >
          <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Email</span>
        </button>
        <button
          type="button"
          data-testid="login-method-phone"
          onClick={() => {
            setChannel('phone');
            setError(null);
          }}
          className={`py-2.5 px-3 flex items-center justify-center gap-2 border-l border-neutral-900 dark:border-neutral-600 transition-colors ${
            channel === 'phone'
              ? 'bg-[#111111] dark:bg-neutral-100 text-white dark:text-neutral-950'
              : 'bg-white dark:bg-[#1e1e1e] text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#262626]'
          }`}
        >
          <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Phone Number</span>
        </button>
      </div>

      {channel === 'email' ? (
        <div className="mt-4">
          <div className="grid grid-cols-2 border border-neutral-300 dark:border-neutral-700 text-xs font-semibold">
            <button
              type="button"
              data-testid="login-mode-signin"
              onClick={() => {
                setAuthMode('signin');
                setError(null);
              }}
              className={`py-2 px-2 inline-flex items-center justify-center gap-1.5 transition-colors ${
                authMode === 'signin'
                  ? 'bg-[#111111] dark:bg-neutral-100 text-white dark:text-neutral-950'
                  : 'bg-[#FAF9F6] dark:bg-[#202020] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#2a2a2a]'
              }`}
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              data-testid="login-mode-register"
              onClick={() => {
                setAuthMode('register');
                setError(null);
              }}
              className={`py-2 px-2 inline-flex items-center justify-center gap-1.5 border-l border-neutral-300 dark:border-neutral-700 transition-colors ${
                authMode === 'register'
                  ? 'bg-[#8C1D24] text-white'
                  : 'bg-[#FAF9F6] dark:bg-[#202020] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#2a2a2a]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Create Account</span>
            </button>
          </div>

          <form
            onSubmit={handleCredentialSubmit}
            className="mt-3 space-y-3 bg-[#FAF9F6] dark:bg-[#141414] border border-neutral-200 dark:border-neutral-700 p-4"
          >
            {authMode === 'register' && (
              <>
                <p className="text-[11px] text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-[#8C1D24] dark:text-[#eb7a80] shrink-0" />
                  <span>Create a free writer account to compose and submit articles.</span>
                </p>

                <div>
                  <label
                    htmlFor="login-fullname"
                    className="block text-[11px] font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-1"
                  >
                    Full Name
                  </label>
                  <input
                    id="login-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Ananya Sharma"
                    className="w-full bg-white dark:bg-[#1e1e1e] border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-300"
                  />
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="block text-[11px] font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-1"
              >
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="writer@example.com"
                className="w-full bg-white dark:bg-[#1e1e1e] border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-300"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-[11px] font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-1"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                minLength={authMode === 'register' ? 6 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  authMode === 'register' ? 'Minimum 6 characters' : 'Enter your password'
                }
                className="w-full bg-white dark:bg-[#1e1e1e] border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-300"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs font-medium text-[#8C1D24] dark:text-[#eb7a80]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-[#8C1D24] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#6e151a] transition-colors disabled:opacity-50"
            >
              {submitting
                ? 'Processing...'
                : authMode === 'register'
                  ? 'Create Account & Continue'
                  : 'Sign In'}
            </button>
          </form>
        </div>
      ) : (
        <div className="mt-4 bg-[#FAF9F6] dark:bg-[#141414] border border-neutral-200 dark:border-neutral-700 p-4 space-y-3">
          {!confirmationResult ? (
            <form onSubmit={handleSendPhoneOtp} className="space-y-3">
              <div>
                <label
                  htmlFor="phone-fullname"
                  className="block text-[11px] font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-1"
                >
                  Full Name (Optional)
                </label>
                <input
                  id="phone-fullname"
                  type="text"
                  value={phoneName}
                  onChange={(e) => setPhoneName(e.target.value)}
                  placeholder="e.g. Ananya Sharma"
                  className="w-full bg-white dark:bg-[#1e1e1e] border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-300"
                />
              </div>

              <div>
                <label
                  htmlFor="phone-number-input"
                  className="block text-[11px] font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-1"
                >
                  Mobile Phone Number *
                </label>
                <input
                  id="phone-number-input"
                  type="tel"
                  required
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full bg-white dark:bg-[#1e1e1e] border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-300"
                />
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                  Enter a 10-digit Indian mobile (+91 added automatically) or full international +country code.
                </p>
              </div>

              <div ref={recaptchaContainerRef} />

              {error && (
                <p role="alert" className="text-xs font-medium text-[#8C1D24] dark:text-[#eb7a80]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                data-testid="phone-send-otp-btn"
                disabled={phoneLoading}
                className="w-full py-2.5 bg-[#8C1D24] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#6e151a] transition-colors disabled:opacity-50"
              >
                {phoneLoading ? 'Sending OTP...' : 'Send OTP Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyPhoneOtp} className="space-y-3">
              <div className="flex items-center justify-between gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                <span>
                  Code sent to <strong className="text-neutral-950 dark:text-neutral-100 font-mono">{normalizedPhone}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmationResult(null);
                    setOtpCode('');
                    setError(null);
                    clearRecaptcha();
                  }}
                  className="text-[11px] font-semibold text-[#8C1D24] dark:text-[#eb7a80] hover:underline"
                >
                  Change Number
                </button>
              </div>

              <div>
                <label
                  htmlFor="phone-otp-input"
                  className="block text-[11px] font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-1"
                >
                  6-Digit SMS Verification Code *
                </label>
                <input
                  id="phone-otp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  className="w-full bg-white dark:bg-[#1e1e1e] border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 font-mono tracking-[0.2em] focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-300"
                />
              </div>

              {error && (
                <p role="alert" className="text-xs font-medium text-[#8C1D24] dark:text-[#eb7a80]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                data-testid="phone-verify-otp-btn"
                disabled={phoneLoading}
                className="w-full py-2.5 bg-[#8C1D24] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#6e151a] transition-colors disabled:opacity-50"
              >
                {phoneLoading ? 'Verifying Code...' : 'Verify & Sign In'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
