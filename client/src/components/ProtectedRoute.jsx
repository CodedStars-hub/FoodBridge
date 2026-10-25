import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { dashboardPath } from '../auth/AuthContext.js';
import SessionState from './SessionState.jsx';
export default function ProtectedRoute({ role }) {
  const { user, status } = useAuth();
  if (status === 'loading' || status === 'error') return <SessionState />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role)
    return <Navigate to={dashboardPath(user.role)} replace />;
  return <Outlet />;
}
export function DashboardRedirect() {
  const { user } = useAuth();
  return <Navigate to={dashboardPath(user.role)} replace />;
}
