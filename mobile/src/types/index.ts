export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  phone?: string;
  averageRentalRating?: number | null;
  rentalReviewCount?: number;
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
  localidade?: string;
  dailyRate: number;
  caucao: number;
  imageUrl?: string;
  imageUrls?: string[];
  isAvailable: boolean;
  categoryName: string;
  owner: User;
  createdAt: string;
  isFavorite?: boolean;
  canDelete?: boolean;
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

export interface RentalUserReview {
  id: string;
  rentalId: string;
  rating: number;
  comment: string;
  reviewer: User;
  reviewee: User;
  createdAt: string;
}

export interface UserRentalReviewComment {
  id: string;
  rentalId: string;
  rating: number;
  comment: string;
  createdAt: string;
  reviewer: User;
  itemTitle: string;
}

export interface RentalReviewEligibility {
  rentalId: string;
  canReview: boolean;
  hasReviewed: boolean;
  reviewee?: User;
  reason?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  refreshToken?: string | null;
}

export interface RegisterResponse {
  message: string;
}

export interface Message {
  id: string;
  content: string;
  imageUrls?: string[];
  sender: User;
  receiver: User;
  createdAt: string;
  isRead: boolean;
  rentalId?: string;
  messageType: string;
}

export interface Conversation {
  itemId: string;
  itemTitle: string;
  itemImageUrl?: string;
  otherUserId: string;
  otherName: string;
  otherAvatarUrl?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}
