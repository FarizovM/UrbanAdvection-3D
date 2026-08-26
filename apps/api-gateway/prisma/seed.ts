import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Запуск наповнення бази даних (Seeding)...');

    // Використовуємо сирий SQL для роботи з PostGIS функцією ST_MakePoint
    await prisma.$executeRaw`
    INSERT INTO monitoring_posts (id, name, location) VALUES 
    ('post-1', 'Пост №1 (м. Хрещатик)', ST_SetSRID(ST_MakePoint(30.5234, 50.4501), 4326)),
    ('post-2', 'Пост №2 (парк Шевченка)', ST_SetSRID(ST_MakePoint(30.5100, 50.4415), 4326)),
    ('post-3', 'Пост №3 (Поділ)', ST_SetSRID(ST_MakePoint(30.5140, 50.4650), 4326))
    ON CONFLICT (id) DO NOTHING;
  `;

    console.log('✅ Тестові пости моніторингу успішно додано!');
}

main()
    .catch((e) => {
        console.error('❌ Помилка під час сідування:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });