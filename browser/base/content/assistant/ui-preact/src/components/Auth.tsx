import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';

interface AuthProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function Auth({ onSuccess, onCancel }: AuthProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgotPassword'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
