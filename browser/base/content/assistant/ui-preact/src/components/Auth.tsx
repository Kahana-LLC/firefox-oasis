import { h, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

interface AuthProps {
  onSuccess: () => void;
  onCancel: () => void;
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
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#111" d="M16.7 12.8c0-2.1 1.8-3.1 1.9-3.2-1-1.5-2.7-1.7-3.3-1.7-1.4-.1-2.8.9-3.5.9-.8 0-1.9-.9-3.1-.9-1.6 0-3 .9-3.9 2.2-1.7 2.9-.4 7.2 1.2 9.4.8 1.1 1.7 2.4 2.9 2.3 1.1 0 1.6-.7 3-.7 1.5 0 1.9.7 3 .7 1.2 0 2-.9 2.8-2 .9-1.3 1.3-2.5 1.3-2.6-.1 0-2.3-.9-2.3-4.4Zm-2.3-6.3c.6-.8 1-1.8.9-2.9-.9 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-.9 2.8 1 0 2.1-.5 2.8-1.3Z" />
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

export function Auth({ onSuccess, onCancel }: AuthProps) {
  const oauthStartInFlightRef = useRef(false);
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgotPassword'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [oauthLoading, setOauthLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
      const prefix = ['GOOGLE_OAUTH_URL:', 'AZURE_OAUTH_URL:', 'APPLE_OAUTH_URL:']
        .find(value => message.startsWith(value));

      if (prefix) {
        const url = message.slice(prefix.length);
        const opened = (window as any).assistantBridge?.openTab?.(url);
        if (!opened) {
          setError('Failed to open the OAuth tab. Please try again.');
        } else {
          setSuccessMessage('Finish sign-in in the opened tab. Oasis will complete sign-in automatically.');
        }
        setOauthLoading(false);
        return;
      }

      if (result?.error) {
        const errorMessage = authService.handleAuthError
          ? authService.handleAuthError(result.error)
          : (result.error.message || "An error occurred");
        setError(errorMessage);
      } else if (result?.user) {
        onSuccess();
      }
    } catch (err: any) {
      const errorMessage = authService.handleAuthError
        ? authService.handleAuthError(err)
        : (err.message || "An error occurred");
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

    const authService = (window as any).supabaseAuth;
    if (!authService) {
      setError("Auth service not available");
      setLoading(false);
      return;
    }

    try {
      let result;
      if (mode === 'signup') {
        // wrapper: signUp(email, password, name)
        result = await authService.signUp(email, password);
      } else if (mode === 'signin') {
        // wrapper: signInWithEmail(email, password)
        result = await authService.signInWithEmail(email, password);
      } else if (mode === 'forgotPassword') {
        result = await authService.resetPasswordForEmail(email);
        if (!result.error) {
            setSuccessMessage("Password reset email sent. Please check your inbox.");
            setLoading(false);
            return;
        }
      }

      const { user, error: apiError } = result;

      if (apiError) {
        const errorMessage = authService.handleAuthError 
          ? authService.handleAuthError(apiError) 
          : (apiError.message || "An error occurred");
        setError(errorMessage);
        return;
      }

      if (user) {
        // Successful
        onSuccess();
      } else if (mode === 'signup') {
        // If no user returned but no error, maybe confirmation needed?
        // But wrapper usually returns user if successful.
        // Let's assume if no error, it's okay or check for session?
        // The wrapper logs "Sign up successful for user:" so user should be there.
        // If confirmation is required, Supabase might return user with identities but no session?
        // Let's stick to checking user.
        setError("Please check your email for a confirmation link.");
      }
    } catch (err: any) {
      const errorMessage = authService?.handleAuthError 
        ? authService.handleAuthError(err) 
        : (err.message || "An error occurred");
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
      switch (mode) {
          case 'signup': return 'Create Account';
          case 'signin': return 'Welcome Back';
          case 'forgotPassword': return 'Reset Password';
      }
  };

  const getSubtitle = () => {
      switch (mode) {
          case 'signup': return 'Sign up to sync your tabs and history.';
          case 'signin': return 'Sign in to your Oasis account.';
          case 'forgotPassword': return 'Enter your email to receive a reset link.';
      }
  };

  const getButtonText = () => {
      if (loading) return 'Processing...';
      switch (mode) {
          case 'signup': return 'Sign Up';
          case 'signin': return 'Sign In';
          case 'forgotPassword': return 'Send Reset Link';
      }
  };

  return (
    <div style={{ 
      flex: 1, 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '24px',
      gap: '24px'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 600, color: '#7A9200', margin: '0 0 8px 0' }}>
          {getTitle()}
        </h2>
        <p style={{ color: '#666', margin: 0 }}>
          {getSubtitle()}
        </p>
      </div>

      {mode !== 'forgotPassword' && (
        <div style={{ width: '100%', maxWidth: '320px', display: 'flex', gap: '12px' }}>
          <button
            type="button"
            aria-label="Continue with Google"
            onClick={() => handleOAuthStart('signInWithGoogle')}
            disabled={oauthLoading}
            style={{ flex: 1, height: '44px', borderRadius: '999px', border: '1px solid #d9dfc8', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: oauthLoading ? 'wait' : 'pointer', outlineOffset: '2px' }}
          >
            <GoogleIcon />
          </button>
          <button
            type="button"
            aria-label="Continue with Apple"
            onClick={() => handleOAuthStart('signInWithApple')}
            disabled={oauthLoading}
            style={{ flex: 1, height: '44px', borderRadius: '999px', border: '1px solid #d9dfc8', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: oauthLoading ? 'wait' : 'pointer', outlineOffset: '2px' }}
          >
            <AppleIcon />
          </button>
          <button
            type="button"
            aria-label="Continue with Microsoft"
            onClick={() => handleOAuthStart('signInWithAzure')}
            disabled={oauthLoading}
            style={{ flex: 1, height: '44px', borderRadius: '999px', border: '1px solid #d9dfc8', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: oauthLoading ? 'wait' : 'pointer', outlineOffset: '2px' }}
          >
            <MicrosoftIcon />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: '#333' }}>Email</label>
          <input 
            type="email" 
            value={email}
            onInput={(e: any) => setEmail(e.target.value)}
            required
            className="input-field" 
            style={{ width: '100%', boxSizing: 'border-box', background: 'white', border: '1px solid #e0e0e0' }}
          />
        </div>

        {mode !== 'forgotPassword' && (
            <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: '#333' }}>Password</label>
                {mode === 'signin' && (
                    <button
                        type="button"
                        onClick={() => { setMode('forgotPassword'); setError(null); setSuccessMessage(null); }}
                        style={{ background: 'none', border: 'none', color: '#7A9200', fontSize: '12px', cursor: 'pointer', padding: 0 }}
                    >
                        Forgot Password?
                    </button>
                )}
            </div>
            <input 
                type="password" 
                value={password}
                onInput={(e: any) => setPassword(e.target.value)}
                required
                className="input-field" 
                style={{ width: '100%', boxSizing: 'border-box', background: 'white', border: '1px solid #e0e0e0' }}
            />
            </div>
        )}

        {error && (
          <div style={{ color: '#d32f2f', fontSize: '13px', background: '#ffebee', padding: '8px', borderRadius: '8px' }}>
            {error}
          </div>
        )}

        {successMessage && (
          <div style={{ color: '#2e7d32', fontSize: '13px', background: '#e8f5e9', padding: '8px', borderRadius: '8px' }}>
            {successMessage}
          </div>
        )}

        <button 
          type="submit" 
          disabled={loading}
          style={{
            background: '#7A9200',
            color: 'white',
            border: 'none',
            padding: '12px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
            marginTop: '8px'
          }}
        >
          {getButtonText()}
        </button>
      </form>

      <div style={{ fontSize: '13px', color: '#666' }}>
        {mode === 'forgotPassword' ? (
             <button 
             onClick={() => { setMode('signin'); setError(null); setSuccessMessage(null); }}
             style={{ background: 'none', border: 'none', color: '#7A9200', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
           >
             Back to Sign In
           </button>
        ) : (
            <>
                {mode === 'signup' ? "Already have an account? " : "Don't have an account? "}
                <button 
                onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null); setSuccessMessage(null); }}
                style={{ background: 'none', border: 'none', color: '#7A9200', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                >
                {mode === 'signup' ? 'Sign In' : 'Sign Up'}
                </button>
            </>
        )}
      </div>

       <button 
          onClick={onCancel}
          style={{ background: 'none', border: 'none', color: '#999', fontSize: '13px', cursor: 'pointer', padding: 0 }}
        >
          Cancel
        </button>
    </div>
  );
}
