import { z } from 'zod';
import { HttpError } from '../src/utils/HttpError.js';
import bcrypt from 'bcryptjs';
import { parseEnvironment } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/models/User.js';
import { passwordSchema, validate } from '../src/utils/validation.js';
async function bootstrap() {
  const config = parseEnvironment();
  if (config.NODE_ENV !== 'development')
    throw new HttpError(400, 'Admin bootstrap is development-only');
  if (!config.MONGODB_URI) throw new HttpError(400, 'MONGODB_URI is required');
  const input = validate(
    z.object({
      name: z.string().trim().min(1).max(100),
      email: z.string().trim().toLowerCase().pipe(z.email()),
      password: passwordSchema,
    }),
    {
      name: process.env.ADMIN_NAME,
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    },
  );
  await connectDatabase(config.MONGODB_URI);
  await User.init();
  if (await User.exists({ email: input.email }))
    throw new HttpError(
      409,
      'Account already exists; bootstrap never promotes or overwrites an account',
    );
  if (await User.exists({ role: 'admin' }))
    throw new HttpError(
      409,
      'An admin already exists; bootstrap is for initial setup only',
    );
  await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, 12),
    role: 'admin',
    verificationStatus: 'verified',
  });
  console.info(
    'Initial admin account created. Remove ADMIN_PASSWORD from your environment.',
  );
}
bootstrap()
  .catch((error) => {
    console.error(
      error instanceof HttpError
        ? error.message
        : 'Admin creation failed. Check environment and database configuration.',
    );
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
