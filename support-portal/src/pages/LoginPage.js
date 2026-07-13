import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { useAuth } from '../lib/AuthContext';
export function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    async function handleSubmit(event) {
        event.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const session = await authService.login({ email, password });
            login(session);
            navigate('/disputes');
        }
        catch {
            setError('Falha no login de suporte. Verifique as credenciais e role.');
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsx("div", { className: "login-page", children: _jsxs("form", { onSubmit: handleSubmit, className: "card login-card", children: [_jsx("h1", { children: "Portal de Suporte" }), _jsx("p", { className: "muted", children: "Acesso exclusivo para agentes e administradores." }), _jsx("label", { htmlFor: "email", children: "Email" }), _jsx("input", { id: "email", type: "email", value: email, onChange: e => setEmail(e.target.value), required: true }), _jsx("label", { htmlFor: "password", children: "Password" }), _jsx("input", { id: "password", type: "password", value: password, onChange: e => setPassword(e.target.value), required: true }), error && _jsx("div", { className: "error-box", children: error }), _jsx("button", { className: "primary-btn", type: "submit", disabled: loading, children: loading ? 'A entrar...' : 'Entrar' })] }) }));
}
