import { User } from '../models/User.js';
import { profileSchema, validate } from '../utils/validation.js';
import { publicUser } from '../services/authService.js';
import { HttpError } from '../utils/HttpError.js';
export function getProfile(req, res) {
  res.json({ user: publicUser(req.user) });
}
export async function updateProfile(req, res) {
  const updates = validate(profileSchema, req.body);
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true, projection: '+location +address' },
  );
  if (!user) throw new HttpError(401, 'Authentication required');
  res.json({ user: publicUser(user) });
}
