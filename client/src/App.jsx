import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import LandingPage from './pages/LandingPage.jsx';
import PlaceholderPage from './pages/PlaceholderPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import AuthProvider from './auth/AuthProvider.jsx';
import ProtectedRoute, {
  DashboardRedirect,
} from './components/ProtectedRoute.jsx';
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<LandingPage />} />
          <Route path="login" element={<AuthPage key="login" mode="login" />} />
          <Route
            path="register"
            element={<AuthPage key="register" mode="register" />}
          />
          <Route path="*" element={<PlaceholderPage kind="missing" />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="dashboard" element={<DashboardRedirect />} />
        </Route>
        {['donor', 'ngo', 'volunteer', 'admin'].map((role) => (
          <Route key={role} element={<ProtectedRoute role={role} />}>
            <Route path={`dashboard/${role}`} element={<DashboardPage />} />
          </Route>
        ))}
      </Routes>
    </AuthProvider>
  );
}
