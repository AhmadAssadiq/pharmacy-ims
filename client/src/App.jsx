import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import StaffInventoryPage from './pages/staff/StaffInventoryPage';
import StaffChatInboxPage from './pages/staff/StaffChatInboxPage';
import PatientAvailabilityPage from './pages/patient/PatientAvailabilityPage';
import PatientChatPage from './pages/patient/PatientChatPage';
import { homePathForRole, ROLES } from './utils/routes';

/** Sends "/" to the right home page depending on who is signed in. */
function RootRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homePathForRole(user.role) : '/login'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Staff portal (FR 2.1) */}
          <Route element={<ProtectedRoute role={ROLES.STAFF} />}>
            <Route element={<Layout />}>
              <Route path="/staff/inventory" element={<StaffInventoryPage />} />
              <Route path="/staff/chat" element={<StaffChatInboxPage />} />
            </Route>
          </Route>

          {/* Patient portal (FR 2.2) */}
          <Route element={<ProtectedRoute role={ROLES.PATIENT} />}>
            <Route element={<Layout />}>
              <Route path="/patient/availability" element={<PatientAvailabilityPage />} />
              <Route path="/patient/chat" element={<PatientChatPage />} />
            </Route>
          </Route>

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
