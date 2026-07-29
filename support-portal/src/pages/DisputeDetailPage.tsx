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
  const [concludeRental, setConcludeRental] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dispute', id],
    queryFn: () => disputesService.getById(id ?? ''),
    enabled: Boolean(id),
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!id || !replyText.trim()) return;
      await disputesService.reply(id, replyText.trim());
    },
    onSuccess: async () => {
      setReplyText('');
      await queryClient.invalidateQueries({ queryKey: ['dispute', id] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!id || !resolutionText.trim()) return;
      await disputesService.resolve(id, {
        resolutionNote: resolutionText.trim(),
        concludeRental,
      });
    },
    onSuccess: async () => {
      setResolutionText('');
      setConcludeRental(false);
      await queryClient.invalidateQueries({ queryKey: ['dispute', id] });
      await queryClient.invalidateQueries({ queryKey: ['disputes'] });
    },
  });

  const banMutation = useMutation({
    mutationFn: async (userId: string) => {
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

  async function handleBan(userId: string, label: string) {
    if (!banReason.trim()) {
      return;
    }

    const confirmed = window.confirm(`Confirmar banimento da conta ${label}?`);
    if (!confirmed) {
      return;
    }

    await banMutation.mutateAsync(userId);
  }

  if (!id) return <p>ID inválido.</p>;
  if (isLoading) return <p>A carregar disputa...</p>;
  if (isError || !data) return <p>Não foi possível abrir a disputa.</p>;

  return (
    <section>
      <button className="secondary-btn" onClick={() => navigate('/disputes')} type="button">
        Voltar
      </button>

      <header className="page-header">
        <div>
          <h2>Disputa {data.id}</h2>
          <p className="muted">
            Rental {data.rentalId} | Estado: <strong>{data.status}</strong>
          </p>
        </div>
      </header>

      <div className="grid">
        <article className="card">
          <h3>Contexto</h3>
          <p>
            <strong>Aberta por:</strong> {data.openedByName}
          </p>
          <p>
            <strong>Contra:</strong> {data.againstUserName}
          </p>
          <p>
            <strong>Motivo:</strong> {data.reason}
          </p>
          <p>
            <strong>Descrição:</strong> {data.description}
          </p>
          {data.resolutionNote && (
            <p>
              <strong>Resolução:</strong> {data.resolutionNote}
            </p>
          )}
        </article>

        <article className="card">
          <h3>Responder cliente</h3>
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="Escreve uma resposta clara para o cliente"
            rows={4}
          />
          <button
            className="primary-btn"
            onClick={() => replyMutation.mutate()}
            type="button"
            disabled={replyMutation.isPending || !replyText.trim()}
          >
            {replyMutation.isPending ? 'A enviar...' : 'Enviar resposta'}
          </button>
        </article>
      </div>

      <article className="card">
        <h3>Histórico de mensagens</h3>
        <div className="message-list">
          {data.messages.map(msg => {
            const isSupport = msg.senderRole === 'Support';
            return (
              <div
                key={msg.id}
                style={{
                  border: isSupport ? '1px solid #16a34a' : '1px solid #e0e8f1',
                  background: isSupport ? '#dcfce7' : '#ffffff',
                  borderRadius: '10px',
                  padding: '10px',
                  alignSelf: isSupport ? 'flex-end' : 'flex-start',
                  width: isSupport ? '84%' : '100%',
                }}
              >
                <div className="message-meta">
                  <strong>{msg.senderName}</strong> ({msg.senderRole})
                  <span>{new Date(msg.createdAt).toLocaleString('pt-PT')}</span>
                </div>
                <p style={{ margin: '6px 0 0' }}>{msg.content}</p>
              </div>
            );
          })}
        </div>
      </article>

      <article className="card">
        <h3>Fechar disputa</h3>
        <textarea
          value={resolutionText}
          onChange={e => setResolutionText(e.target.value)}
          placeholder="Nota final da decisão"
          rows={3}
        />
        <label className="inline-checkbox" htmlFor="conclude-rental-checkbox">
          <input
            id="conclude-rental-checkbox"
            type="checkbox"
            checked={concludeRental}
            onChange={e => setConcludeRental(e.target.checked)}
          />
          Marcar também este aluguer como concluído
        </label>
        <button
          className="danger-btn"
          onClick={() => resolveMutation.mutate()}
          type="button"
          disabled={resolveMutation.isPending || !resolutionText.trim()}
        >
          {resolveMutation.isPending ? 'A fechar...' : 'Resolver disputa'}
        </button>
      </article>

      <article className="card">
        <h3>Moderação de contas</h3>
        <p className="muted">
          Use apenas em violação grave dos termos. Esta ação deve ficar auditada no backend.
        </p>
        <label htmlFor="ban-reason">Motivo do banimento</label>
        <textarea
          id="ban-reason"
          value={banReason}
          onChange={e => setBanReason(e.target.value)}
          placeholder="Ex.: fraude comprovada, abuso recorrente, conta comprometida"
          rows={3}
        />

        <label htmlFor="ban-duration">Duração (dias, opcional)</label>
        <input
          id="ban-duration"
          type="number"
          min={1}
          value={banDuration}
          onChange={e => setBanDuration(e.target.value)}
          placeholder="Vazio = banimento permanente"
        />

        <div className="actions-row">
          <button
            className="danger-btn"
            type="button"
            onClick={() => handleBan(data.openedByUserId, data.openedByName)}
            disabled={banMutation.isPending || !banReason.trim()}
          >
            Banir {data.openedByName}
          </button>

          <button
            className="danger-btn"
            type="button"
            onClick={() => handleBan(data.againstUserId, data.againstUserName)}
            disabled={banMutation.isPending || !banReason.trim()}
          >
            Banir {data.againstUserName}
          </button>
        </div>

        {banMutation.isError && (
          <div className="error-box">Falha ao banir conta. Verifique permissões no backend.</div>
        )}
      </article>
    </section>
  );
}
