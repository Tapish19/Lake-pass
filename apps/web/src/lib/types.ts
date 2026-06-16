export interface MarinaSummary {
  id: string;
  name: string;
  lake: string;
  city?: string;
  state?: string;
  phone?: string;
}

export interface Review {
  id: string;
  rating: number;
  comment?: string;
  createdAt: string;
  user?: { name: string };
}

export interface BoatListing {
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
  status: 'available' | 'booked' | 'maintenance';
  rating?: number | null;
  reviewCount?: number;
  marina: MarinaSummary;
  reviews?: Review[];
}

export interface Addon {
  id: string;
  marinaId: string;
  name: string;
  price: number;
  description?: string;
}

export interface Reservation {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  paymentStatus: string;
  totalAmount?: number;
  boat: BoatListing;
}
