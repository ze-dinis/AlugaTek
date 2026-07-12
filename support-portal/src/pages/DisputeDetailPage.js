import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { disputesService } from '../services/disputesService';
export function DisputeDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [replyText, setReplyText] = useState('');
    const [resolutionText, setResolutionText] = useState('');
    const [banReason, setBanReason] = useState('');
    const [banDuration, setBanDuration] = useState('');
    const { data, isLoading, isError } = useQuery({
        queryKey: ['dispute', id],
        queryFn: () => disputesService.getById(id ?? ''),
        enabled: Boolean(id),
    });
    const replyMutation = useMutation({
        mutationFn: async () => {
            if (!id || !replyText.trim())
                return;
            await disputesService.reply(id, replyText.trim());
        },
        onSuccess: async () => {
            setReplyText('');
            await queryClient.invalidateQueries({ queryKey: ['dispute', id] });
        },
    });
    const resolveMutation = useMutation({
        mutationFn: async () => {
            if (!id || !resolutionText.trim())
                return;
            await disputesService.resolve(id, resolutionText.trim());
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['dispute', id] });
            await queryClient.invalidateQueries({ queryKey: ['disputes'] });
        },
    });
    const banMutation = useMutation({
        mutationFn: async (userId) => {
            const reason = banReason.trim();
            if (!reason) {
                throw new Error('É necessário indicar o motivo do banimento.');
            }
            const parsedDays = Number(banDuration);
            const hasDuration = banDuration.trim().length > 0;
            const durationDays = hasDuration && Number.isFinite(parsedDays) && parsedDays > 0
                ? Math.floor(parsedDays)
                : undefined;
            await disputesService.banUser(userId, {
                reason,
                durationDays,
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['dispute', id] });
        },
    });
    async function handleBan(userId, label) {
        if (!banReason.trim()) {
            return;
        }
        const confirmed = window.confirm(`Confirmar banimento da conta ${label}?`);
        if (!confirmed) {
            return;
        }
        await banMutation.mutateAsync(userId);
    }
    if (!id)
        return _jsx("p", { children: "ID inv\u00E1lido." });
    if (isLoading)
        return _jsx("p", { children: "A carregar disputa..." });
    if (isError || !data)
        return _jsx("p", { children: "N\u00E3o foi poss\u00EDvel abrir a disputa." });
    return (_jsxs("section", { children: [_jsx("button", { className: "secondary-btn", onClick: () => navigate('/disputes'), type: "button", children: "Voltar" }), _jsx("header", { className: "page-header", children: _jsxs("div", { children: [_jsxs("h2", { children: ["Disputa ", data.id] }), _jsxs("p", { className: "muted", children: ["Rental ", data.rentalId, " | Estado: ", _jsx("strong", { children: data.status })] })] }) }), _jsxs("div", { className: "grid", children: [_jsxs("article", { className: "card", children: [_jsx("h3", { children: "Contexto" }), _jsxs("p", { children: [_jsx("strong", { children: "Aberta por:" }), " ", data.openedByName] }), _jsxs("p", { children: [_jsx("strong", { children: "Contra:" }), " ", data.againstUserName] }), _jsxs("p", { children: [_jsx("strong", { children: "Motivo:" }), " ", data.reason] }), _jsxs("p", { children: [_jsx("strong", { children: "Descri\u00E7\u00E3o:" }), " ", data.description] }), data.resolutionNote && (_jsxs("p", { children: [_jsx("strong", { children: "Resolu\u00E7\u00E3o:" }), " ", data.resolutionNote] }))] }), _jsxs("article", { className: "card", children: [_jsx("h3", { children: "Responder cliente" }), _jsx("textarea", { value: replyText, onChange: e => setReplyText(e.target.value), placeholder: "Escreve uma resposta clara para o cliente", rows: 4 }), _jsx("button", { className: "primary-btn", onClick: () => replyMutation.mutate(), type: "button", disabled: replyMutation.isPending || !replyText.trim(), children: replyMutation.isPending ? 'A enviar...' : 'Enviar resposta' })] })] }), _jsxs("article", { className: "card", children: [_jsx("h3", { children: "Hist\u00F3rico de mensagens" }), _jsx("div", { className: "message-list", children: data.messages.map(msg => (_jsxs("div", { className: "message-item", children: [_jsxs("div", { className: "message-meta", children: [_jsx("strong", { children: msg.senderName }), " (", msg.senderRole, ")", _jsx("span", { children: new Date(msg.createdAt).toLocaleString('pt-PT') })] }), _jsx("p", { children: msg.content })] }, msg.id))) })] }), _jsxs("article", { className: "card", children: [_jsx("h3", { children: "Fechar disputa" }), _jsx("textarea", { value: resolutionText, onChange: e => setResolutionText(e.target.value), placeholder: "Nota final da decis\u00E3o", rows: 3 }), _jsx("button", { className: "danger-btn", onClick: () => resolveMutation.mutate(), type: "button", disabled: resolveMutation.isPending || !resolutionText.trim(), children: resolveMutation.isPending ? 'A fechar...' : 'Resolver disputa' })] }), _jsxs("article", { className: "card", children: [_jsx("h3", { children: "Modera\u00E7\u00E3o de contas" }), _jsx("p", { className: "muted", children: "Use apenas em viola\u00E7\u00E3o grave dos termos. Esta a\u00E7\u00E3o deve ficar auditada no backend." }), _jsx("label", { htmlFor: "ban-reason", children: "Motivo do banimento" }), _jsx("textarea", { id: "ban-reason", value: banReason, onChange: e => setBanReason(e.target.value), placeholder: "Ex.: fraude comprovada, abuso recorrente, conta comprometida", rows: 3 }), _jsx("label", { htmlFor: "ban-duration", children: "Dura\u00E7\u00E3o (dias, opcional)" }), _jsx("input", { id: "ban-duration", type: "number", min: 1, value: banDuration, onChange: e => setBanDuration(e.target.value), placeholder: "Vazio = banimento permanente" }), _jsxs("div", { className: "actions-row", children: [_jsxs("button", { className: "danger-btn", type: "button", onClick: () => handleBan(data.openedByUserId, data.openedByName), disabled: banMutation.isPending || !banReason.trim(), children: ["Banir ", data.openedByName] }), _jsxs("button", { className: "danger-btn", type: "button", onClick: () => handleBan(data.againstUserId, data.againstUserName), disabled: banMutation.isPending || !banReason.trim(), children: ["Banir ", data.againstUserName] })] }), banMutation.isError && (_jsx("div", { className: "error-box", children: "Falha ao banir conta. Verifique permiss\u00F5es no backend." }))] })] }));
}
