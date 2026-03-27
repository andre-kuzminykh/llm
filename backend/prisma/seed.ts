import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed price snapshots
  const prices = [
    {
      model: 'gpt-4o-mini',
      operationType: 'chat',
      inputPricePerToken: new Prisma.Decimal('0.00000015'),
      outputPricePerToken: new Prisma.Decimal('0.0000006'),
    },
    {
      model: 'gpt-4o',
      operationType: 'chat',
      inputPricePerToken: new Prisma.Decimal('0.0000025'),
      outputPricePerToken: new Prisma.Decimal('0.00001'),
    },
    {
      model: 'o3-mini',
      operationType: 'chat',
      inputPricePerToken: new Prisma.Decimal('0.0000011'),
      outputPricePerToken: new Prisma.Decimal('0.0000044'),
    },
    {
      model: 'o4-mini',
      operationType: 'chat',
      inputPricePerToken: new Prisma.Decimal('0.0000011'),
      outputPricePerToken: new Prisma.Decimal('0.0000044'),
    },
    {
      model: 'gpt-4o-mini-transcribe',
      operationType: 'transcription',
      pricePerMinute: new Prisma.Decimal('0.003'),
    },
    {
      model: 'gpt-4o-transcribe',
      operationType: 'transcription',
      pricePerMinute: new Prisma.Decimal('0.006'),
    },
  ];

  for (const price of prices) {
    await prisma.priceSnapshot.upsert({
      where: {
        model_operationType_isActive: {
          model: price.model,
          operationType: price.operationType,
          isActive: true,
        },
      },
      update: price,
      create: { ...price, isActive: true },
    });
  }

  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
