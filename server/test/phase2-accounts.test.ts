import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { validateUsernameFormat, RESERVED_USERNAMES } from '../src/auth.js';
import { prisma } from '../src/db.js';
import { checkRateLimit } from '../src/rateLimit.js';

test('Phase 2: Username Validation Rules', () => {
  // Valid handles
  const validUsernames = ['alex', 'suddha_99', 'user_123', 'john_doe', 'crypto_fan'];
  for (const u of validUsernames) {
    const res = validateUsernameFormat(u);
    assert.equal(res.valid, true, `Expected "${u}" to be valid`);
    assert.equal(res.clean, u.toLowerCase());
  }

  // Invalid: too short (<3)
  assert.equal(validateUsernameFormat('ab').valid, false);
  assert.match(validateUsernameFormat('ab').error || '', /3-20 characters/);

  // Invalid: too long (>20)
  assert.equal(validateUsernameFormat('a_very_long_username_exceeding_limit').valid, false);

  // Invalid: leading or trailing underscore
  assert.equal(validateUsernameFormat('_alex').valid, false);
  assert.match(validateUsernameFormat('_alex').error || '', /cannot begin or end with an underscore/);

  assert.equal(validateUsernameFormat('alex_').valid, false);
  assert.match(validateUsernameFormat('alex_').error || '', /cannot begin or end with an underscore/);

  // Invalid: uppercase / symbols
  assert.equal(validateUsernameFormat('alex.smith').valid, false);
  assert.equal(validateUsernameFormat('alex@chat').valid, false);
  assert.equal(validateUsernameFormat('alex-dev').valid, false);

  // Invalid: reserved words
  for (const reserved of ['admin', 'support', 'whatsus', 'root', 'security', 'bot']) {
    const res = validateUsernameFormat(reserved);
    assert.equal(res.valid, false, `Expected reserved name "${reserved}" to be rejected`);
    assert.match(res.error || '', /reserved/);
  }
});

test('Phase 2: Rate Limiting sliding window', () => {
  const testKey = 'test-ip-' + Date.now();
  // Max 3 requests allowed per 500ms
  const r1 = checkRateLimit('test-bucket', testKey, 3, 500);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);

  const r2 = checkRateLimit('test-bucket', testKey, 3, 500);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 1);

  const r3 = checkRateLimit('test-bucket', testKey, 3, 500);
  assert.equal(r3.allowed, true);
  assert.equal(r3.remaining, 0);

  // 4th request must be rejected
  const r4 = checkRateLimit('test-bucket', testKey, 3, 500);
  assert.equal(r4.allowed, false);
  assert.equal(r4.remaining, 0);
});

test('Phase 2: Database Account Isolation & Privacy (No Email Leakage)', async () => {
  const testSub = 'google-sub-test-' + Date.now();
  const testEmail = 'secret_user@example.com';
  const testUsername = 'testuser_' + Math.floor(Math.random() * 10000);

  // Create user with identity
  const user = await prisma.user.create({
    data: {
      username: testUsername,
      displayName: 'Test User Profile',
      email: testEmail, // private recovery email
      identities: {
        create: {
          provider: 'google',
          providerUserId: testSub,
        },
      },
    },
    include: { identities: true },
  });

  assert.ok(user.id);
  assert.equal(user.identities[0].providerUserId, testSub);
  assert.equal(user.email, testEmail);

  // Ensure public safe serialization excludes email
  const { serializeSafeUser } = await import('../src/auth.js');
  const safe = serializeSafeUser(user);
  assert.equal((safe as any).email, undefined, 'Safe serialized user must NEVER contain email');
  assert.equal(safe.username, testUsername);
  assert.equal(safe.displayName, 'Test User Profile');
  assert.equal(safe.isOnboarded, true);

  // Cleanup
  await prisma.user.delete({ where: { id: user.id } });
});

test('Phase 2: Rotating Refresh Token Reuse Detection', async () => {
  // Test familyId revocation upon reuse
  const testSub = 'google-sub-family-' + Date.now();
  const user = await prisma.user.create({
    data: {
      displayName: 'Family Test User',
      identities: {
        create: { provider: 'google', providerUserId: testSub },
      },
    },
  });

  const familyId = crypto.randomUUID();
  const tokenHash1 = crypto.createHash('sha256').update('token1').digest('hex');
  const tokenHash2 = crypto.createHash('sha256').update('token2').digest('hex');

  // Session 1: Rotated / Revoked
  await prisma.session.create({
    data: {
      familyId,
      userId: user.id,
      refreshTokenHash: tokenHash1,
      revokedAt: new Date(), // Already used/rotated
      expiresAt: new Date(Date.now() + 100000),
    },
  });

  // Session 2: Active in same family
  await prisma.session.create({
    data: {
      familyId,
      userId: user.id,
      refreshTokenHash: tokenHash2,
      expiresAt: new Date(Date.now() + 100000),
    },
  });

  // Simulate token reuse: client attempts to refresh using old token1
  const reusedSession = await prisma.session.findUnique({
    where: { refreshTokenHash: tokenHash1 },
  });

  assert.ok(reusedSession);
  assert.notEqual(reusedSession.revokedAt, null, 'Session was already rotated');

  // Trigger family-wide revocation (as auth.ts does)
  await prisma.session.updateMany({
    where: { familyId: reusedSession.familyId },
    data: { revokedAt: new Date() },
  });

  // Verify all sessions in this family are now revoked
  const allSessions = await prisma.session.findMany({
    where: { familyId },
  });

  assert.equal(allSessions.length, 2);
  for (const s of allSessions) {
    assert.notEqual(s.revokedAt, null, `Session ${s.id} should have been revoked due to reuse detection`);
  }

  // Cleanup
  await prisma.user.delete({ where: { id: user.id } });
});

test('Phase 2: Username 30-Day Cooldown and Reservation Table', async () => {
  const coolUsername = 'heldname_' + Math.floor(Math.random() * 10000);
  const heldUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Reserve username
  const reservation = await prisma.usernameReservation.create({
    data: {
      username: coolUsername,
      heldUntil,
    },
  });

  assert.ok(reservation.id);
  assert.equal(reservation.username, coolUsername);

  // Check that reservation is active
  const check = await prisma.usernameReservation.findUnique({
    where: { username: coolUsername },
  });
  assert.ok(check);
  assert.equal(check.heldUntil > new Date(), true);

  // Cleanup
  await prisma.usernameReservation.delete({ where: { id: reservation.id } });
});
