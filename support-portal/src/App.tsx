import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DisputeDetailPage } from './pages/DisputeDetailPage';
import { DisputesInboxPage } from './pages/DisputesInboxPage';
import { LoginPage } from './pages/LoginPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/disputes" element={<DisputesInboxPage />} />
          <Route path="/disputes/:id" element={<DisputeDetailPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/disputes" replace />} />
    </Routes>
  );
}
