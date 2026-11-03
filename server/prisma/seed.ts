import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { plays } from '../src/plays.js';
import { hashPassword } from '../src/auth.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set (see .env.example)');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Placeholders until the real catalogue arrives.
  for (const play of plays) {
    await prisma.play.upsert({
      where: { id: play.id },
      update: play,
      create: play,
    });
  }

  // Two fixed private users, from SEED_USERS="name:password,name:password".
  // Passwords are hashed with bcrypt and never stored or logged in plain text.
  const seedUsers = (process.env.SEED_USERS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of seedUsers) {
    const separator = entry.indexOf(':');
    const name = separator > 0 ? entry.slice(0, separator).trim() : '';
    const password = separator > 0 ? entry.slice(separator + 1) : '';

    if (!name || !password) {
      console.warn(`SEED_USERS: entrada ignorada (formato "nombre:clave"): ${entry}`);
      continue;
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.upsert({
      where: { name },
      update: { passwordHash },
      create: { name, passwordHash },
    });
  }

  const total = await prisma.play.count();
  const users = await prisma.user.count();
  console.log(`Seeded ${total} play(s) and ${users} user(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => prisma.$disconnect());
