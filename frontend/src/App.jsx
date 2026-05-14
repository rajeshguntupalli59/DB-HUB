import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import LoginPage from "./pages/LoginPage";
import SetupPage from "./pages/SetupPage";
import ActivatePage from "./pages/ActivatePage";
import Layout from "./pages/Layout";
import UsersPage from "./pages/UsersPage";
import DashboardPage from "./pages/DashboardPage";
import ConnectionsPage from "./pages/ConnectionsPage";
import SchemaPage from "./pages/SchemaPage";
import DocsPage from "./pages/DocsPage";
import ERDPage from "./pages/ERDPage";
import TrackerPage from "./pages/TrackerPage";
import AssistantPage from "./pages/AssistantPage";
import OptimizerPage from "./pages/OptimizerPage";

const BASE = "http://localhost:8000";

function Spinner() {
  return (
    <div className="w-6 h-6 border-2 border-border border-t-accent rounded-full animate-spin" />
  );
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-surface-0 flex items-center justify-center"><Spinner /></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function AppInner() {
  const [licenseChecked, setLicenseChecked] = useState(false);
  const [licensed, setLicensed] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/license`)
      .then(r => r.json())
      .then(d => { setLicensed(d.activated); setLicenseChecked(true); })
      .catch(() => { setLicensed(false); setLicenseChecked(true); });
  }, []);

  if (!licenseChecked) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!licensed) {
    return <ActivatePage onActivated={() => setLicensed(true)} />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="connections" element={<ConnectionsPage />} />
        <Route path="schema" element={<SchemaPage />} />
        <Route path="docs" element={<DocsPage />} />
        <Route path="erd" element={<ERDPage />} />
        <Route path="tracker" element={<TrackerPage />} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="optimizer" element={<OptimizerPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppInner />
      </BrowserRouter>
    </AuthProvider>
  );
}
