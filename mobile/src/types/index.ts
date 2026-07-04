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
  dailyRate: number;
  imageUrl?: string;
  isAvailable: boolean;
  categoryName: string;
  owner: User;
  averageRating?: number;
  createdAt: string;
}

export type RentalStatus = 'Pending' | 'Active' | 'Completed' | 'Cancelled';

export interface Rental {
  id: string;
  item: TechItem;
  renter: User;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: RentalStatus;
  createdAt: string;
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
