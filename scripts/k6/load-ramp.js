/**
 * k6 Load Test — Phase C Ramp: 100 -> 500 -> 1000 Concurrent WebSocket Connections
 *
 * Measures server throughput scalability, connection pool saturation,
 * memory growth, and p95/p99 message delivery latency under increasing concurrency.
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const deliveryLatency = new Trend('ws_ramp_delivery_latency_ms');
const droppedMessages = new Counter('ws_ramp_dropped_messages');
const connectionErrors = new Rate('ws_ramp_connection_errors');

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Warm up to 100 concurrent sockets
    { duration: '3m', target: 500 },   // Ramp up to 500 concurrent sockets
    { duration: '3m', target: 1000 },  // Peak load: 1000 concurrent sockets
    { duration: '2m', target: 0 },     // Cool down to 0
  ],
  thresholds: {
    ws_ramp_delivery_latency_ms: ['p(95)<300', 'p(99)<600'],
    ws_ramp_connection_errors: ['rate<0.02'],
    ws_ramp_dropped_messages: ['count<10'],
  },
};

const WS_URL = __ENV.WS_URL || 'ws://localhost:3000/ws';

export default function () {
  const vuId = __VU;
  const simulatedCiphertext = 'E2EE_ENVELOPE_' + 'B'.repeat(350);

  const res = ws.connect(WS_URL, {}, function (socket) {
    let msgCounter = 0;
    const sentTimestamps = new Map();

    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'auth', ticket: `ticket_ramp_${vuId}` }));
    });

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'ack' || msg.type === 'delivered') {
          const sentTime = sentTimestamps.get(msg.messageId);
          if (sentTime) {
            deliveryLatency.add(Date.now() - sentTime);
            sentTimestamps.delete(msg.messageId);
          }
        }
      } catch (_) {}
    });

    socket.on('error', () => {
      connectionErrors.add(1);
    });

    // Send messages periodically
    for (let i = 0; i < 20; i++) {
      msgCounter++;
      const messageId = `ramp_msg_${vuId}_${msgCounter}_${Date.now()}`;
      sentTimestamps.set(messageId, Date.now());

      socket.send(
        JSON.stringify({
          type: 'send_envelope',
          messageId,
          recipientUsername: `ramp_peer_${(vuId % 200) + 1}`,
          ciphertext: simulatedCiphertext,
        })
      );
      sleep(3 + Math.random() * 2); // 3-5 second staggered pacing
    }

    if (sentTimestamps.size > 0) {
      droppedMessages.add(sentTimestamps.size);
    }

    socket.close();
  });

  check(res, { 'WebSocket established': (r) => r && r.status === 101 });
}
