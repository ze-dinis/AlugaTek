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

type InboxTab = 'General' | 'DisputaTag';

export function DisputesInboxPage() {
  const [selectedStatus, setSelectedStatus] = useState<DisputeStatus | 'All'>('All');
  const [selectedTab, setSelectedTab] = useState<InboxTab>('General');

  const queryStatus = useMemo(
    () => (selectedStatus === 'All' ? undefined : selectedStatus),
    [selectedStatus],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['disputes', queryStatus],
    queryFn: () => disputesService.getInbox(queryStatus),
  });

  const filteredData = useMemo(() => {
    if (!data) return [];

    if (selectedTab === 'DisputaTag') {
      return data.filter(dispute => dispute.reason.trim().toUpperCase().startsWith('[DISPUTA]'));
    }

    return data;
  }, [data, selectedTab]);

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Inbox de disputas</h2>
          <p className="muted">Gerir pedidos com prioridade e contexto de aluguer.</p>
        </div>
      </header>

      <div className="filter-row">
        <button
          className={selectedTab === 'General' ? 'chip active' : 'chip'}
          onClick={() => setSelectedTab('General')}
          type="button"
        >
          Inbox geral
        </button>
        <button
          className={selectedTab === 'DisputaTag' ? 'chip active' : 'chip'}
          onClick={() => setSelectedTab('DisputaTag')}
          type="button"
        >
          [DISPUTA]
        </button>
      </div>

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

      {data && filteredData.length === 0 && <p>Nenhuma disputa encontrada para este filtro.</p>}

      {data && filteredData.length > 0 && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Disputa</th>
                <th>Anúncio</th>
                <th>Estado</th>
                <th>Cliente</th>
                <th>Contra</th>
                <th>Motivo</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map(dispute => (
                <tr key={dispute.id}>
                  <td>
                    <Link to={`/disputes/${dispute.id}`}>{dispute.id.slice(0, 8)}</Link>
                  </td>
                  <td>{dispute.itemTitle ?? '-'}</td>
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
