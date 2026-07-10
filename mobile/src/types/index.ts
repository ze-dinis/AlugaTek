export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  phone?: string;
}

export interface Category {
  id: number;
  name: string;
  iconUrl?: string;
}

export interface TechItem {
  id: string;
  title: string;
  description: string;
  district: string;
  dailyRate: number;
  caucao: number;
  imageUrl?: string;
  isAvailable: boolean;
  categoryName: string;
  owner: User;
  averageRating?: number;
  createdAt: string;
}

export type RentalStatus = 'Pending' | 'Active' | 'Completed' | 'ReturnRequested' | 'Returned' | 'Cancelled';

export type PaymentStatus = 'None' | 'Held' | 'Captured' | 'Released' | 'Failed';

export interface Rental {
  id: string;
  item: TechItem;
  renter: User;
  startDate: string;
  endDate: string;
  totalPrice: number;
  caucaoAmount: number;
  status: RentalStatus;
  createdAt: string;
  paymentStatus: PaymentStatus;
  caucaoPaymentStatus: PaymentStatus;
  captureBefore?: string;
  extendedAuthorizationStatus?: string;
}

export interface Review {
  id: string;
  rating: number;
  comment: string;
  author: User;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Message {
  id: string;
  content: string;
  sender: User;
  receiver: User;
  createdAt: string;
  isRead: boolean;
}

export interface Conversation {
  otherId: string;
  otherName: string;
  otherAvatarUrl?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}
