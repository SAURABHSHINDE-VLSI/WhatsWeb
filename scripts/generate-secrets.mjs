#!/usr/bin/env node
import crypto from 'node:crypto';
import { generateVAPIDKeys } from 'web-push';

console.log('Generating production secrets for WhatsUS...\n');

// 1. JWT Secret (32 random cryptographic bytes -> 64 hex characters)
const jwtSecret = crypto.randomBytes(32).toString('hex');

// 2. TURN Shared Secret (for Coturn ephemeral REST API credentials)
const turnSecret = crypto.randomBytes(32).toString('hex');

// 3. Web Push VAPID Keypair
const vapidKeys = generateVAPIDKeys();

console.log('================ COPY INTO YOUR .env FILE ================');
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`TURN_SECRET=${turnSecret}`);
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:security@whatsus.app`);
console.log('==========================================================\n');
console.log('Keep these secrets secure and NEVER commit them to version control.');
