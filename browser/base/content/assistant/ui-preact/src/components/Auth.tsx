import { h } from 'preact';
import { useState } from 'preact/hooks';

interface AuthProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function Auth({ onSuccess, onCancel }: AuthProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
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
      } else {
        // wrapper: signInWithEmail(email, password)
        result = await authService.signInWithEmail(email, password);
      }

      const { user, error: apiError } = result;

      if (apiError) throw apiError;

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
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
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
          {mode === 'signup' ? 'Create Account' : 'Welcome Back'}
        </h2>
        <p style={{ color: '#666', margin: 0 }}>
          {mode === 'signup' ? 'Sign up to sync your tabs and history.' : 'Sign in to your Oasis account.'}
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

        <div>
           <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: '#333' }}>Password</label>
           <input 
            type="password" 
            value={password}
            onInput={(e: any) => setPassword(e.target.value)}
            required
            className="input-field" 
            style={{ width: '100%', boxSizing: 'border-box', background: 'white', border: '1px solid #e0e0e0' }}
          />
        </div>

        {error && (
          <div style={{ color: '#d32f2f', fontSize: '13px', background: '#ffebee', padding: '8px', borderRadius: '8px' }}>
            {error}
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
          {loading ? 'Processing...' : (mode === 'signup' ? 'Sign Up' : 'Sign In')}
        </button>
      </form>

      <div style={{ fontSize: '13px', color: '#666' }}>
        {mode === 'signup' ? "Already have an account? " : "Don't have an account? "}
        <button 
          onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null); }}
          style={{ background: 'none', border: 'none', color: '#7A9200', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
        >
          {mode === 'signup' ? 'Sign In' : 'Sign Up'}
        </button>
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
