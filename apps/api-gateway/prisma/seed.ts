import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });


async function main() {
    console.log('🌱 Запуск наповнення бази даних (Seeding)...');

    // Використовуємо сирий SQL для роботи з PostGIS функцією ST_MakePoint
    await prisma.$executeRaw`
    INSERT INTO monitoring_posts (id, name, location) VALUES 
    ('post-1', 'Пост №1 (м. Хрещатик)', ST_SetSRID(ST_MakePoint(30.5234, 50.4501), 4326)),
    ('post-2', 'Пост №2 (парк Шевченка)', ST_SetSRID(ST_MakePoint(30.5100, 50.4415), 4326)),
    ('post-3', 'Пост №3 (Поділ)', ST_SetSRID(ST_MakePoint(30.5140, 50.4650), 4326)),
    ('post-4', 'Пост №4 (Голосіївський парк)', ST_SetSRID(ST_MakePoint(30.5075, 50.3865), 4326)),
    ('post-5', 'Пост №5 (Видубичі)', ST_SetSRID(ST_MakePoint(30.5605, 50.4066), 4326)),
    ('post-6', 'Пост №6 (Лівобережний)', ST_SetSRID(ST_MakePoint(30.5984, 50.4529), 4326)),
    ('post-7', 'Пост №7 (Троєщина)', ST_SetSRID(ST_MakePoint(30.6265, 50.5139), 4326)),
    ('post-8', 'Пост №8 (Оболонь)', ST_SetSRID(ST_MakePoint(30.4974, 50.5119), 4326)),
    ('post-9', 'Пост №9 (Сирець)', ST_SetSRID(ST_MakePoint(30.4326, 50.4823), 4326)),
    ('post-10', 'Пост №10 (Нивки)', ST_SetSRID(ST_MakePoint(30.4180, 50.4583), 4326)),
    ('post-11', 'Пост №11 (Соломʼянка)', ST_SetSRID(ST_MakePoint(30.4676, 50.4318), 4326)),
    ('post-12', 'Пост №12 (Борщагівка)', ST_SetSRID(ST_MakePoint(30.3765, 50.4318), 4326)),
    ('post-13', 'Пост №13 (Жуляни)', ST_SetSRID(ST_MakePoint(30.4075, 50.4048), 4326)),
    ('post-14', 'Пост №14 (ДВРЗ)', ST_SetSRID(ST_MakePoint(30.6500, 50.4456), 4326)),
    ('post-15', 'Пост №15 (Позняки)', ST_SetSRID(ST_MakePoint(30.6458, 50.4082), 4326)),
    ('post-16', 'Пост №16 (Осокорки)', ST_SetSRID(ST_MakePoint(30.6711, 50.3925), 4326)),
    ('post-17', 'Пост №17 (Північний Поділ)', ST_SetSRID(ST_MakePoint(30.5040, 50.4816), 4326)),
    ('post-18', 'Пост №18 (Лукʼянівка)', ST_SetSRID(ST_MakePoint(30.4818, 50.4627), 4326)),
    ('post-19', 'Пост №19 (Печерськ)', ST_SetSRID(ST_MakePoint(30.5415, 50.4245), 4326)),
    ('post-20', 'Пост №20 (Святошин)', ST_SetSRID(ST_MakePoint(30.3606, 50.4589), 4326)),
    ('post-21', 'Пост №21 (Русанівка)', ST_SetSRID(ST_MakePoint(30.5760, 50.4436), 4326)),
    ('post-22', 'Пост №22 (Теремки)', ST_SetSRID(ST_MakePoint(30.4755, 50.3670), 4326)),
    ('post-23', 'Пост №23 (Воскресенка)', ST_SetSRID(ST_MakePoint(30.5963, 50.4825), 4326))
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
