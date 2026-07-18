import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';

const ConnectPage = lazy(() => import('./pages/ConnectPage').then((module) => ({ default: module.ConnectPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((module) => ({ default: module.HistoryPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));
const SendPage = lazy(() => import('./pages/SendPage').then((module) => ({ default: module.SendPage })));

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-forest-950 text-cream-100" role="status">
      <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest"><span className="spinner" /> Loading secure console</div>
    </div>
  );
}

function ProtectedArea() {
  const { admin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!admin) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <AppLayout />;
}

export function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedArea />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/connect/:instanceId" element={<ConnectPage />} />
          <Route path="/send" element={<SendPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
