import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { usersService } from '../services/usersService';
export function BanAccountPage() {
    const [email, setEmail] = useState('');
    const [reason, setReason] = useState('');
    const [durationDays, setDurationDays] = useState('');
    const [result, setResult] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);
    const banMutation = useMutation({
        mutationFn: () => {
            const parsedDays = Number(durationDays);
            const hasDuration = durationDays.trim().length > 0;
            const days = hasDuration && Number.isFinite(parsedDays) && parsedDays > 0
                ? Math.floor(parsedDays)
                : undefined;
            return usersService.banByEmail({ email: email.trim(), reason: reason.trim(), durationDays: days });
        },
        onSuccess: data => {
            setResult(data);
            setErrorMsg(null);
            setEmail('');
            setReason('');
            setDurationDays('');
        },
        onError: (err) => {
            const msg = err?.response?.data?.message ??
                'Ocorreu um erro inesperado.';
            setErrorMsg(msg);
            setResult(null);
        },
    });
    function handleSubmit(e) {
        e.preventDefault();
        setErrorMsg(null);
        setResult(null);
        if (!email.trim() || !reason.trim())
            return;
        banMutation.mutate();
    }
    const bannedUntilLabel = result?.bannedUntil
        ? new Date(result.bannedUntil).toLocaleString('pt-PT')
        : 'Permanente';
    return (_jsxs("section", { children: [_jsx("header", { className: "page-header", children: _jsxs("div", { children: [_jsx("h2", { children: "Banir conta" }), _jsx("p", { className: "muted", children: "Pesquisa por email e aplica um banimento \u00E0 conta." })] }) }), _jsxs("div", { style: { maxWidth: 520 }, children: [_jsx("article", { className: "card", children: _jsxs("form", { onSubmit: handleSubmit, children: [_jsx("label", { htmlFor: "ban-email", children: "Email da conta" }), _jsx("input", { id: "ban-email", type: "email", placeholder: "utilizador@exemplo.com", value: email, onChange: e => setEmail(e.target.value), required: true }), _jsx("label", { htmlFor: "ban-reason", children: "Motivo do banimento" }), _jsx("textarea", { id: "ban-reason", placeholder: "Descreve o motivo do banimento...", rows: 3, value: reason, onChange: e => setReason(e.target.value), required: true }), _jsxs("label", { htmlFor: "ban-duration", children: ["Dura\u00E7\u00E3o (dias) \u2014 ", _jsx("span", { className: "muted", children: "deixa em branco para banimento permanente" })] }), _jsx("input", { id: "ban-duration", type: "number", min: 1, placeholder: "ex: 30", value: durationDays, onChange: e => setDurationDays(e.target.value) }), errorMsg && _jsx("div", { className: "error-box", children: errorMsg }), _jsx("div", { className: "actions-row", children: _jsx("button", { type: "submit", className: "danger-btn", disabled: banMutation.isPending || !email.trim() || !reason.trim(), children: banMutation.isPending ? 'A banir...' : 'Banir conta' }) })] }) }), result && (_jsxs("article", { className: "card", style: { marginTop: 16, borderColor: '#a11d1d' }, children: [_jsx("h3", { style: { color: '#a11d1d', margin: '0 0 8px' }, children: "Conta banida com sucesso" }), _jsxs("p", { children: [_jsx("strong", { children: "Email:" }), " ", result.email] }), _jsxs("p", { children: [_jsx("strong", { children: "Motivo:" }), " ", result.banReason] }), _jsxs("p", { children: [_jsx("strong", { children: "V\u00E1lido at\u00E9:" }), " ", bannedUntilLabel] })] }))] })] }));
}
