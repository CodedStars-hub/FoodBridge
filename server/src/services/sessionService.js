import jwt from 'jsonwebtoken';
export function cookieName(config) {
  return config.NODE_ENV === 'production'
    ? '__Host-foodbridge_session'
    : 'foodbridge_session';
}
export function cookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: config.COOKIE_SAME_SITE,
    path: '/',
  };
}
export function issueSession(res, user, config) {
  const token = jwt.sign(
    { version: user.tokenVersion ?? 0 },
    config.JWT_SECRET,
    {
      algorithm: 'HS256',
      subject: String(user._id),
      expiresIn: config.JWT_EXPIRES_SECONDS,
      issuer: 'foodbridge-api',
      audience: 'foodbridge-client',
    },
  );
  res.cookie(cookieName(config), token, {
    ...cookieOptions(config),
    maxAge: config.JWT_EXPIRES_SECONDS * 1000,
  });
}
export function clearSession(res, config) {
  res.clearCookie(cookieName(config), cookieOptions(config));
}
export function verifySession(token, config) {
  return jwt.verify(token, config.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: 'foodbridge-api',
    audience: 'foodbridge-client',
  });
}
