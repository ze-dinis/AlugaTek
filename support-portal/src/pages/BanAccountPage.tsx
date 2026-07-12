import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { usersService, type BanByEmailResponse } from '../services/usersService';

export function BanAccountPage() {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [result, setResult] = useState<BanByEmailResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const banMutation = useMutation({
    mutationFn: () => {
      const parsedDays = Number(durationDays);
      const hasDuration = durationDays.trim().length > 0;
      const days =
        hasDuration && Number.isFinite(parsedDays) && parsedDays > 0
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
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Ocorreu um erro inesperado.';
      setErrorMsg(msg);
      setResult(null);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setResult(null);
    if (!email.trim() || !reason.trim()) return;
    banMutation.mutate();
  }

  const bannedUntilLabel = result?.bannedUntil
    ? new Date(result.bannedUntil).toLocaleString('pt-PT')
    : 'Permanente';

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Banir conta</h2>
          <p className="muted">Pesquisa por email e aplica um banimento à conta.</p>
        </div>
      </header>

      <div style={{ maxWidth: 520 }}>
        <article className="card">
          <form onSubmit={handleSubmit}>
            <label htmlFor="ban-email">Email da conta</label>
            <input
              id="ban-email"
              type="email"
              placeholder="utilizador@exemplo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />

            <label htmlFor="ban-reason">Motivo do banimento</label>
            <textarea
              id="ban-reason"
              placeholder="Descreve o motivo do banimento..."
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
            />

            <label htmlFor="ban-duration">
              Duração (dias) &mdash; <span className="muted">deixa em branco para banimento permanente</span>
            </label>
            <input
              id="ban-duration"
              type="number"
              min={1}
              placeholder="ex: 30"
              value={durationDays}
              onChange={e => setDurationDays(e.target.value)}
            />

            {errorMsg && <div className="error-box">{errorMsg}</div>}

            <div className="actions-row">
              <button
                type="submit"
                className="danger-btn"
                disabled={banMutation.isPending || !email.trim() || !reason.trim()}
              >
                {banMutation.isPending ? 'A banir...' : 'Banir conta'}
              </button>
            </div>
          </form>
        </article>

        {result && (
          <article className="card" style={{ marginTop: 16, borderColor: '#a11d1d' }}>
            <h3 style={{ color: '#a11d1d', margin: '0 0 8px' }}>Conta banida com sucesso</h3>
            <p>
              <strong>Email:</strong> {result.email}
            </p>
            <p>
              <strong>Motivo:</strong> {result.banReason}
            </p>
            <p>
              <strong>Válido até:</strong> {bannedUntilLabel}
            </p>
          </article>
        )}
      </div>
    </section>
  );
}
