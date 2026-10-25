import { User } from '../models/User.js';
import {
  loginSchema,
  registrationSchema,
  validate,
} from '../utils/validation.js';
import {
  registerUser,
  loginUser,
  publicUser,
} from '../services/authService.js';
import { issueSession, clearSession } from '../services/sessionService.js';
export function authController(config) {
  return {
    async register(req, res) {
      const user = await registerUser(validate(registrationSchema, req.body));
      issueSession(res, user, config);
      res.status(201).json({ user: publicUser(user) });
    },
    async login(req, res) {
      const user = await loginUser(validate(loginSchema, req.body));
      issueSession(res, user, config);
      res.json({ user: publicUser(user) });
    },
    async logout(req, res) {
      // Increment atomically: copied JWTs and all other sessions stop working too.
      await User.updateOne(
        { _id: req.user._id },
        { $inc: { tokenVersion: 1 } },
      );
      req.app.get('io')?.in(`user:${req.user._id}`).disconnectSockets(true);
      clearSession(res, config);
      res.status(204).end();
    },
    me(req, res) {
      res.json({ user: publicUser(req.user) });
    },
  };
}
