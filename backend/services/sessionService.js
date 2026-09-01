import crypto from 'crypto';
import UserSession from '../models/UserSession.js';
import User from '../models/User.js';

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function parseClientMeta(req) {
  return {
    ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || '',
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
  };
}

export function normalizeIp(ip = '') {
  const value = String(ip).trim();
  if (!value || value === '::1' || value === '127.0.0.1' || value.includes('::ffff:127.0.0.1')) {
    return 'localhost';
  }
  return value;
}

function sessionFingerprint(userId, ipAddress, userAgent) {
  return `${userId}|${normalizeIp(ipAddress)}|${userAgent}`;
}

export async function createUserSession(userId, tokenId, req) {
  const meta = parseClientMeta(req);
  const normalizedIp = normalizeIp(meta.ipAddress);
  const ipVariants = normalizedIp === 'localhost'
    ? ['::1', '127.0.0.1', 'localhost', '']
    : [meta.ipAddress, normalizedIp];

  await UserSession.updateMany(
    {
      user: userId,
      revokedAt: null,
      userAgent: meta.userAgent,
      ipAddress: { $in: ipVariants },
    },
    {
      $set: {
        revokedAt: new Date(),
        revokeReason: 'Replaced by new login from same device',
      },
    }
  );

  return UserSession.create({
    user: userId,
    tokenId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    loginAt: new Date(),
    lastActiveAt: new Date(),
  });
}

export async function touchUserSession(tokenId) {
  if (!tokenId) return;
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  await UserSession.updateOne(
    { tokenId, revokedAt: null, lastActiveAt: { $lt: cutoff } },
    { $set: { lastActiveAt: new Date() } }
  );
}

export async function revokeSessionByTokenId(tokenId, revokedBy = null, reason = 'Logged out') {
  if (!tokenId) return null;
  return UserSession.findOneAndUpdate(
    { tokenId, revokedAt: null },
    {
      $set: {
        revokedAt: new Date(),
        revokedBy,
        revokeReason: reason,
      },
    },
    { new: true }
  );
}

export async function revokeAllUserSessions(userId, revokedBy = null, reason = 'Force logout by administrator') {
  const user = await User.findById(userId);
  if (!user) return { sessionsRevoked: 0 };

  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  const result = await UserSession.updateMany(
    { user: userId, revokedAt: null },
    {
      $set: {
        revokedAt: new Date(),
        revokedBy,
        revokeReason: reason,
      },
    }
  );

  return { sessionsRevoked: result.modifiedCount, tokenVersion: user.tokenVersion };
}

export async function revokeSessionById(sessionId, revokedBy = null) {
  const session = await UserSession.findById(sessionId);
  if (!session || session.revokedAt) return null;

  session.revokedAt = new Date();
  session.revokedBy = revokedBy;
  session.revokeReason = 'Force logout by administrator';
  await session.save();
  return session;
}

/** Remove duplicate sessions — keep the original login, revoke newer copies from same device. */
export async function cleanupDuplicateSessions() {
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const active = await UserSession.find({
    revokedAt: null,
    lastActiveAt: { $gte: since },
  }).sort({ loginAt: 1 });

  const groups = new Map();
  for (const session of active) {
    const userId = session.user?.toString();
    const key = sessionFingerprint(userId, session.ipAddress, session.userAgent);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
  }

  let removed = 0;
  for (const group of groups.values()) {
    if (group.length <= 1) continue;

    // Original = earliest login; current = most recently active
    group.sort((a, b) => new Date(a.loginAt) - new Date(b.loginAt));
    const original = group[0];
    const current = group.reduce((best, s) => (
      new Date(s.lastActiveAt) > new Date(best.lastActiveAt) ? s : best
    ), group[0]);

    for (const session of group) {
      if (session._id.equals(original._id)) continue;
      if (session._id.equals(current._id)) {
        // Merge original login time onto the live session row
        if (new Date(current.loginAt) > new Date(original.loginAt)) {
          current.loginAt = original.loginAt;
          await current.save();
        }
        continue;
      }
      session.revokedAt = new Date();
      session.revokeReason = 'Duplicate session removed';
      await session.save();
      removed += 1;
    }

    // If current is not original, merge login time and revoke original if it's stale
    if (!current._id.equals(original._id)) {
      if (new Date(original.lastActiveAt) < Date.now() - 5 * 60 * 1000) {
        original.revokedAt = new Date();
        original.revokeReason = 'Duplicate session removed';
        await original.save();
        removed += 1;
      }
      current.loginAt = original.loginAt;
      await current.save();
    }
  }

  return removed;
}

export async function listActiveSessions() {
  await cleanupDuplicateSessions();

  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const sessions = await UserSession.find({
    revokedAt: null,
    lastActiveAt: { $gte: since },
  })
    .populate('user', 'name email isActive')
    .sort({ lastActiveAt: -1 });

  const seen = new Map();
  const unique = [];

  for (const s of sessions) {
    const userId = s.user?._id?.toString();
    if (!userId) continue;

    const key = sessionFingerprint(userId, s.ipAddress, s.userAgent);
    if (seen.has(key)) continue;
    seen.set(key, true);

    unique.push({
      id: s._id,
      tokenId: s.tokenId,
      user: {
        id: s.user._id,
        name: s.user.name,
        email: s.user.email,
        isActive: s.user.isActive,
      },
      ipAddress: normalizeIp(s.ipAddress) === 'localhost' ? 'localhost' : s.ipAddress,
      userAgent: s.userAgent,
      loginAt: s.loginAt,
      lastActiveAt: s.lastActiveAt,
      isOnline: Date.now() - new Date(s.lastActiveAt).getTime() < 5 * 60 * 1000,
      isOriginal: true,
    });
  }

  return unique.sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt));
}

export function createTokenId() {
  return crypto.randomUUID();
}
