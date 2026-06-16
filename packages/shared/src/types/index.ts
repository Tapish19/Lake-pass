export type BoatStatus = 'available' | 'booked' | 'maintenance';
export type ReservationStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export type PaymentStatus = 'unpaid' | 'deposit_paid' | 'paid' | 'refunded' | 'partially_refunded';
export type StaffRole = 'owner' | 'manager' | 'staff';

export interface Marina {
  id: string;
  name: string;
  lake: string;
  address: string;
  city: string;
  state: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  logoUrl?: string;
  widgetColor?: string;
}

export interface Boat {
  id: string;
  marinaId: string;
  name: string;
  type: string;
  capacity: number;
  dailyRate: number;
  hourlyRate?: number;
  description?: string;
  amenities: string[];
  photoUrls: string[];
  status: BoatStatus;
  marina?: Pick<Marina, 'id' | 'name'>;
}

export interface Reservation {
  id: string;
  boatId: string;
  userId: string;
  startDate: string;
  endDate: string;
  status: ReservationStatus;
  paymentStatus: PaymentStatus;
  totalAmount?: number;
  depositAmount?: number;
  addons: string[];
  notes?: string;
  boat?: Boat;
}

export interface User {
  id: string;
  clerkId: string;
  name: string;
  email: string;
  phone?: string;
}

export interface Review {
  id: string;
  boatId: string;
  userId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}
