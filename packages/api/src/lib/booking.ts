import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';

export type BookingTx = Prisma.TransactionClient;

const ACTIVE_RESERVATION_STATUSES = [
  'pending',
  'confirmed',
  'checked_in',
] as const;

/**
 * Serializes reservation writes for the same boat inside PostgreSQL.
 * The lock is released automatically when the transaction completes.
 */
export async function withBoatBookingLock<T>(
  boatId: string,
  work: (tx: BookingTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${boatId}, 0))
    `;

    return work(tx);
  });
}

export async function assertNoBookingConflict(
  tx: BookingTx,
  boatId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string,
): Promise<void> {
  const boat = await tx.boat.findUniqueOrThrow({
    where: { id: boatId },
    select: {
      isActive: true,
      status: true,
      turnaroundBuffer: true,
    },
  });

  if (!boat.isActive) {
    throw new AppError(409, 'Boat is not active');
  }

  if (boat.status === 'maintenance') {
    throw new AppError(409, 'Boat is currently under maintenance');
  }

  const bufferMs = (boat.turnaroundBuffer ?? 0) * 60_000;
  const windowStart = new Date(startDate.getTime() - bufferMs);
  const windowEnd = new Date(endDate.getTime() + bufferMs);

  const [reservationConflict, blockoutConflict] = await Promise.all([
    tx.reservation.findFirst({
      where: {
        boatId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        status: {
          in: [...ACTIVE_RESERVATION_STATUSES],
        },
        startDate: { lt: windowEnd },
        endDate: { gt: windowStart },
      },
      select: { id: true },
    }),

    tx.blockout.findFirst({
      where: {
        boatId,
        startDate: { lt: endDate },
        endDate: { gt: startDate },
      },
      select: { id: true },
    }),
  ]);

  if (reservationConflict) {
    throw new AppError(
      409,
      'Boat is not available for the selected dates, including its turnaround buffer',
    );
  }

  if (blockoutConflict) {
    throw new AppError(
      409,
      'Boat is blocked for maintenance during those dates',
    );
  }
}

function rentalDays(start: Date, end: Date): number {
  return Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / 86_400_000),
  );
}

export async function calculateReservationTotals(
  tx: BookingTx,
  boatId: string,
  startDate: Date,
  endDate: Date,
  requestedAddonIds: string[],
) {
  const boat = await tx.boat.findUniqueOrThrow({
    where: { id: boatId },
  });

  const addonIds = [...new Set(requestedAddonIds)];

  const addons = addonIds.length
    ? await tx.addon.findMany({
        where: {
          id: { in: addonIds },
          marinaId: boat.marinaId,
        },
      })
    : [];

  if (addons.length !== addonIds.length) {
    throw new AppError(
      400,
      'One or more add-ons do not belong to this marina',
    );
  }

  const rentalAmount = roundMoney(
    boat.dailyRate * rentalDays(startDate, endDate),
  );

  const addonAmount = roundMoney(
    addons.reduce((sum, addon) => sum + addon.price, 0),
  );

  const platformFee = roundMoney(
    (rentalAmount + addonAmount) * 0.1,
  );

  const totalAmount = roundMoney(
    rentalAmount + addonAmount + platformFee,
  );

  const depositAmount = roundMoney(totalAmount * 0.25);

  return {
    boat,
    addons,
    rentalAmount,
    addonAmount,
    platformFee,
    totalAmount,
    depositAmount,
  };
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
