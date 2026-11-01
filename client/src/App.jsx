// All the pages of the app and which URL shows which page (React Router).
//
// - Signed-out pages (login, register, password reset) use AuthLayout.
// - Staff and patient pages are wrapped in ProtectedRoute, which sends you to the login page
//   if you are not signed in, or to your own home page if you have the wrong role (FR 1, FR 2).
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import AuthLayout from './components/AuthLayout';
import UserFrame from './components/UserFrame';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ContactPage from './pages/ContactPage';
import NotFoundPage from './pages/NotFoundPage';
import StaffInventoryPage from './pages/staff/StaffInventoryPage';
import StaffStockPage from './pages/staff/StaffStockPage';
import StaffSellPage from './pages/staff/StaffSellPage';
import StaffForecastPage from './pages/staff/StaffForecastPage';
import StaffChatInboxPage from './pages/staff/StaffChatInboxPage';
import StaffPreordersPage from './pages/staff/StaffPreordersPage';
import PatientAvailabilityPage from './pages/patient/PatientAvailabilityPage';
import PatientChatPage from './pages/patient/PatientChatPage';
import PatientAccountPage from './pages/patient/PatientAccountPage';
import PatientAboutPage from './pages/patient/PatientAboutPage';
import { homePathForRole, ROLES } from './utils/routes';

// "/" goes to the right home page for whoever is signed in, or to the login page
function RootRedirect() {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={homePathForRole(user.role)} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRedirect />} />

            {/* Signed-out pages */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>

            {/* Staff pages (FR 2.1) */}
            <Route element={<ProtectedRoute role={ROLES.STAFF} />}>
              <Route element={<Layout />}>
                <Route path="/staff/inventory" element={<StaffInventoryPage />} />
                <Route path="/staff/stock" element={<StaffStockPage />} />
                <Route path="/staff/sell" element={<StaffSellPage />} />
                <Route path="/staff/forecast" element={<StaffForecastPage />} />
                <Route path="/staff/chat" element={<StaffChatInboxPage />} />
                <Route path="/staff/preorders" element={<StaffPreordersPage />} />
              </Route>
            </Route>

            {/* Patient pages (FR 2.2) */}
            <Route element={<ProtectedRoute role={ROLES.PATIENT} />}>
              <Route element={<Layout />}>
                <Route path="/patient/availability" element={<PatientAvailabilityPage />} />
                <Route path="/patient/chat" element={<PatientChatPage />} />
                <Route path="/patient/about" element={<PatientAboutPage />} />
                <Route path="/patient/account" element={<PatientAccountPage />} />
              </Route>
            </Route>

            {/* Pages anyone can open, signed in or not (GP2 addition) */}
            <Route element={<UserFrame />}>
              <Route path="/contact" element={<ContactPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
