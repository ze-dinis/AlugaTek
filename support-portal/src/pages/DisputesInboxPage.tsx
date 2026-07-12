import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { disputesService } from '../services/disputesService';
import type { DisputeStatus } from '../types/disputes';

const statuses: Array<{ label: string; value: DisputeStatus | 'All' }> = [
  { label: 'Todas', value: 'All' },
  { label: 'Abertas', value: 'Open' },
  { label: 'Em análise', value: 'UnderReview' },
  { label: 'Aguarda cliente', value: 'WaitingCustomer' },
  { label: 'Resolvidas', value: 'Resolved' },
  { label: 'Rejeitadas', value: 'Rejected' },
];

export function DisputesInboxPage() {
  const [selectedStatus, setSelectedStatus] = useState<DisputeStatus | 'All'>('All');

  const queryStatus = useMemo(
    () => (selectedStatus === 'All' ? undefined : selectedStatus),
    [selectedStatus],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['disputes', queryStatus],
    queryFn: () => disputesService.getInbox(queryStatus),
  });

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Inbox de disputas</h2>
          <p className="muted">Gerir pedidos com prioridade e contexto de aluguer.</p>
        </div>
      </header>

      <div className="filter-row">
        {statuses.map(option => (
          <button
            key={option.value}
            className={selectedStatus === option.value ? 'chip active' : 'chip'}
            onClick={() => setSelectedStatus(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {isLoading && <p>A carregar disputas...</p>}
      {isError && <p>Erro ao carregar disputas.</p>}

      {data && data.length === 0 && <p>Nenhuma disputa encontrada para este filtro.</p>}

      {data && data.length > 0 && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Disputa</th>
                <th>Estado</th>
                <th>Cliente</th>
                <th>Contra</th>
                <th>Motivo</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {data.map(dispute => (
                <tr key={dispute.id}>
                  <td>
                    <Link to={`/disputes/${dispute.id}`}>{dispute.id.slice(0, 8)}</Link>
                  </td>
                  <td>
                    <span className={`status status-${dispute.status}`}>{dispute.status}</span>
                  </td>
                  <td>{dispute.openedByName}</td>
                  <td>{dispute.againstUserName}</td>
                  <td>{dispute.reason}</td>
                  <td>{new Date(dispute.createdAt).toLocaleString('pt-PT')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
