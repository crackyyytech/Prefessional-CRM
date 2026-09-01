import { Navigate, Outlet } from 'react-router-dom';
import AppLoader from './AppLoader';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ permission }) {
  const { user, loading, can, permissions } = useAuth();

  if (loading) {
    return <AppLoader message="Verifying your session…" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (permission && !can(permission)) {
    const fallback = permissions.includes('dashboard:view')
      ? '/'
      : permissions.includes('contacts:view')
        ? '/contacts'
        : permissions.includes('deals:view')
          ? '/deals'
          : permissions.includes('tasks:view')
            ? '/tasks'
            : permissions.includes('documents:view')
              ? '/documents'
              : '/login';
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}
