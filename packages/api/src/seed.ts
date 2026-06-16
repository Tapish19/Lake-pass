import 'dotenv/config';
import { prisma } from './lib/prisma';

async function main() {
  const marinaName = 'Lake Pass Marina';
  let marina = await prisma.marina.findFirst({ where: { name: marinaName } });
  if (!marina) {
    marina = await prisma.marina.create({
      data: {
        name: marinaName,
        lake: 'Lake of the Ozarks',
        address: '123 Dockside Drive',
        city: 'Osage Beach',
        state: 'MO',
        phone: '+1 555 987 6543',
        website: 'https://lakepass.example',
        logoUrl: 'https://placehold.co/200x200',
      },
    });
    console.log(`Created marina ${marina.name} (${marina.id})`);
  } else {
    console.log(`Found existing marina ${marina.name} (${marina.id})`);
  }

  const boats = [
    {
      name: 'Sunrise Pontoon',
      type: 'Pontoon',
      capacity: 10,
      dailyRate: 425,
      hourlyRate: 85,
      description: 'A comfortable pontoon perfect for group outings and sunset cruises.',
      amenities: ['Bluetooth stereo', 'Cooler', 'Life jackets'],
      photoUrls: ['https://placehold.co/600x400?text=Sunrise+Pontoon'],
    },
    {
      name: 'Bay Cruiser',
      type: 'Deck Boat',
      capacity: 8,
      dailyRate: 495,
      hourlyRate: 95,
      description: 'A smooth deck boat with plenty of room for family and friends.',
      amenities: ['Stereo', 'Bimini top', 'Fishing rod holders'],
      photoUrls: ['https://placehold.co/600x400?text=Bay+Cruiser'],
    },
    {
      name: 'Wake Pro',
      type: 'Ski Boat',
      capacity: 6,
      dailyRate: 540,
      hourlyRate: 110,
      description: 'A high-performance ski boat built for watersports and fast fun.',
      amenities: ['Tow pylon', 'Premium sound', 'Wake tower'],
      photoUrls: ['https://placehold.co/600x400?text=Wake+Pro'],
    },
  ];

  for (const boatData of boats) {
    const existingBoat = await prisma.boat.findFirst({
      where: { name: boatData.name, marinaId: marina.id },
    });
    if (existingBoat) {
      console.log(`Boat already exists: ${existingBoat.name}`);
      continue;
    }
    const boat = await prisma.boat.create({
      data: {
        ...boatData,
        isActive: true,
        marinaId: marina.id,
      },
    });
    console.log(`Created boat ${boat.name} (${boat.id})`);
  }

  console.log('Seeding complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
