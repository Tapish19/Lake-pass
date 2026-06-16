import { demoAddons, demoBoats } from './demo';
import type { Addon, BoatListing, Reservation } from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? 'Something went wrong');
  }
  return response.json();
}

export async function getBoats(query = ''): Promise<{ boats: BoatListing[]; demo: boolean }> {
  try {
    return { boats: await request<BoatListing[]>(`/boats${query ? `?${query}` : ''}`), demo: false };
  } catch {
    const params = new URLSearchParams(query);
    const type = params.get('type');
    const guests = Number(params.get('guests') ?? 0);
    return {
      boats: demoBoats.filter((boat) => (!type || boat.type === type) && (!guests || boat.capacity >= guests)),
      demo: true,
    };
  }
}

export async function getBoat(id: string): Promise<{ boat: BoatListing; demo: boolean }> {
  if (id.startsWith('demo-')) {
    const boat = demoBoats.find((item) => item.id === id);
    if (!boat) throw new Error('Boat not found');
    return { boat, demo: true };
  }
  try {
    return { boat: await request<BoatListing>(`/boats/${id}`), demo: false };
  } catch {
    return { boat: demoBoats[0], demo: true };
  }
}

export async function getAddons(marinaId: string, demo: boolean): Promise<Addon[]> {
  if (demo) return demoAddons;
  return request<Addon[]>(`/addons?marinaId=${encodeURIComponent(marinaId)}`).catch(() => []);
}

export async function authedRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  return request<T>(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
}

export async function getTrips(token: string): Promise<Reservation[]> {
  return authedRequest<Reservation[]>('/reservations', token);
}
