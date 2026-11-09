/**
 * ==============================================================================
 * SMART TANK CONTROL CENTER - MULTI-DEVICE REAL-TIME SYNC SERVER
 * ==============================================================================
 * Central WebSocket relay connecting the ESP32 Hardware Gateway (Laptop A)
 * with all remote viewing and controlling devices (Mobile B, Laptop C, etc.).
 *
 * Supported Protocols:
 *  - Native WebSockets (ws:// and wss://)
 *  - HTTP health checks & REST state inspection
 * ==============================================================================
 */

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

const PORT = parseInt(process.env.PORT || '4001', 10);
const DEFAULT_AUTH_PIN = process.env.REMOTE_AUTH_PIN || '124580';

// In-memory active session tokens for authorized remote operators
const validTokens = new Set();

// Active Gateway connection reference
let activeGatewayWs = null;
let activeGatewayDeviceId = null;

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

// Create HTTP server for health checks & CORS
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
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
        version: '2.0.0',
        gatewayOnline: !!activeGatewayWs && activeGatewayWs.readyState === WebSocket.OPEN,
        connectedClients: connectedClients.size,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: Date.now(),
      })
    );
    return;
  }

  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(latestSnapshot));
    return;
  }

  if (url.pathname === '/api/auth' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const { pin } = JSON.parse(body || '{}');
        if (pin === DEFAULT_AUTH_PIN) {
          const token = `tok_${crypto.randomBytes(16).toString('hex')}`;
          validTokens.add(token);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, token }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid Security PIN' }));
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

  connectedClients.add(ws);

  // Send current cached snapshot immediately upon connection
  ws.send(
    JSON.stringify({
      type: 'SYNC_SNAPSHOT',
      payload: {
        ...latestSnapshot,
        gatewayOnline: !!activeGatewayWs && activeGatewayWs.readyState === WebSocket.OPEN,
      },
    })
  );

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (messageRaw) => {
    try {
      const data = JSON.parse(messageRaw.toString());

      switch (data.type) {
        // -------------------------------------------------------------
        // 1. ROLE REGISTRATION (Gateway vs Client)
        // -------------------------------------------------------------
        case 'REGISTER_ROLE': {
          if (data.role === 'GATEWAY') {
            ws.role = 'GATEWAY';
            activeGatewayWs = ws;
            activeGatewayDeviceId = data.deviceId || 'Gateway-Laptop';
            latestSnapshot.gatewayOnline = true;
            latestSnapshot.gatewayDeviceId = activeGatewayDeviceId;

            console.log(`[GATEWAY CONNECTED] Registered authoritative gateway: ${activeGatewayDeviceId}`);

            // Broadcast gateway online status to all clients
            broadcastToClients({
              type: 'GATEWAY_STATUS',
              online: true,
              deviceId: activeGatewayDeviceId,
              message: 'ESP32 Hardware Gateway is ONLINE',
            });
          } else {
            ws.role = 'CLIENT';
          }
          break;
        }

        // -------------------------------------------------------------
        // 2. TELEMETRY STREAM (From Gateway to All Connected Devices)
        // -------------------------------------------------------------
        case 'TELEMETRY_BROADCAST': {
          if (ws === activeGatewayWs || ws.role === 'GATEWAY') {
            // Update authoritative snapshot
            latestSnapshot = {
              ...latestSnapshot,
              ...data.payload,
              gatewayOnline: true,
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
        // 3. SECURITY AUTHENTICATION (Remote Control Login)
        // -------------------------------------------------------------
        case 'AUTH_LOGIN': {
          const { pin, requestId } = data;
          if (pin === DEFAULT_AUTH_PIN) {
            const token = `tok_${crypto.randomBytes(16).toString('hex')}`;
            validTokens.add(token);
            ws.send(
              JSON.stringify({
                type: 'AUTH_SUCCESS',
                requestId,
                token,
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

          // Security check: Validate command authorization token
          if (!token || !validTokens.has(token)) {
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

          console.log(`[DISPATCH COMMAND] Routing ${action} (req: ${requestId}) to ESP32 Gateway...`);

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
          if (ws === activeGatewayWs || ws.role === 'GATEWAY') {
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

        default:
          break;
      }
    } catch (err) {
      console.error('[WS MESSAGE PARSE ERROR]', err);
    }
  });

  ws.on('close', () => {
    connectedClients.delete(ws);

    if (ws === activeGatewayWs) {
      console.log(`[GATEWAY DISCONNECTED] Authoritative gateway disconnected.`);
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

// Periodic ping to keep WebSocket connections alive and detect stale sockets
const heartbeatInterval = setInterval(() => {
  for (const client of connectedClients) {
    if (client.isAlive === false) {
      client.terminate();
      connectedClients.delete(client);
    } else {
      client.isAlive = false;
      client.ping();
    }
  }
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Start HTTP & WebSocket Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================================`);
  console.log(`SMART TANK REAL-TIME SYNC SERVER ACTIVE ON PORT : ${PORT}`);
  console.log(`WebSocket URL  : ws://localhost:${PORT}`);
  console.log(`Health Check   : http://localhost:${PORT}/health`);
  console.log(`Default Auth PIN: ${DEFAULT_AUTH_PIN}`);
  console.log(`========================================================`);
});

