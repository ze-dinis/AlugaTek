export type DisputeStatus =
  | 'Open'
  | 'UnderReview'
  | 'WaitingCustomer'
  | 'Resolved'
  | 'Rejected';

export interface DisputeSummary {
  id: string;
  rentalId: string;
  createdAt: string;
  status: DisputeStatus;
  openedByName: string;
  againstUserName: string;
  reason: string;
  assignedToName?: string;
}

export interface DisputeMessage {
  id: string;
  disputeId: string;
  senderId: string;
  senderName: string;
  senderRole: 'Customer' | 'Support' | 'System';
  content: string;
  imageUrls: string[];
  createdAt: string;
}

export interface DisputeDetail extends DisputeSummary {
  openedByUserId: string;
  againstUserId: string;
  description: string;
  resolutionNote?: string;
  messages: DisputeMessage[];
}

export interface BanAccountRequest {
  reason: string;
  durationDays?: number;
}

export interface SupportLoginResponse {
  token: string;
  name: string;
  role: 'Support' | 'Admin';
}
