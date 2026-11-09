/**
 * ==============================================================================
 * SMART TANK CONTROL CENTER - MULTI-DEVICE REAL-TIME SYNC SERVER
 * ==============================================================================
 * Central WebSocket relay connecting the ESP32 Hardware Gateway (Laptop A)
 * with all remote viewing and controlling devices (Mobile B, Laptop C, etc.).
 *
 * Supported Protocols:
 *  - Native WebSockets (ws:// and wss://)
 *  - HTTP health checks, REST authentication & state inspection
 * ==============================================================================
 */

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

const PORT = parseInt(process.env.PORT || '4001', 10);
const DEFAULT_AUTH_PIN = (process.env.REMOTE_AUTH_PIN || '792416').trim();
const GATEWAY_SECRET = (process.env.GATEWAY_SECRET || 'smart_tank_gateway_secret_2026').trim();
const AUTH_TOKEN_SECRET = (process.env.AUTH_TOKEN_SECRET || process.env.REMOTE_AUTH_PIN || 'smart_tank_auth_secret_2026').trim();

// In-memory session token store with expiration timestamps: token -> expiresAt (timestamp)
const validTokens = new Map();

/**
 * Generate a cryptographically signed HMAC auth token with 24-hour expiration
 */
function generateAuthToken() {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const randomPart = crypto.randomBytes(8).toString('hex');
  const payload = `${expiresAt}.${randomPart}`;
  const sig = crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(payload).digest('hex');
  const token = `tok_${payload}.${sig}`;
  validTokens.set(token, expiresAt);
  return { token, expiresAt };
}

/**
 * Verify whether an auth token is valid and not expired (stateless HMAC + memory fallback)
 */
function verifyAuthToken(token) {
  if (!token || typeof token !== 'string' || !token.startsWith('tok_')) {
    return false;
  }
  const now = Date.now();

  // Fast-path in-memory check
  if (validTokens.has(token)) {
    const exp = validTokens.get(token);
    if (now <= exp) return true;
    validTokens.delete(token);
    return false;
  }

  // Stateless cryptographic verification
  try {
    const raw = token.slice(4); // Remove 'tok_'
    const lastDot = raw.lastIndexOf('.');
    if (lastDot === -1) return false;

    const payload = raw.slice(0, lastDot);
    const sig = raw.slice(lastDot + 1);
    const expectedSig = crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(payload).digest('hex');

    if (sig !== expectedSig) return false;

    const parts = payload.split('.');
    const expiresAt = parseInt(parts[0], 10);
    if (isNaN(expiresAt) || now > expiresAt) return false;

    // Cache valid token in memory
    validTokens.set(token, expiresAt);
    return true;
  } catch (err) {
    return false;
  }
}

// Active Gateway connection reference & heartbeat tracking
let activeGatewayWs = null;
let activeGatewayDeviceId = null;
let gatewayLastSeen = 0;

// Authoritative cached snapshot of the latest hardware & liquid state
let latestSnapshot = {
  timestamp: Date.now(),
  gatewayOnline: false,
  gatewayDeviceId: null,
  currentRaw: null,
  filteredRaw: null,
  average: null,
  minimum: null,
  maximum: null,
  range: null,
  stability: 'WAITING FOR READINGS',
  sampleCount: 0,
  volumeMl: null,
  percentage: 0,
  maxCapacity: 1000,
  isCalibrated: false,
  calibrationPointCount: 0,
  capState: 'OPEN',
  systemState: 'ESP32 GATEWAY OFFLINE – REMOTE CONTROL UNAVAILABLE',
  motorStatus: 'IDLE',
  isMotorRunning: false,
  selectedProfileName: null,
  selectedDegrees: null,
  selectedDirection: null,
  lastMotorOperation: null,
};

// Connected client sockets
const connectedClients = new Set();

// Create HTTP server for health checks, CORS, and REST API
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/' || url.pathname === '/health' || url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ONLINE',
        service: 'SMART_TANK_SYNC_RELAY',
        version: '2.1.0',
        gatewayOnline: !!activeGatewayWs && activeGatewayWs.readyState === WebSocket.OPEN,
        gatewayDeviceId: activeGatewayDeviceId,
        gatewayLastSeenAgoMs: gatewayLastSeen > 0 ? Date.now() - gatewayLastSeen : null,
        connectedClients: connectedClients.size,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: Date.now(),
      })
    );
    return;
  }

  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ...latestSnapshot,
        gatewayOnline: !!activeGatewayWs && activeGatewayWs.readyState === WebSocket.OPEN,
        gatewayDeviceId: activeGatewayDeviceId,
      })
    );
    return;
  }

  if (url.pathname === '/api/auth' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const pin = typeof parsed.pin === 'string' ? parsed.pin.trim() : (parsed.pin !== undefined ? String(parsed.pin).trim() : '');

        if (pin && pin === DEFAULT_AUTH_PIN) {
          const { token, expiresAt } = generateAuthToken();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              token,
              expiresAt,
              message: 'Remote control authorization granted',
            })
          );
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid Security PIN. Authorization rejected.' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Malformed JSON payload' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// Initialize WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server });

/**
 * Broadcast helper to distribute messages to all connected client browsers
 */
function broadcastToClients(msgObj, excludeWs = null) {
  const json = JSON.stringify(msgObj);
  for (const client of connectedClients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      try {
        client.send(json);
      } catch (err) {
        console.error('[WS BROADCAST ERROR]', err);
      }
    }
  }
}

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.role = 'CLIENT'; // Default role until identified
  ws.deviceId = `dev_${Math.random().toString(36).substring(2, 9)}`;

  connectedClients.add(ws);

  // Send current authoritative cached snapshot immediately upon connection
  ws.send(
    JSON.stringify({
      type: 'SYNC_SNAPSHOT',
      payload: {
        ...latestSnapshot,
        gatewayOnline: !!activeGatewayWs && activeGatewayWs.readyState === WebSocket.OPEN,
        gatewayDeviceId: activeGatewayDeviceId,
      },
    })
  );

  ws.on('pong', () => {
    ws.isAlive = true;
    if (ws === activeGatewayWs) {
      gatewayLastSeen = Date.now();
    }
  });

  ws.on('message', (messageRaw) => {
    try {
      const data = JSON.parse(messageRaw.toString());

      // If message came from the active gateway, record heartbeat timestamp
      if (ws === activeGatewayWs) {
        gatewayLastSeen = Date.now();
      }

      switch (data.type) {
        // -------------------------------------------------------------
        // 1. ROLE REGISTRATION (Gateway vs Client)
        // -------------------------------------------------------------
        case 'REGISTER_ROLE': {
          const requestedRole = data.role;
          const deviceId = data.deviceId || ws.deviceId;
          ws.deviceId = deviceId;

          if (requestedRole === 'GATEWAY') {
            const gatewayKey = typeof data.gatewayKey === 'string' ? data.gatewayKey.trim() : '';

            // Secure gateway authentication verification
            if (!gatewayKey || gatewayKey !== GATEWAY_SECRET) {
              console.warn(`[GATEWAY AUTH REJECTED] Unauthorized gateway registration attempt from ${deviceId}`);
              ws.role = 'CLIENT';
              ws.send(
                JSON.stringify({
                  type: 'GATEWAY_AUTH_FAILED',
                  deviceId,
                  error: 'Invalid Gateway Secret Key. Gateway registration rejected.',
                })
              );
              return;
            }

            // Valid Gateway Secret: Elevate connection to authoritative Gateway
            ws.role = 'GATEWAY';
            gatewayLastSeen = Date.now();

            // Handle multi-tab or superseded gateway connections on the same laptop
            if (activeGatewayWs && activeGatewayWs !== ws && activeGatewayWs.readyState === WebSocket.OPEN) {
              console.log(
                `[GATEWAY SUPERSEDED] Superseding previous gateway session (${activeGatewayDeviceId}) with new session (${deviceId})`
              );
              try {
                activeGatewayWs.role = 'CLIENT';
                activeGatewayWs.send(
                  JSON.stringify({
                    type: 'GATEWAY_SUPERSEDED',
                    message: 'Gateway session superseded by newer connection.',
                  })
                );
              } catch (e) {}
            }

            activeGatewayWs = ws;
            activeGatewayDeviceId = deviceId;
            latestSnapshot.gatewayOnline = true;
            latestSnapshot.gatewayDeviceId = activeGatewayDeviceId;

            console.log(`[GATEWAY CONNECTED] Authoritative Gateway active: ${activeGatewayDeviceId}`);

            // Send registration success confirmation to the gateway
            ws.send(
              JSON.stringify({
                type: 'GATEWAY_AUTH_SUCCESS',
                deviceId: activeGatewayDeviceId,
                message: 'Authoritative Gateway registered successfully',
              })
            );

            // Broadcast gateway online status to all connected client devices
            broadcastToClients({
              type: 'GATEWAY_STATUS',
              online: true,
              deviceId: activeGatewayDeviceId,
              message: 'ESP32 Hardware Gateway is ONLINE',
            });
          } else {
            // Register as standard viewing client
            ws.role = 'CLIENT';
          }
          break;
        }

        // -------------------------------------------------------------
        // 2. TELEMETRY STREAM (From Gateway to All Connected Devices)
        // -------------------------------------------------------------
        case 'TELEMETRY_BROADCAST': {
          if (ws === activeGatewayWs && ws.role === 'GATEWAY') {
            gatewayLastSeen = Date.now();

            // Update authoritative snapshot
            latestSnapshot = {
              ...latestSnapshot,
              ...data.payload,
              gatewayOnline: true,
              gatewayDeviceId: activeGatewayDeviceId,
              timestamp: Date.now(),
            };

            // Broadcast to all clients
            broadcastToClients(
              {
                type: 'TELEMETRY_UPDATE',
                payload: latestSnapshot,
              },
              ws
            );
          }
          break;
        }

        // -------------------------------------------------------------
        // 3. SECURITY AUTHENTICATION (Remote Control Login via WS)
        // -------------------------------------------------------------
        case 'AUTH_LOGIN': {
          const { pin, requestId } = data;
          const cleanPin = typeof pin === 'string' ? pin.trim() : (pin !== undefined ? String(pin).trim() : '');

          if (cleanPin && cleanPin === DEFAULT_AUTH_PIN) {
            const { token, expiresAt } = generateAuthToken();
            ws.send(
              JSON.stringify({
                type: 'AUTH_SUCCESS',
                requestId,
                token,
                expiresAt,
                message: 'Remote control authorization granted',
              })
            );
          } else {
            ws.send(
              JSON.stringify({
                type: 'AUTH_FAILED',
                requestId,
                error: 'Invalid Security PIN. Authorization rejected.',
              })
            );
          }
          break;
        }

        // -------------------------------------------------------------
        // 4. REMOTE COMMAND EXECUTION (Client -> Server -> Gateway)
        // -------------------------------------------------------------
        case 'EXECUTE_COMMAND': {
          const { action, token, requestId } = data;

          // Check if gateway is online
          if (!activeGatewayWs || activeGatewayWs.readyState !== WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'COMMAND_REJECTED',
                requestId,
                action,
                error: 'ESP32 GATEWAY OFFLINE – REMOTE CONTROL UNAVAILABLE',
              })
            );
            return;
          }

          // Security check: Validate command authorization token (stateless & memory)
          if (!verifyAuthToken(token)) {
            ws.send(
              JSON.stringify({
                type: 'COMMAND_REJECTED',
                requestId,
                action,
                error: 'UNAUTHORIZED: Please enter valid security PIN to operate cap controls',
              })
            );
            return;
          }

          // Validate permitted actions
          if (action !== 'CAP_OPEN' && action !== 'CAP_CLOSE' && action !== 'EMERGENCY_STOP') {
            ws.send(
              JSON.stringify({
                type: 'COMMAND_REJECTED',
                requestId,
                action,
                error: `Unknown hardware action: ${action}`,
              })
            );
            return;
          }

          console.log(`[DISPATCH COMMAND] Routing ${action} (req: ${requestId}) to ESP32 Gateway (${activeGatewayDeviceId})...`);

          // Forward command to the authoritative Gateway (Laptop A)
          activeGatewayWs.send(
            JSON.stringify({
              type: 'DISPATCH_HARDWARE_COMMAND',
              action,
              requestId,
              timestamp: Date.now(),
            })
          );
          break;
        }

        // -------------------------------------------------------------
        // 5. COMMAND ACKNOWLEDGEMENT (Gateway -> Server -> Clients)
        // -------------------------------------------------------------
        case 'COMMAND_ACK': {
          if (ws === activeGatewayWs && ws.role === 'GATEWAY') {
            console.log(`[COMMAND ACK] Gateway executed ${data.action}: success=${data.success}`);

            // Broadcast acknowledgement to all clients
            broadcastToClients({
              type: 'COMMAND_ACK',
              requestId: data.requestId,
              action: data.action,
              success: data.success,
              message: data.message,
              capState: data.capState,
              timestamp: Date.now(),
            });
          }
          break;
        }

        // -------------------------------------------------------------
        // 6. HEARTBEAT / KEEP-ALIVE PING
        // -------------------------------------------------------------
        case 'PING': {
          if (ws === activeGatewayWs) {
            gatewayLastSeen = Date.now();
          }
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('[WS MESSAGE PARSE ERROR]', err);
    }
  });

  ws.on('close', () => {
    connectedClients.delete(ws);

    // Only mark gateway offline if the disconnected socket is ACTUALLY the active authoritative gateway
    if (ws === activeGatewayWs) {
      console.log(`[GATEWAY DISCONNECTED] Authoritative gateway (${activeGatewayDeviceId}) disconnected.`);
      activeGatewayWs = null;
      activeGatewayDeviceId = null;
      latestSnapshot.gatewayOnline = false;
      latestSnapshot.systemState = 'ESP32 GATEWAY OFFLINE – REMOTE CONTROL UNAVAILABLE';

      // Notify all connected devices immediately
      broadcastToClients({
        type: 'GATEWAY_STATUS',
        online: false,
        message: 'ESP32 GATEWAY OFFLINE – REMOTE CONTROL UNAVAILABLE',
      });
    }
  });

  ws.on('error', (err) => {
    console.error('[WS CLIENT ERROR]', err);
  });
});

// Periodic ping & gateway watchdog to detect stale sockets and keep connections alive
const watchdogInterval = setInterval(() => {
  const now = Date.now();

  // 1. Check all connected clients with WS ping/pong
  for (const client of connectedClients) {
    if (client.isAlive === false) {
      client.terminate();
      connectedClients.delete(client);
    } else {
      client.isAlive = false;
      client.ping();
    }
  }

  // 2. Gateway silence watchdog: If authoritative gateway hasn't communicated in 25s, mark offline
  if (activeGatewayWs && gatewayLastSeen > 0 && now - gatewayLastSeen > 25000) {
    console.warn(
      `[GATEWAY TIMEOUT] Gateway (${activeGatewayDeviceId}) silent for ${Math.round(
        (now - gatewayLastSeen) / 1000
      )}s. Terminating stale connection.`
    );
    try {
      activeGatewayWs.terminate();
    } catch (e) {}
    activeGatewayWs = null;
    activeGatewayDeviceId = null;
    latestSnapshot.gatewayOnline = false;
    latestSnapshot.systemState = 'ESP32 GATEWAY OFFLINE – REMOTE CONTROL UNAVAILABLE';

    broadcastToClients({
      type: 'GATEWAY_STATUS',
      online: false,
      message: 'ESP32 GATEWAY OFFLINE – REMOTE CONTROL UNAVAILABLE',
    });
  }

  // 3. Prune expired session tokens
  for (const [token, expiresAt] of validTokens.entries()) {
    if (now > expiresAt) {
      validTokens.delete(token);
    }
  }
}, 10000);

wss.on('close', () => {
  clearInterval(watchdogInterval);
});

// Start HTTP & WebSocket Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================================`);
  console.log(`SMART TANK REAL-TIME SYNC SERVER ACTIVE ON PORT : ${PORT}`);
  console.log(`WebSocket URL  : ws://localhost:${PORT}`);
  console.log(`Health Check   : http://localhost:${PORT}/health`);
  console.log(`Gateway Auth   : Protected by GATEWAY_SECRET`);
  console.log(`Remote Auth PIN: Configured via REMOTE_AUTH_PIN`);
  console.log(`========================================================`);
});
