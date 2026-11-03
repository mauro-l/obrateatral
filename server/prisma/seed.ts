import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/auth.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set (see .env.example)');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Two fixed private users, from SEED_USERS="name:password,name:password".
  // Passwords are hashed with bcrypt and never stored or logged in plain text.
  const seedUsers = (process.env.SEED_USERS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of seedUsers) {
    // Format: "name:password" or "name:password:role" (role defaults to member).
    const parts = entry.split(':');
    const name = (parts[0] ?? '').trim();
    const password = parts[1] ?? '';
    const role = (parts[2] ?? 'member').trim() === 'admin' ? 'admin' : 'member';

    if (!name || !password) {
      console.warn(`SEED_USERS: entrada ignorada (formato "nombre:clave[:rol]"): ${entry}`);
      continue;
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.upsert({
      where: { name },
      // Never clobber a password changed through the web UI.
      update: {},
      create: { name, passwordHash, role },
    });
  }

  const users = await prisma.user.count();
  console.log(`Seeded ${users} user(s). No sessions are seeded: create them from the web.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => prisma.$disconnect());
