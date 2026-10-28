import AdminVerifications from './pages/AdminVerifications.jsx';
import { lazy, Suspense } from 'react';
import NotificationsPage from './pages/NotificationsPage.jsx';
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage.jsx'));
import DiscoveryPage from './pages/DiscoveryPage.jsx';
import PickupsPage from './pages/PickupsPage.jsx';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import LandingPage from './pages/LandingPage.jsx';
import PlaceholderPage from './pages/PlaceholderPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import DonationsPage from './pages/DonationsPage.jsx';
import DonationFormPage from './pages/DonationFormPage.jsx';
import DonationDetailsPage from './pages/DonationDetailsPage.jsx';
import RequestsPage from './pages/RequestsPage.jsx';
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
            <Route path={`dashboard/${role}`} element={<DashboardPage />}>
              <Route
                path="analytics"
                element={
                  <Suspense
                    fallback={
                      <p className="workspace-state" role="status">
                        Loading analytics…
                      </p>
                    }
                  >
                    <AnalyticsPage />
                  </Suspense>
                }
              />
              {role === 'admin' && (
                <Route path="verifications" element={<AdminVerifications />} />
              )}
              <Route path="notifications" element={<NotificationsPage />} />
              {role === 'donor' && (
                <>
                  <Route path="donations" element={<DonationsPage mine />} />
                  <Route path="donations/new" element={<DonationFormPage />} />
                  <Route
                    path="donations/:id/edit"
                    element={<DonationFormPage />}
                  />
                </>
              )}
              {role === 'ngo' && (
                <>
                  <Route path="explore" element={<DonationsPage />} />
                  <Route
                    path="recommended"
                    element={<DiscoveryPage key="ranked" ranked />}
                  />
                  <Route
                    path="nearby"
                    element={<DiscoveryPage key="nearby" />}
                  />
                </>
              )}
              {['donor', 'ngo', 'volunteer'].includes(role) && (
                <>
                  <Route path="pickups" element={<PickupsPage key="mine" />} />
                  <Route
                    path="pickups/:id"
                    element={<PickupsPage key="detail" />}
                  />
                </>
              )}
              {role === 'volunteer' && (
                <Route
                  path="pickups/available"
                  element={<PickupsPage key="available" available />}
                />
              )}
              {['donor', 'ngo'].includes(role) && (
                <>
                  <Route
                    path="donations/:id"
                    element={<DonationDetailsPage />}
                  />
                  <Route
                    path="requests"
                    element={<RequestsPage key="requests" />}
                  />
                  <Route
                    path="history"
                    element={<RequestsPage key="history" history />}
                  />
                </>
              )}
            </Route>
          </Route>
        ))}
      </Routes>
    </AuthProvider>
  );
}
