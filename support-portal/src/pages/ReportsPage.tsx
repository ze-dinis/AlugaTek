import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsService } from '../services/reportsService';
import { usersService } from '../services/usersService';

export function ReportsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports'],
    queryFn: reportsService.getAll,
  });

  const [banningId, setBanningId] = useState<string | null>(null);

  async function handleQuickBan(reportedUserId: string, reportedUserEmail: string, reason: string) {
    const confirmed = window.confirm(
      `Banir a conta ${reportedUserEmail} com o motivo: "${reason}"?`,
    );
    if (!confirmed) return;

    setBanningId(reportedUserId);
    try {
      await usersService.banByEmail({ email: reportedUserEmail, reason });
      window.alert(`Conta ${reportedUserEmail} banida com sucesso.`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Ocorreu um erro inesperado.';
      window.alert(`Erro: ${msg}`);
    } finally {
      setBanningId(null);
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Denúncias de utilizadores</h2>
          <p className="muted">Todas as denúncias submetidas por utilizadores da plataforma.</p>
        </div>
      </header>

      {isLoading && <p>A carregar...</p>}
      {isError && <p className="error-box">Não foi possível carregar as denúncias.</p>}

      {data && data.length === 0 && (
        <p className="muted">Não existem denúncias.</p>
      )}

      {data && data.length > 0 && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Denunciado</th>
                <th>Denunciante</th>
                <th>Anúncio</th>
                <th>Motivo</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(r.createdAt).toLocaleString('pt-PT')}
                  </td>
                  <td>
                    <div>{r.reportedUserName}</div>
                    <div style={{ fontSize: 12, color: '#4e5d6e' }}>{r.reportedUserEmail}</div>
                  </td>
                  <td>
                    <div>{r.reporterName}</div>
                    <div style={{ fontSize: 12, color: '#4e5d6e' }}>{r.reporterEmail}</div>
                  </td>
                  <td>{r.itemTitle}</td>
                  <td>{r.reason}</td>
                  <td>
                    <button
                      className="danger-btn"
                      style={{ padding: '6px 12px', fontSize: 13 }}
                      disabled={banningId === r.reportedUserId}
                      onClick={() =>
                        handleQuickBan(r.reportedUserId, r.reportedUserEmail, r.reason)
                      }
                      type="button"
                    >
                      {banningId === r.reportedUserId ? 'A banir...' : 'Banir'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
