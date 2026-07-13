import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsService } from '../services/reportsService';
import { usersService } from '../services/usersService';
export function ReportsPage() {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['reports'],
        queryFn: reportsService.getAll,
    });
    const [banningId, setBanningId] = useState(null);
    async function handleQuickBan(reportedUserId, reportedUserEmail, reason) {
        const confirmed = window.confirm(`Banir a conta ${reportedUserEmail} com o motivo: "${reason}"?`);
        if (!confirmed)
            return;
        setBanningId(reportedUserId);
        try {
            await usersService.banByEmail({ email: reportedUserEmail, reason });
            window.alert(`Conta ${reportedUserEmail} banida com sucesso.`);
        }
        catch (err) {
            const msg = err?.response?.data?.message ??
                'Ocorreu um erro inesperado.';
            window.alert(`Erro: ${msg}`);
        }
        finally {
            setBanningId(null);
        }
    }
    return (_jsxs("section", { children: [_jsx("header", { className: "page-header", children: _jsxs("div", { children: [_jsx("h2", { children: "Den\u00FAncias de utilizadores" }), _jsx("p", { className: "muted", children: "Todas as den\u00FAncias submetidas por utilizadores da plataforma." })] }) }), isLoading && _jsx("p", { children: "A carregar..." }), isError && _jsx("p", { className: "error-box", children: "N\u00E3o foi poss\u00EDvel carregar as den\u00FAncias." }), data && data.length === 0 && (_jsx("p", { className: "muted", children: "N\u00E3o existem den\u00FAncias." })), data && data.length > 0 && (_jsx("div", { className: "card table-card", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Data" }), _jsx("th", { children: "Denunciado" }), _jsx("th", { children: "Denunciante" }), _jsx("th", { children: "An\u00FAncio" }), _jsx("th", { children: "Motivo" }), _jsx("th", { children: "A\u00E7\u00E3o" })] }) }), _jsx("tbody", { children: data.map(r => (_jsxs("tr", { children: [_jsx("td", { style: { whiteSpace: 'nowrap' }, children: new Date(r.createdAt).toLocaleString('pt-PT') }), _jsxs("td", { children: [_jsx("div", { children: r.reportedUserName }), _jsx("div", { style: { fontSize: 12, color: '#4e5d6e' }, children: r.reportedUserEmail })] }), _jsxs("td", { children: [_jsx("div", { children: r.reporterName }), _jsx("div", { style: { fontSize: 12, color: '#4e5d6e' }, children: r.reporterEmail })] }), _jsx("td", { children: r.itemTitle }), _jsx("td", { children: r.reason }), _jsx("td", { children: _jsx("button", { className: "danger-btn", style: { padding: '6px 12px', fontSize: 13 }, disabled: banningId === r.reportedUserId, onClick: () => handleQuickBan(r.reportedUserId, r.reportedUserEmail, r.reason), type: "button", children: banningId === r.reportedUserId ? 'A banir...' : 'Banir' }) })] }, r.id))) })] }) }))] }));
}
