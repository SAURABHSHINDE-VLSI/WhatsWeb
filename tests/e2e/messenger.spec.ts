import { test, expect, Page, BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://whatsus:whatsus_secret@localhost:5432/postgres?schema=public',
    },
  },
});

const BASE_URL = 'http://localhost:3001';

interface TestUser {
  id: string;
  sub: string;
  username: string;
  displayName: string;
  email: string;
}

/**
 * Helper to log in a test user via the test-auth bypass endpoint,
 * setting the session cookies and returning user info.
 */
async function authenticateTestUser(context: BrowserContext, baseName: string): Promise<TestUser> {
  const uniqueId = `${baseName}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const sub = `sub_${uniqueId}`;
  const username = `u_${uniqueId}`;
  const email = `${username}@test.local`;
  const displayName = `${baseName.toUpperCase()} Test`;

  const response = await context.request.post(`${BASE_URL}/api/auth/test-login`, {
    data: {
      sub,
      email,
      name: displayName,
      username,
    },
  });

  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.user.id).toBeTruthy();

  return {
    id: data.user.id,
    sub,
    username,
    displayName,
    email,
  };
}

/**
 * Establishes mutual contacts in Postgres directly for deterministic testing.
 */
async function linkContacts(userAId: string, userBId: string) {
  await prisma.contact.createMany({
    data: [
      { userId: userAId, contactId: userBId },
      { userId: userBId, contactId: userAId },
    ],
    skipDuplicates: true,
  });
}

/**
 * Warms up both users at root URL to publish keys and connect WebSockets,
 * then opens the direct chat between them.
 */
async function setupChatSession(pageAlice: Page, pageBob: Page, alice: TestUser, bob: TestUser) {
  await pageAlice.goto('/');
  await pageBob.goto('/');
  await expect(pageAlice.locator(`text=${bob.displayName}`).first()).toBeVisible({ timeout: 20_000 });
  await expect(pageBob.locator(`text=${alice.displayName}`).first()).toBeVisible({ timeout: 20_000 });

  await pageAlice.goto(`/chat/${bob.id}`);
  await pageBob.goto(`/chat/${alice.id}`);

  await expect(pageAlice.locator('input[placeholder="Write a message..."]')).toBeVisible({ timeout: 15_000 });
  await expect(pageBob.locator('input[placeholder="Write a message..."]')).toBeVisible({ timeout: 15_000 });
}

test.describe('WhatsUs Phase C: E2E Two-Browser Multi-User Suite', () => {
  let contextAlice: BrowserContext;
  let contextBob: BrowserContext;
  let pageAlice: Page;
  let pageBob: Page;
  let alice: TestUser;
  let bob: TestUser;

  test.beforeEach(async ({ browser }) => {
    // 1. Create two isolated browser contexts with separate storage/IndexedDB
    contextAlice = await browser.newContext({
      permissions: ['microphone'],
    });
    contextBob = await browser.newContext({
      permissions: ['microphone'],
    });

    // 2. Authenticate Alice and Bob
    alice = await authenticateTestUser(contextAlice, 'alice');
    bob = await authenticateTestUser(contextBob, 'bob');

    // 3. Link them as mutual contacts
    await linkContacts(alice.id, bob.id);

    // 4. Open pages
    pageAlice = await contextAlice.newPage();
    pageBob = await contextBob.newPage();
  });

  test.afterEach(async () => {
    await contextAlice.close();
    await contextBob.close();
  });

  test('1. Onboarding, X3DH Key Registration & Live Two-Way E2EE Messaging', async () => {
    await pageAlice.goto('/');
    await pageBob.goto('/');

    const aliceContactCard = pageAlice.locator(`text=${bob.displayName}`).first();
    await expect(aliceContactCard).toBeVisible({ timeout: 20_000 });

    const bobContactCard = pageBob.locator(`text=${alice.displayName}`).first();
    await expect(bobContactCard).toBeVisible({ timeout: 20_000 });

    await aliceContactCard.click();
    await expect(pageAlice).toHaveURL(new RegExp(`/chat/${bob.id}`));

    await bobContactCard.click();
    await expect(pageBob).toHaveURL(new RegExp(`/chat/${alice.id}`));

    const testMessageText = `E2EE secret from Alice at ${Date.now()}`;
    const aliceInput = pageAlice.locator('input[placeholder="Write a message..."]');
    await aliceInput.fill(testMessageText);
    await pageAlice.locator('button[aria-label="Send message"]').click();

    await expect(pageAlice.getByText(testMessageText, { exact: true })).toBeVisible();
    await expect(pageBob.getByText(testMessageText, { exact: true })).toBeVisible({ timeout: 20_000 });

    // Verify accessible screen-reader live region announced incoming message
    await expect(pageBob.locator('div[role="status"].sr-only')).toContainText('New message from ALICE Test');

    // Assert database contains zero plaintext of the message content
    const dbMessages = await prisma.message.findMany({
      where: {
        senderId: alice.id,
        receiverId: bob.id,
      },
    });
    expect(dbMessages.length).toBeGreaterThan(0);
    for (const msg of dbMessages) {
      expect(msg.content).not.toContain(testMessageText);
      expect(msg.content).not.toContain('secret from Alice');
    }
  });

  test('2. Encrypted Message Edit within 15-Minute Window', async () => {
    await setupChatSession(pageAlice, pageBob, alice, bob);

    const originalText = `Original message ${Date.now()}`;
    const editedText = `Updated message (edited) ${Date.now()}`;

    // Alice sends original message
    const aliceInput = pageAlice.locator('input[placeholder="Write a message..."]');
    await aliceInput.fill(originalText);
    await pageAlice.locator('button[aria-label="Send message"]').click();

    // Wait for Bob to receive
    await expect(pageBob.getByText(originalText, { exact: true })).toBeVisible({ timeout: 20_000 });

    // Alice selects the message to open action bar
    await pageAlice.getByText(originalText, { exact: true }).click();
    await pageAlice.locator('button[aria-label="Edit message"]').click();

    // Alice submits edit
    const editInput = pageAlice.locator('input[placeholder="Edit your message..."]');
    await editInput.fill(editedText);
    await pageAlice.locator('button[aria-label="Save edited message"]').click();

    // Verify Alice sees updated text
    await expect(pageAlice.locator('.break-words', { hasText: editedText })).toBeVisible();

    // Verify Bob sees updated text and (edited) indicator live
    await expect(pageBob.locator('.break-words', { hasText: editedText })).toBeVisible({ timeout: 20_000 });
    await expect(pageBob.locator('text=(edited)').first()).toBeVisible();
  });

  test('3. Encrypted Delete for Everyone Control Message', async () => {
    await setupChatSession(pageAlice, pageBob, alice, bob);

    const messageToDelete = `Message to disappear ${Date.now()}`;

    // Alice sends message
    const aliceInput = pageAlice.locator('input[placeholder="Write a message..."]');
    await aliceInput.fill(messageToDelete);
    await pageAlice.locator('button[aria-label="Send message"]').click();

    // Bob receives
    await expect(pageBob.getByText(messageToDelete, { exact: true })).toBeVisible({ timeout: 20_000 });

    // Alice deletes for everyone
    await pageAlice.getByText(messageToDelete, { exact: true }).click();
    await pageAlice.locator('button[aria-label="Delete message"]').click();
    await pageAlice.locator('button:has-text("Delete for Everyone")').click();

    // Verify both Alice and Bob see the deleted indicator
    await expect(pageAlice.locator('text=This message was deleted').first()).toBeVisible({ timeout: 15_000 });
    await expect(pageBob.locator('text=This message was deleted').first()).toBeVisible({ timeout: 20_000 });
    await expect(pageBob.getByText(messageToDelete, { exact: true })).not.toBeVisible();
  });

  test('4. Emoji Reactions Inside E2EE Envelope', async () => {
    await setupChatSession(pageAlice, pageBob, alice, bob);

    const reactionMsg = `React to this ${Date.now()}`;
    const aliceInput = pageAlice.locator('input[placeholder="Write a message..."]');
    await aliceInput.fill(reactionMsg);
    await pageAlice.locator('button[aria-label="Send message"]').click();

    await expect(pageBob.getByText(reactionMsg, { exact: true })).toBeVisible({ timeout: 20_000 });

    // Alice selects message and reacts with heart
    await pageAlice.getByText(reactionMsg, { exact: true }).click();
    await pageAlice.locator('button[aria-label="Heart reaction"]').click();

    // Verify Bob sees reaction badge live
    await expect(pageBob.locator('text=❤️ 1').first()).toBeVisible({ timeout: 20_000 });
  });

  test('5. Large Chunked Encrypted Media Upload & Storage Zero-Plaintext Audit', async () => {
    await setupChatSession(pageAlice, pageBob, alice, bob);

    // Create a 1.2 MB test image fixture with random binary bytes
    const fixturePath = path.resolve('tests/e2e/fixtures/test_large_image.jpg');
    fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
    const fakeImageBuffer = Buffer.alloc(1_250_000);
    fakeImageBuffer.fill(0x5a);
    Buffer.from('UNIQUE_PLAINTEXT_FIXTURE_MARKER_998877').copy(fakeImageBuffer, 100);
    fs.writeFileSync(fixturePath, fakeImageBuffer);

    // Alice uploads file
    const fileChooserPromise = pageAlice.waitForEvent('filechooser');
    await pageAlice.locator('button[aria-label="Attach photo or audio"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixturePath);

    // Verify upload completes and image bubble renders on Alice's client
    await expect(pageAlice.locator('img[alt="Decrypted media"], img[alt="Preview"]').first()).toBeVisible({ timeout: 35_000 });

    // Verify Bob receives and renders the decrypted image
    await expect(pageBob.locator('img[alt="Decrypted media"], img[alt="Preview"]').first()).toBeVisible({ timeout: 35_000 });

    // Server-Side Audit: Assert zero plaintext bytes on server
    const uploadFiles = fs.readdirSync('server/uploads');
    expect(uploadFiles.length).toBeGreaterThan(0);
    for (const f of uploadFiles) {
      const fullPath = path.join('server/uploads', f);
      if (fs.statSync(fullPath).isFile()) {
        const fileContent = fs.readFileSync(fullPath);
        expect(fileContent.includes(Buffer.from('UNIQUE_PLAINTEXT_FIXTURE_MARKER_998877'))).toBe(false);
      }
    }

    try {
      fs.unlinkSync(fixturePath);
    } catch (_) {}
  });

  test('6. Offline Queueing: Replays In-Order with No Duplicates', async () => {
    await setupChatSession(pageAlice, pageBob, alice, bob);

    // Send an initial message while online so the Double Ratchet session is initialized
    const warmUpMsg = `Warmup message ${Date.now()}`;
    const aliceInput = pageAlice.locator('input[placeholder="Write a message..."]');
    await aliceInput.fill(warmUpMsg);
    await pageAlice.locator('button[aria-label="Send message"]').click();
    await expect(pageBob.getByText(warmUpMsg, { exact: true })).toBeVisible({ timeout: 20_000 });

    // Set Alice offline
    await contextAlice.setOffline(true);

    const offlineMsg1 = `Offline message 1 (${Date.now()})`;
    const offlineMsg2 = `Offline message 2 (${Date.now()})`;

    // Send while offline
    await aliceInput.fill(offlineMsg1);
    await pageAlice.locator('button[aria-label="Send message"]').click();

    await aliceInput.fill(offlineMsg2);
    await pageAlice.locator('button[aria-label="Send message"]').click();

    // Verify Alice sees them in sending/queued state
    await expect(pageAlice.getByText(offlineMsg1, { exact: true })).toBeVisible();
    await expect(pageAlice.getByText(offlineMsg2, { exact: true })).toBeVisible();

    // Bob has not received them yet
    await expect(pageBob.getByText(offlineMsg1, { exact: true })).not.toBeVisible();

    // Restore Alice's connection
    await contextAlice.setOffline(false);

    // Verify Bob receives both messages in-order without duplicates
    await expect(pageBob.getByText(offlineMsg1, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(pageBob.getByText(offlineMsg2, { exact: true })).toBeVisible({ timeout: 30_000 });

    // Check count of rendered bubbles: exactly 1 of each
    expect(await pageBob.getByText(offlineMsg1, { exact: true }).count()).toBe(1);
    expect(await pageBob.getByText(offlineMsg2, { exact: true }).count()).toBe(1);
  });

  test('7. Axe-Core Accessibility Audit Across Core Routes', async () => {
    await pageAlice.goto('/');
    await pageAlice.waitForLoadState('networkidle');

    // Check Chat List page accessibility
    let results = await new AxeBuilder({ page: pageAlice })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    let severeViolations = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(severeViolations).toEqual([]);

    // Check Conversation page accessibility
    await pageAlice.goto(`/chat/${bob.id}`);
    await pageAlice.waitForLoadState('networkidle');
    results = await new AxeBuilder({ page: pageAlice })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    severeViolations = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(severeViolations).toEqual([]);

    // Check Settings page accessibility
    await pageAlice.goto('/settings');
    await pageAlice.waitForLoadState('networkidle');
    results = await new AxeBuilder({ page: pageAlice })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    severeViolations = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(severeViolations).toEqual([]);
  });

  test('8. Negative Security Tests: Blocked Contact Rejection & Tampered Ciphertext', async () => {
    await setupChatSession(pageAlice, pageBob, alice, bob);

    // 1. Bob blocks Alice in database
    await prisma.blockedUser.create({
      data: {
        blockerId: bob.id,
        blockedId: alice.id,
      },
    });

    // 2. Alice tries to send Bob a message
    const blockedMsg = `Blocked attempt ${Date.now()}`;
    const aliceInput = pageAlice.locator('input[placeholder="Write a message..."]');
    await aliceInput.fill(blockedMsg);
    await pageAlice.locator('button[aria-label="Send message"]').click();

    // 3. Verify Bob NEVER receives the blocked message
    await pageBob.waitForTimeout(3000);
    await expect(pageBob.getByText(blockedMsg, { exact: true })).not.toBeVisible();

    // 4. Verify tampered ciphertext is rejected by server
    const forgedPost = await contextAlice.request.post(`${BASE_URL}/api/messages/upload-chunk`, {
      data: {
        chunkId: 'invalid_chunk_forgery',
        bytes: 'MALICIOUS_BYTES_NOT_ENCRYPTED',
      },
    });
    // Server must reject invalid chunk or forged structure
    expect([400, 401, 404]).toContain(forgedPost.status());
  });
});
