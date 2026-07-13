import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo, useState, } from 'react';
const AuthContext = createContext(undefined);
const TOKEN_KEY = 'support_token';
const NAME_KEY = 'support_name';
const ROLE_KEY = 'support_role';
function readStoredAuth() {
    const token = localStorage.getItem(TOKEN_KEY);
    const name = localStorage.getItem(NAME_KEY);
    const role = localStorage.getItem(ROLE_KEY);
    if (!token || !name || !role) {
        return null;
    }
    return { token, name, role };
}
export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => readStoredAuth());
    const value = useMemo(() => ({
        user,
        login: session => {
            localStorage.setItem(TOKEN_KEY, session.token);
            localStorage.setItem(NAME_KEY, session.name);
            localStorage.setItem(ROLE_KEY, session.role);
            setUser({ token: session.token, name: session.name, role: session.role });
        },
        logout: () => {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(NAME_KEY);
            localStorage.removeItem(ROLE_KEY);
            setUser(null);
        },
    }), [user]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used inside AuthProvider');
    }
    return context;
}
