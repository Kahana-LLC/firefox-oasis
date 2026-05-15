import { h } from 'preact';
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { OasisWindow } from '../types';

const oasisWin = window as unknown as OasisWindow;

interface AuthProps {
  onSuccess: () => void;
  onEmailPasswordOpen?: () => void;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12S6.6 21.8 12 21.8c6.9 0 9.2-4.8 9.2-7.3 0-.5 0-.9-.1-1.3H12Z" />
      <path fill="#34A853" d="M2.2 12c0 2 .8 3.8 2.1 5.1l3.4-2.6c-.9-.7-1.5-1.8-1.5-3.1s.5-2.4 1.5-3.1L4.3 5.7C3 7 2.2 9.1 2.2 12Z" />
      <path fill="#FBBC05" d="M12 21.8c2.7 0 4.9-.9 6.5-2.5l-3.2-2.5c-.9.6-2 1-3.3 1-2.5 0-4.6-1.7-5.4-4l-3.4 2.6c1.7 3.2 5 5.4 8.8 5.4Z" />
      <path fill="#4285F4" d="M18.5 19.3c1.9-1.8 2.7-4.4 2.7-6.6 0-.7-.1-1.2-.2-1.7H12v3.9h5.4c-.3 1.5-1.1 2.8-2.3 3.7l3.4 2.7Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="auth-oauth-apple-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M16.7 12.8c0-2.1 1.8-3.1 1.9-3.2-1-1.5-2.7-1.7-3.3-1.7-1.4-.1-2.8.9-3.5.9-.8 0-1.9-.9-3.1-.9-1.6 0-3 .9-3.9 2.2-1.7 2.9-.4 7.2 1.2 9.4.8 1.1 1.7 2.4 2.9 2.3 1.1 0 1.6-.7 3-.7 1.5 0 1.9.7 3 .7 1.2 0 2-.9 2.8-2 .9-1.3 1.3-2.5 1.3-2.6-.1 0-2.3-.9-2.3-4.4Zm-2.3-6.3c.6-.8 1-1.8.9-2.9-.9 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-.9 2.8 1 0 2.1-.5 2.8-1.3Z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#F25022" d="M3 3h8.6v8.6H3z" />
      <path fill="#7FBA00" d="M12.4 3H21v8.6h-8.6z" />
      <path fill="#00A4EF" d="M3 12.4h8.6V21H3z" />
      <path fill="#FFB900" d="M12.4 12.4H21V21h-8.6z" />
    </svg>
  );
}

export function Auth({ onSuccess, onEmailPasswordOpen }: AuthProps) {
  const oauthStartInFlightRef = useRef(false);
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgotPassword'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [oauthLoading, setOauthLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showEmailPassword, setShowEmailPassword] = useState(false);

  useEffect(() => {
    setShowEmailPassword(false);
  }, [mode]);

  const emailFocusLayout = showEmailPassword && mode !== 'forgotPassword';

  useEffect(() => {
    if (!emailFocusLayout) {
      return;
    }
    const id = window.requestAnimationFrame(() => {
      document.getElementById('auth-email-input')?.focus();
      document.getElementById('oasis-auth-email-form')?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [emailFocusLayout]);

  useEffect(() => {
    const handleAuthError = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const message = detail?.description || detail?.error;
      if (message) {
        setError(message);
        setSuccessMessage(null);
      }
    };

    window.addEventListener('oasis-auth-error', handleAuthError);
    return () => {
      window.removeEventListener('oasis-auth-error', handleAuthError);
    };
  }, []);

  const handleOAuthStart = async (
    providerMethod: 'signInWithGoogle' | 'signInWithAzure' | 'signInWithApple'
  ) => {
    if (oauthStartInFlightRef.current) {
      return;
    }

    oauthStartInFlightRef.current = true;
    setError(null);
    setSuccessMessage(null);
    setOauthLoading(true);
    try {
      oasisWin.assistantBridge?.markOauthSignInStarted?.();
    } catch {
      // ignore
    }

    const authService = (window as any).supabaseAuth;
    if (!authService) {
      setError("Auth service not available");
      oauthStartInFlightRef.current = false;
      setOauthLoading(false);
      return;
    }

    try {
      const result = await authService[providerMethod]();
      const message = result?.error?.message || '';
      const prefix = ['GOOGLE_OAUTH_URL:', 'AZURE_OAUTH_URL:', 'APPLE_OAUTH_URL:'].find(
        value => message.startsWith(value)
      );

      if (prefix) {
        const url = message.slice(prefix.length);
        const opened = (window as any).assistantBridge?.openTab?.(url);
        if (!opened) {
          setError('Failed to open the OAuth tab. Please try again.');
        } else {
          setSuccessMessage(
            'Finish sign-in in the opened tab. Oasis will complete sign-in automatically.'
          );
        }
        setOauthLoading(false);
        return;
      }

      if (result?.error) {
        const errorMessage = authService.handleAuthError
          ? authService.handleAuthError(result.error)
          : result.error.message || 'An error occurred';
        setError(errorMessage);
      } else if (result?.user) {
        onSuccess();
      }
    } catch (err: any) {
      const errorMessage = authService.handleAuthError
        ? authService.handleAuthError(err)
        : err.message || 'An error occurred';
      setError(errorMessage);
    } finally {
      oauthStartInFlightRef.current = false;
      setOauthLoading(false);
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    const authService = (window as OasisWindow).supabaseAuth;
    if (!authService) {
      setError('Auth service not available');
      setLoading(false);
      return;
    }

    try {
      let result: Awaited<ReturnType<typeof authService.signUp>> | null = null;
      if (mode === 'signup') {
        result = await authService.signUp(email, password);
      } else if (mode === 'signin') {
        result = await authService.signInWithEmail(email, password);
      } else if (mode === 'forgotPassword') {
        const resetResult = await authService.resetPasswordForEmail(email);
        if (!resetResult.error) {
          setSuccessMessage('Password reset email sent. Please check your inbox.');
          setLoading(false);
          return;
        }
        result = { user: null, error: resetResult.error };
      }

      if (!result) {
        setError('An error occurred');
        return;
      }

      const { user, error: apiError } = result;

      if (apiError) {
        const errorMessage = authService.handleAuthError
          ? authService.handleAuthError(apiError)
          : apiError.message || 'An error occurred';
        setError(errorMessage);
        return;
      }

      if (user) {
        onSuccess();
      } else if (mode === 'signup') {
        setError('Please check your email for a confirmation link.');
      }
    } catch (err: unknown) {
      const authService = (window as OasisWindow).supabaseAuth;
      const errorMessage = authService?.handleAuthError
        ? authService.handleAuthError(err)
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message || 'An error occurred')
          : 'An error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'signup':
        return 'Create Account';
      case 'signin':
        return 'Welcome Back';
      case 'forgotPassword':
        return 'Reset Password';
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case 'signup':
        return 'Create a new Oasis account.';
      case 'signin':
        return 'Sign in to your Oasis account.';
      case 'forgotPassword':
        return 'Enter your email to receive a reset link.';
    }
  };

  const switchAuthMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setError(null);
    setSuccessMessage(null);
  };

  const getButtonText = () => {
    if (loading) return 'Processing...';
    switch (mode) {
      case 'signup':
        return 'Sign Up';
      case 'signin':
        return 'Sign In';
      case 'forgotPassword':
        return 'Send Reset Link';
    }
  };

  const subtitle = getSubtitle();
  const showFormFields = mode === 'forgotPassword' || showEmailPassword;

  const authScreenClass =
    (mode === 'forgotPassword'
      ? 'auth-screen'
      : mode === 'signup'
        ? 'auth-screen auth-screen--signup'
        : 'auth-screen auth-screen--signin') +
    (emailFocusLayout ? ' auth-screen--email-focus' : '');

  const oauthRow = (
    <div className="auth-oauth-row">
      <button
        type="button"
        aria-label="Continue with Google"
        onClick={() => handleOAuthStart('signInWithGoogle')}
        disabled={oauthLoading}
        className="auth-oauth-provider-btn"
      >
        <GoogleIcon />
      </button>
      <button
        type="button"
        aria-label="Continue with Microsoft"
        onClick={() => handleOAuthStart('signInWithAzure')}
        disabled={oauthLoading}
        className="auth-oauth-provider-btn"
      >
        <MicrosoftIcon />
      </button>
      <button
        type="button"
        aria-label="Continue with Apple"
        onClick={() => handleOAuthStart('signInWithApple')}
        disabled={oauthLoading}
        className="auth-oauth-provider-btn"
      >
        <AppleIcon />
      </button>
    </div>
  );

  const oauthDetailsSummaryLabel =
    (mode === 'signup' ? 'Sign up' : 'Sign in') + ' with Google, Microsoft, or Apple';

  return (
    <div id="oasis-auth-panel" className={authScreenClass}>
      {mode !== 'forgotPassword' && (
        <div className="auth-mode-tablist" role="tablist" aria-label="Sign in or create account">
          <button
            type="button"
            role="tab"
            className={`auth-mode-tab${mode === 'signin' ? ' auth-mode-tab--active' : ''}`}
            aria-selected={mode === 'signin'}
            aria-controls="auth-tabpanel"
            id="auth-tab-signin"
            onClick={() => switchAuthMode('signin')}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            className={`auth-mode-tab${mode === 'signup' ? ' auth-mode-tab--active' : ''}`}
            aria-selected={mode === 'signup'}
            aria-controls="auth-tabpanel"
            id="auth-tab-signup"
            onClick={() => switchAuthMode('signup')}
          >
            Create account
          </button>
        </div>
      )}
      <div
        className="auth-tabpanel-stack"
        role={mode === 'forgotPassword' ? undefined : 'tabpanel'}
        id={mode === 'forgotPassword' ? undefined : 'auth-tabpanel'}
        aria-labelledby={
          mode === 'forgotPassword'
            ? undefined
            : mode === 'signup'
              ? 'auth-tab-signup'
              : 'auth-tab-signin'
        }
      >
      <div className="auth-screen-header">
        <h2 className="auth-screen-title" id="auth-screen-heading">
          {getTitle()}
        </h2>
        {subtitle ? (
          <p className="auth-screen-subtitle" id="auth-screen-subtitle">
            {subtitle}
          </p>
        ) : null}
      </div>

      {mode !== 'forgotPassword' &&
        (showEmailPassword ? (
          <details className="auth-oauth-details">
            <summary className="auth-oauth-details-summary">
              <span className="auth-oauth-details-summary-inner">
                <span className="auth-oauth-details-summary-icons" aria-hidden="true">
                  <span className="auth-oauth-details-summary-icon-wrap">
                    <GoogleIcon />
                  </span>
                  <span className="auth-oauth-details-summary-icon-wrap">
                    <MicrosoftIcon />
                  </span>
                  <span className="auth-oauth-details-summary-icon-wrap">
                    <AppleIcon />
                  </span>
                </span>
                <span className="auth-oauth-details-summary-label">{oauthDetailsSummaryLabel}</span>
              </span>
            </summary>
            {oauthRow}
          </details>
        ) : (
          oauthRow
        ))}

      {mode !== 'forgotPassword' && !showEmailPassword && (
        <button
          type="button"
          className="auth-email-password-trigger"
          onClick={() => {
            onEmailPasswordOpen?.();
            setShowEmailPassword(true);
          }}
        >
          Email and password
        </button>
      )}

      {showFormFields && (
        <form
          id="oasis-auth-email-form"
          className="auth-form-minimal"
          onSubmit={handleSubmit}
        >
          <div className="auth-field-minimal">
            <label className="auth-field-minimal-label" htmlFor="auth-email-input">
              email
            </label>
            <input
              id="auth-email-input"
              type="email"
              value={email}
              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                setEmail(e.currentTarget.value)
              }
              required
              className="auth-field-minimal-input"
              autoComplete="email"
            />
          </div>

          {mode !== 'forgotPassword' && (
            <div className="auth-field-minimal">
              <div className="auth-password-label-row">
                <label className="auth-field-minimal-label" htmlFor="auth-password-input">
                  password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    className="auth-link-inline"
                    onClick={() => {
                      setMode('forgotPassword');
                      setError(null);
                      setSuccessMessage(null);
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="auth-password-input"
                type="password"
                value={password}
                onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                  setPassword(e.currentTarget.value)
                }
                required
                className="auth-field-minimal-input"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
          )}

          {error && (
            <div className="auth-message auth-message-error">{error}</div>
          )}

          {successMessage && (
            <div className="auth-message auth-message-success">{successMessage}</div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {getButtonText()}
          </button>
        </form>
      )}

      {mode === 'forgotPassword' && (
        <div className="auth-footer-links">
          <button
            type="button"
            className="auth-link-standalone"
            onClick={() => switchAuthMode('signin')}
          >
            Back to Sign In
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
