import { z } from 'zod';
import { HttpError } from './HttpError.js';
const text = (max) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        !/[<>]/.test(value) &&
        [...value].every(
          (character) =>
            character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
        ),
      'Use plain text without markup or control characters',
    );
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Use at most 72 UTF-8 bytes',
  );
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+()\d .-]*$/, 'Enter a valid phone number');
const organizationName = text(150);
export const registrationSchema = z
  .strictObject({
    name: text(100),
    email,
    password: passwordSchema,
    role: z.enum(['donor', 'ngo', 'volunteer']),
    phone: phone.optional(),
    organizationName: organizationName.optional(),
  })
  .refine((value) => value.role !== 'ngo' || !!value.organizationName, {
    path: ['organizationName'],
    message: 'Organization name is required for NGOs',
  });
export const loginSchema = z.strictObject({
  email,
  password: z
    .string()
    .min(1)
    .refine(
      (value) => Buffer.byteLength(value, 'utf8') <= 72,
      'Use at most 72 UTF-8 bytes',
    ),
});
export const profileSchema = z
  .strictObject({
    name: text(100).optional(),
    phone: phone.optional(),
    organizationName: organizationName.optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one profile field',
  );
export function validate(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const error = new HttpError(400, 'Please check the submitted fields');
    error.fields = Object.fromEntries(
      result.error.issues.map((issue) => [
        issue.path.join('.') || 'form',
        issue.message,
      ]),
    );
    throw error;
  }
  return result.data;
}
