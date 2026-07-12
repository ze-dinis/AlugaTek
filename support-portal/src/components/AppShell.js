import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
export function AppShell() {
    const { user, logout } = useAuth();
    return (_jsxs("div", { className: "shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsx(Link, { to: "/", className: "brand", children: "Alugatek Support" }), _jsx("nav", { className: "menu", children: _jsx(NavLink, { to: "/disputes", className: ({ isActive }) => (isActive ? 'menu-item active' : 'menu-item'), children: "Disputas" }) }), _jsxs("div", { className: "user-box", children: [_jsx("div", { className: "user-name", children: user?.name }), _jsx("div", { className: "user-role", children: user?.role }), _jsx("button", { onClick: logout, className: "secondary-btn", type: "button", children: "Sair" })] })] }), _jsx("main", { className: "content", children: _jsx(Outlet, {}) })] }));
}
