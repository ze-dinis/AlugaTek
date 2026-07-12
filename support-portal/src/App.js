import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DisputeDetailPage } from './pages/DisputeDetailPage';
import { DisputesInboxPage } from './pages/DisputesInboxPage';
import { LoginPage } from './pages/LoginPage';
export default function App() {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { element: _jsx(ProtectedRoute, {}), children: _jsxs(Route, { element: _jsx(AppShell, {}), children: [_jsx(Route, { path: "/disputes", element: _jsx(DisputesInboxPage, {}) }), _jsx(Route, { path: "/disputes/:id", element: _jsx(DisputeDetailPage, {}) })] }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/disputes", replace: true }) })] }));
}
