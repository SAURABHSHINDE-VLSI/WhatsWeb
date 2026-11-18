import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { authenticate, TokenPayload } from './auth.js';

export interface TurnIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface TurnCredentialsResponse {
  iceServers: TurnIceServer[];
  ttl: number;
}

export function generateTurnCredentials(userId: string): TurnCredentialsResponse {
  const turnSecret = process.env.TURN_SECRET;
  const rawUrls = process.env.TURN_URLS;
  const ttl = parseInt(process.env.TURN_TTL || '86400', 10); // 24 hours

  const defaultStunServers: TurnIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  if (!turnSecret) {
    // If no TURN secret configured, return public STUN servers
    return {
      iceServers: defaultStunServers,
      ttl: 3600,
    };
  }

  // Coturn REST API (rfc5766-turn-server) ephemeral credential generation
  // username: timestamp:userId
  const expiryTimestamp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${expiryTimestamp}:${userId}`;

  // password = base64(hmac-sha1(turnSecret, username))
  const hmac = crypto.createHmac('sha1', turnSecret);
  hmac.update(username);
  const password = hmac.digest('base64');

  const turnUrls = rawUrls
    ? rawUrls.split(',').map((u) => u.trim()).filter(Boolean)
    : [
        'turn:turn.whatsus.local:3478?transport=udp',
        'turn:turn.whatsus.local:3478?transport=tcp',
        'turns:turn.whatsus.local:5349?transport=tcp',
      ];

  const iceServers: TurnIceServer[] = [
    ...defaultStunServers,
    {
      urls: turnUrls,
      username,
      credential: password,
    },
  ];

  return {
    iceServers,
    ttl,
  };
}

export async function turnRoutes(app: FastifyInstance) {
  const handler = async (req: any, reply: any) => {
    const user = req.user as TokenPayload;
    if (!user || !user.userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const credentials = generateTurnCredentials(user.userId);
    return reply.send(credentials);
  };

  // Support both /api/turn-credentials and /api/turn/credentials
  app.get('/api/turn-credentials', { preHandler: [authenticate] }, handler);
  app.get('/api/turn/credentials', { preHandler: [authenticate] }, handler);
}
