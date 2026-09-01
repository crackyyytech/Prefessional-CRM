import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import PasswordInput from '../components/PasswordInput';
import AppLoader from '../components/AppLoader';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useNetwork } from '../context/NetworkContext';

export default function Login() {
  const { user, loading, login } = useAuth();
  const { online } = useNetwork();
  const { appName, appInitial } = useBranding();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionRevoked = searchParams.get('reason') === 'session_revoked';
  const [email, setEmail] = useState('admin@crm.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return <AppLoader message="Loading sign in…" />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="brand login-brand">
          <div className="brand-mark">{appInitial}</div>
          <div>
            <h1>{appName}</h1>
            <p>Sign in to continue</p>
          </div>
        </div>

        {sessionRevoked && (
          <div className="error-banner">Your session was ended by an administrator. Please sign in again.</div>
        )}

        {error && <div className="error-banner">{error}</div>}

        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <PasswordInput
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn btn-primary login-btn" type="submit" disabled={submitting || !online}>
          {submitting ? 'Signing in...' : !online ? 'Offline' : 'Sign in'}
        </button>
        <p className="login-hint">Default: admin@crm.local / admin123</p>
      </form>
    </div>
  );
}
