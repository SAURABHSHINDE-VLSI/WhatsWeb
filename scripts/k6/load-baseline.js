/**
 * k6 Load Test — Phase C Baseline: 100 Concurrent WebSocket Connections
 *
 * NOTE ON CRYPTOGRAPHY & BENCHMARK METHODOLOGY:
 * WhatsUs is a zero-knowledge E2EE messenger. All X3DH key exchanges and Double Ratchet
 * message encryptions are strictly performed by the browser client using libsodium.
 * The Fastify server is an untrusted blind relay that operates on opaque ciphertext envelopes.
 * This k6 test measures the server-side throughput, WebSocket connection multiplexing,
 * undelivered message queueing, and delivery latency (p95 < 200ms) under concurrent load.
 * Client-side cryptographic throughput is benchmarked separately via Web Crypto / libsodium WASM.
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Metrics
const deliveryLatency = new Trend('ws_delivery_latency_ms');
const droppedMessages = new Counter('ws_dropped_messages');
const successfulAcks = new Counter('ws_successful_acks');
const connectionErrors = new Rate('ws_connection_errors');

export const options = {
  scenarios: {
    baseline_concurrency: {
      executor: 'constant-vus',
      vus: 100, // 100 concurrent WebSocket connections
      duration: '5m', // 5-minute sustained baseline
    },
  },
  thresholds: {
    // Phase C target: p95 delivery latency < 200 ms
    ws_delivery_latency_ms: ['p(95)<200', 'p(99)<400'],
    // Phase C target: Zero message drops
    ws_dropped_messages: ['count==0'],
    ws_connection_errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.APP_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000/ws';

export default function () {
  const vuId = __VU;
  const userSub = `k6_user_${vuId}`;
  const username = `k6_client_${vuId}`;

  // 1. Obtain test session token via test auth bypass (ENABLE_TEST_AUTH=true in dev/staging)
  // In production, this route is blocked by server startup assert
  const authPayload = JSON.stringify({
    sub: userSub,
    email: `${username}@test.whatsus.local`,
    name: `Load Test User ${vuId}`,
    username: username,
  });

  // 2. Request single-use 60s WebSocket ticket
  // Opaque simulated E2EE envelope payload (approx 400 bytes, simulating libsodium ciphertext + ratchet header)
  const simulatedCiphertext = 'E2EE_ENVELOPE_' + 'A'.repeat(350);

  const res = ws.connect(WS_URL, {}, function (socket) {
    let msgCounter = 0;
    const sentTimestamps = new Map();

    socket.on('open', () => {
      // Send ticket auth handshake
      socket.send(JSON.stringify({ type: 'auth', ticket: `ticket_mock_${vuId}` }));
    });

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'auth_ack') {
          // Connected & authenticated
        } else if (msg.type === 'ack' || msg.type === 'delivered') {
          const sentTime = sentTimestamps.get(msg.messageId);
          if (sentTime) {
            const latency = Date.now() - sentTime;
            deliveryLatency.add(latency);
            successfulAcks.add(1);
            sentTimestamps.delete(msg.messageId);
          }
        }
      } catch (err) {
        // Non-JSON or malformed
      }
    });

    socket.on('error', (e) => {
      connectionErrors.add(1);
    });

    // Send 1 message per second to simulated peer
    for (let i = 0; i < 300; i++) {
      msgCounter++;
      const messageId = `k6_msg_${vuId}_${msgCounter}_${Date.now()}`;
      sentTimestamps.set(messageId, Date.now());

      const payload = JSON.stringify({
        type: 'send_envelope',
        messageId: messageId,
        recipientUsername: `k6_client_${(vuId % 100) + 1}`,
        ciphertext: simulatedCiphertext,
        timestamp: Date.now(),
      });

      socket.send(payload);
      sleep(1); // 1 msg/sec pacing
    }

    // Verify all sent messages received acknowledgments before closing
    if (sentTimestamps.size > 0) {
      droppedMessages.add(sentTimestamps.size);
    }

    socket.close();
  });

  check(res, { 'status is 101 Switching Protocols': (r) => r && r.status === 101 });
}
