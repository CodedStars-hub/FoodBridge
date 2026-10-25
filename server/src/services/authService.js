import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { HttpError } from '../utils/HttpError.js';
export function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    ...(user.location ? { location: user.location } : {}),
    ...(user.address ? { address: user.address } : {}),
    phone: user.phone || '',
    organizationName: user.organizationName || '',
    verificationStatus: user.verificationStatus,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
export async function registerUser(input) {
  if (await User.exists({ email: input.email }))
    throw new HttpError(409, 'An account with this email already exists');
  const { password, ...profile } = input;
  const passwordHash = await bcrypt.hash(password, 12);
  return User.create({ ...profile, passwordHash });
}
// A valid bcrypt hash keeps unknown-email logins on the same comparison path.
const dummyHash = bcrypt.hashSync('unused timing comparison value', 12);
export async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select(
    '+passwordHash +tokenVersion +location +address',
  );
  const valid = await bcrypt.compare(password, user?.passwordHash || dummyHash);
  if (!user || !valid) throw new HttpError(401, 'Invalid email or password');
  return user;
}
