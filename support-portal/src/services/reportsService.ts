import { api } from '../lib/api';

export interface UserReportSummary {
  id: string;
  reason: string;
  createdAt: string;
  reporterName: string;
  reporterEmail: string;
  reportedUserName: string;
  reportedUserEmail: string;
  reportedUserId: string;
  itemTitle: string;
  itemId: string;
}

export const reportsService = {
  getAll: async (): Promise<UserReportSummary[]> => {
    const { data } = await api.get<UserReportSummary[]>('/support/reports');
    return data;
  },
};
