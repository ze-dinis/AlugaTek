import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { disputesService } from '../services/disputesService';
const statuses = [
    { label: 'Todas', value: 'All' },
    { label: 'Abertas', value: 'Open' },
    { label: 'Em análise', value: 'UnderReview' },
    { label: 'Aguarda cliente', value: 'WaitingCustomer' },
    { label: 'Resolvidas', value: 'Resolved' },
    { label: 'Rejeitadas', value: 'Rejected' },
];
export function DisputesInboxPage() {
    const [selectedStatus, setSelectedStatus] = useState('All');
    const [selectedTab, setSelectedTab] = useState('General');
    const queryStatus = useMemo(() => (selectedStatus === 'All' ? undefined : selectedStatus), [selectedStatus]);
    const { data, isLoading, isError } = useQuery({
        queryKey: ['disputes', queryStatus],
        queryFn: () => disputesService.getInbox(queryStatus),
    });
    const filteredData = useMemo(() => {
        if (!data)
            return [];
        if (selectedTab === 'DisputaTag') {
            return data.filter(dispute => dispute.reason.trim().toUpperCase().startsWith('[DISPUTA]'));
        }
        return data;
    }, [data, selectedTab]);
    return (_jsxs("section", { children: [_jsx("header", { className: "page-header", children: _jsxs("div", { children: [_jsx("h2", { children: "Inbox de disputas" }), _jsx("p", { className: "muted", children: "Gerir pedidos com prioridade e contexto de aluguer." })] }) }), _jsxs("div", { className: "filter-row", children: [_jsx("button", { className: selectedTab === 'General' ? 'chip active' : 'chip', onClick: () => setSelectedTab('General'), type: "button", children: "Inbox geral" }), _jsx("button", { className: selectedTab === 'DisputaTag' ? 'chip active' : 'chip', onClick: () => setSelectedTab('DisputaTag'), type: "button", children: "[DISPUTA]" })] }), _jsx("div", { className: "filter-row", children: statuses.map(option => (_jsx("button", { className: selectedStatus === option.value ? 'chip active' : 'chip', onClick: () => setSelectedStatus(option.value), type: "button", children: option.label }, option.value))) }), isLoading && _jsx("p", { children: "A carregar disputas..." }), isError && _jsx("p", { children: "Erro ao carregar disputas." }), data && filteredData.length === 0 && _jsx("p", { children: "Nenhuma disputa encontrada para este filtro." }), data && filteredData.length > 0 && (_jsx("div", { className: "card table-card", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Disputa" }), _jsx("th", { children: "Estado" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Contra" }), _jsx("th", { children: "Motivo" }), _jsx("th", { children: "Data" })] }) }), _jsx("tbody", { children: filteredData.map(dispute => (_jsxs("tr", { children: [_jsx("td", { children: _jsx(Link, { to: `/disputes/${dispute.id}`, children: dispute.id.slice(0, 8) }) }), _jsx("td", { children: _jsx("span", { className: `status status-${dispute.status}`, children: dispute.status }) }), _jsx("td", { children: dispute.openedByName }), _jsx("td", { children: dispute.againstUserName }), _jsx("td", { children: dispute.reason }), _jsx("td", { children: new Date(dispute.createdAt).toLocaleString('pt-PT') })] }, dispute.id))) })] }) }))] }));
}
