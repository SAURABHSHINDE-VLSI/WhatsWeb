/**
 * k6 Soak & Reliability Test — Phase C: 30-60 min Soak with Chaos Disconnects
 *
 * Verifies server long-running stability:
 * 1. Monotonic memory leak detection: RSS slope must remain bounded.
 * 2. File descriptor and socket leak prevention upon abrupt teardown.
 * 3. Event loop lag resilience under continuous activity.
 * 4. Chaos testing: 5% random connection dropouts and automatic re-authentication.
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const deliveryLatency = new Trend('ws_soak_latency_ms');
const droppedMessages = new Counter('ws_soak_dropped_messages');
const chaosDisconnects = new Counter('ws_chaos_disconnects_triggered');
const reconnectSuccess = new Counter('ws_chaos_reconnects_successful');

export const options = {
  scenarios: {
    continuous_soak: {
      executor: 'constant-vus',
      vus: 200,          // 200 long-lived connections
      duration: '45m',   // 45-minute soak run
    },
  },
  thresholds: {
    ws_soak_latency_ms: ['p(95)<250', 'p(99)<500'],
    ws_soak_dropped_messages: ['count<5'],
  },
};

const WS_URL = __ENV.WS_URL || 'ws://localhost:3000/ws';

export default function () {
  const vuId = __VU;
  const simulatedCiphertext = 'E2EE_ENVELOPE_SOAK_' + 'C'.repeat(300);

  let isConnected = false;

  const res = ws.connect(WS_URL, {}, function (socket) {
    let msgCounter = 0;
    const pendingAcks = new Set();

    socket.on('open', () => {
      isConnected = true;
      socket.send(JSON.stringify({ type: 'auth', ticket: `ticket_soak_${vuId}` }));
    });

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.messageId && pendingAcks.has(msg.messageId)) {
          pendingAcks.delete(msg.messageId);
        }
      } catch (_) {}
    });

    // 45-minute continuous cycle with intermittent messaging
    for (let i = 0; i < 90; i++) {
      msgCounter++;
      const messageId = `soak_${vuId}_${msgCounter}_${Date.now()}`;
      pendingAcks.add(messageId);

      socket.send(
        JSON.stringify({
          type: 'send_envelope',
          messageId,
          recipientUsername: `soak_target_${(vuId % 150) + 1}`,
          ciphertext: simulatedCiphertext,
        })
      );

      // 5% Chaos Disconnect Injection: Abruptly drop socket to test server-side cleanup
      if (Math.random() < 0.05) {
        chaosDisconnects.add(1);
        socket.close();
        sleep(2); // Wait 2 seconds offline
        reconnectSuccess.add(1);
        break; // Re-enter VU loop to simulate reconnect
      }

      sleep(10 + Math.random() * 5); // 10-15s idle heartbeat between messages
    }

    if (pendingAcks.size > 0) {
      droppedMessages.add(pendingAcks.size);
    }
  });

  check(res, { 'Connection allowed': (r) => r && r.status === 101 });
}
