import { ConnectionState, MotorDirection, SerialMessageLog } from '../types';

export type SerialEventCallback = (event: SerialEvent) => void;

export type SerialEvent =
  | { type: 'STATE_CHANGED'; state: ConnectionState; error?: string }
  | { type: 'RAW_READING'; raw: number; timestamp: number }
  | { type: 'CAL_RESULT'; ml: number; average: number; minimum: number; maximum: number; range: number }
  | { type: 'CAL_ACCEPTED' }
  | { type: 'CAL_REJECTED'; reason: string }
  | { type: 'CALIBRATION_SAVED' }
  | { type: 'CALIBRATION_COUNT'; count: number }
  | { type: 'PROFILE_SAVED' }
  | { type: 'CURRENT_VOLUME'; ml: number }
  | { type: 'AUTO_VOLUME'; ml: number }
  | { type: 'AUTO_ROTATION'; degrees: number }
  | { type: 'MOTOR_STARTED' }
  | { type: 'MOTOR_COMPLETED' }
  | { type: 'SYSTEM_READY' }
  | { type: 'ERROR'; message: string }
  | { type: 'CAL_POINT'; ml: number; average: number; minimum: number; maximum: number; range: number }
  | { type: 'PROFILE_POINT'; ml: number; openDeg: number; openCW: MotorDirection; closeDeg: number; closeCW: MotorDirection }
  | { type: 'RAW_MESSAGE'; message: SerialMessageLog };

interface QueuedCommand {
  command: string;
  resolve: (value: void) => void;
  reject: (reason?: any) => void;
  isMotorCommand: boolean;
}

export class SerialService {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  private state: ConnectionState = 'DISCONNECTED';
  private baudRate: number = 115200;
  private subscribers: Set<SerialEventCallback> = new Set();
  private messageHistory: SerialMessageLog[] = [];
  private maxHistory: number = 200;

  // Lock to prevent concurrent connection attempts
  private isConnecting: boolean = false;
  private isDisconnecting: boolean = false;

  // Queue management
  private commandQueue: QueuedCommand[] = [];
  private isProcessingQueue: boolean = false;
  private isMotorExecuting: boolean = false;

  private isReading: boolean = false;
  private lineBuffer: string = '';
  private textEncoder: TextEncoder = new TextEncoder();
  private textDecoder: TextDecoder = new TextDecoder('utf-8');

  // Connection timeout in milliseconds
  private readonly CONNECTION_TIMEOUT_MS: number = 8000;

  constructor() {
    this.setupBrowserEvents();
  }

  private setupBrowserEvents(): void {
    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      // Hardware USB disconnect listener
      navigator.serial.addEventListener('disconnect', async (event: any) => {
        const targetPort = event.port || event.target;
        if (targetPort && (targetPort === this.port || this.state === 'CONNECTED')) {
          console.warn('[Web Serial] Physical USB device disconnected');
          await this.handleDisconnect('Hardware device disconnected from USB port (cable unplugged)');
        }
      });

      // Hardware USB connect listener
      navigator.serial.addEventListener('connect', (event: any) => {
        console.log('[Web Serial] USB device connected / detected:', event.port || event.target);
        this.notify({
          type: 'RAW_MESSAGE',
          message: {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: Date.now(),
            direction: 'RX',
            text: '[USB Hardware Detected] Serial device connected. Ready to initiate connection.',
          },
        });
      });
    }
  }

  public subscribe(callback: SerialEventCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify(event: SerialEvent): void {
    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (err) {
        console.error('Error in serial subscriber:', err);
      }
    }
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public getHistory(): SerialMessageLog[] {
    return [...this.messageHistory];
  }

  public isMotorRunning(): boolean {
    return this.isMotorExecuting;
  }

  public isWebSerialSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  /**
   * Check if a port is currently open
   */
  public isPortOpen(portToTest?: SerialPort | null): boolean {
    const p = portToTest !== undefined ? portToTest : this.port;
    if (!p) return false;
    // In Web Serial spec, port.readable and port.writable are non-null when the port is open
    return p.readable !== null || p.writable !== null;
  }

  /**
   * Request user permission and connect to ESP32
   * Follows strict workflow:
   * 1. Prevent concurrent connection attempts
   * 2. Request serial port from user
   * 3. Check port state (clean up if already open or locked)
   * 4. Open port at configured baud rate (default 115200) with timeout
   * 5. Initialize reader and writer locks
   * 6. Start asynchronous reading loop
   * 7. Update connection status to CONNECTED only after successful initialization
   */
  public async connect(baudRate: number = 115200): Promise<boolean> {
    if (!this.isWebSerialSupported()) {
      const err = 'Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.';
      this.setState('ERROR', err);
      return false;
    }

    // 1. Prevent multiple simultaneous connection attempts
    if (this.isConnecting || this.state === 'CONNECTING') {
      console.warn('[Web Serial] Connection attempt already in progress. Ignoring duplicate call.');
      return false;
    }

    // If already connected, disconnect first before opening again
    if (this.state === 'CONNECTED' || this.isPortOpen()) {
      console.log('[Web Serial] Existing connection detected. Cleaning up before new connection...');
      await this.disconnect();
    }

    this.isConnecting = true;
    this.setState('CONNECTING');
    this.baudRate = baudRate;

    let requestedPort: SerialPort | null = null;

    try {
      // 2. Request serial port from user
      try {
        requestedPort = await navigator.serial.requestPort();
      } catch (reqErr: any) {
        if (reqErr.name === 'NotFoundError') {
          // User closed or cancelled the port selection dialog
          console.log('[Web Serial] User cancelled port selection.');
          this.setState('DISCONNECTED');
          return false;
        }
        throw reqErr;
      }

      if (!requestedPort) {
        this.setState('DISCONNECTED');
        return false;
      }

      this.port = requestedPort;

      // 3. Check port state before attempting to open
      if (this.isPortOpen(this.port)) {
        console.warn('[Web Serial] Selected port is already marked open. Attempting clean stream release...');
        await this.releaseExistingLocks();
        try {
          await this.port.close();
        } catch (closeErr) {
          console.warn('[Web Serial] Non-fatal close error on pre-opened port:', closeErr);
        }
      }

      // 4. Open port at baudRate with timeout and comprehensive error handling
      await this.openPortWithTimeout(this.port, this.baudRate);

      // 5. Initialize reader and writer
      if (!this.port.readable || !this.port.writable) {
        throw new Error('Port opened successfully but readable/writable streams are unavailable.');
      }

      // Ensure streams are not locked before acquiring
      if (this.port.readable.locked) {
        throw new Error('SerialPort readable stream is already locked by another reader.');
      }
      if (this.port.writable.locked) {
        throw new Error('SerialPort writable stream is already locked by another writer.');
      }

      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();

      // 6. Start asynchronous serial reading
      this.startReadingLoop();

      // 7. Update connection status ONLY AFTER successful initialization
      this.setState('CONNECTED');

      // Sync data from ESP32 after brief stabilization delay
      setTimeout(() => {
        if (this.state === 'CONNECTED') {
          this.sendCommand('GET_DATA').catch((e) => {
            console.warn('[Web Serial] Initial GET_DATA query error:', e);
          });
        }
      }, 500);

      return true;
    } catch (err: any) {
      console.error('[Web Serial] Connection error:', err);
      let friendlyError = err.message || 'Failed to connect to serial port';

      // Diagnose common Web Serial failure causes
      if (err.name === 'InvalidStateError' || friendlyError.includes('already open')) {
        friendlyError = 'Serial port is already open or held by an existing process. Please disconnect and retry.';
      } else if (
        friendlyError.includes('Access denied') ||
        friendlyError.includes('Failed to open serial port') ||
        err.name === 'NetworkError'
      ) {
        friendlyError = `Failed to open serial port (${err.message}). The COM port may be in use by another application (e.g. Arduino IDE, Serial Monitor, PlatformIO, or another browser window). Close any other serial connections and try again.`;
      }

      // Clean up failed attempt
      await this.handleDisconnect(friendlyError);
      this.setState('ERROR', friendlyError);
      return false;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Open port wrapped in timeout
   */
  private async openPortWithTimeout(port: SerialPort, baud: number): Promise<void> {
    let timeoutHandle: any;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `Serial connection timed out after ${this.CONNECTION_TIMEOUT_MS / 1000} seconds. Check USB cable and ensure ESP32 is powered.`
          )
        );
      }, this.CONNECTION_TIMEOUT_MS);
    });

    const openPromise = port.open({
      baudRate: baud,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferSize: 4096,
      flowControl: 'none',
    });

    try {
      await Promise.race([openPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /**
   * Try to auto-connect to an already authorized port (if browser has paired device)
   */
  public async autoConnect(baudRate: number = 115200): Promise<boolean> {
    if (!this.isWebSerialSupported() || this.isConnecting || this.state === 'CONNECTED') {
      return false;
    }

    try {
      const ports = await navigator.serial.getPorts();
      if (ports.length > 0) {
        console.log('[Web Serial] Found previously paired port. Attempting auto-connect...');
        this.port = ports[0];
        return await this.connect(baudRate);
      }
    } catch (err) {
      console.warn('[Web Serial] Auto-connect failed:', err);
    }
    return false;
  }

  /**
   * Safely release reader and writer locks without throwing
   */
  private async releaseExistingLocks(): Promise<void> {
    // Release reader lock
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {
        console.warn('[Web Serial] Error cancelling reader:', e);
      }
      try {
        this.reader.releaseLock();
      } catch (e) {
        console.warn('[Web Serial] Error releasing reader lock:', e);
      }
      this.reader = null;
    }

    // Release writer lock
    if (this.writer) {
      try {
        await this.writer.close();
      } catch (e) {
        // Writer may already be closed
      }
      try {
        this.writer.releaseLock();
      } catch (e) {
        console.warn('[Web Serial] Error releasing writer lock:', e);
      }
      this.writer = null;
    }
  }

  /**
   * Disconnect and cleanly release all hardware and stream resources
   */
  public async disconnect(): Promise<void> {
    await this.handleDisconnect('User disconnected');
  }

  /**
   * Comprehensive, idempotent disconnection routine following strict sequence:
   * 1. Stop read loop
   * 2. Cancel reader
   * 3. Release reader lock
   * 4. Release writer lock
   * 5. Close port
   * 6. Clear connection references
   * 7. Update state
   */
  private async handleDisconnect(reason?: string): Promise<void> {
    if (this.isDisconnecting) return;
    this.isDisconnecting = true;

    // 1. Stop the read loop
    this.isReading = false;
    this.isMotorExecuting = false;
    this.commandQueue = [];

    // 2. Cancel reader & 3. Release reader lock
    // 4. Release writer lock
    await this.releaseExistingLocks();

    // 5. Close the port if still open
    if (this.port) {
      try {
        if (!this.port.readable?.locked && !this.port.writable?.locked) {
          await this.port.close();
          console.log('[Web Serial] Port closed cleanly.');
        } else {
          console.warn('[Web Serial] Port stream still locked, forcing close attempt...');
          await this.port.close();
        }
      } catch (e: any) {
        console.warn('[Web Serial] Error closing port (may already be closed or unplugged):', e.message);
      }
      // 6. Clear connection references
      this.port = null;
    }

    this.isConnecting = false;
    this.isDisconnecting = false;

    // 7. Update state to DISCONNECTED
    this.setState('DISCONNECTED', reason);
  }

  private setState(state: ConnectionState, error?: string): void {
    this.state = state;
    this.notify({ type: 'STATE_CHANGED', state, error });
  }

  /**
   * Read loop: continuously reads Uint8Array chunks, decodes them to text,
   * and processes line-by-line terminated with \n.
   * Does NOT use pipeTo, ensuring port.readable can be released instantly upon disconnect.
   */
  private async startReadingLoop(): Promise<void> {
    if (!this.reader || this.isReading) return;
    this.isReading = true;

    try {
      while (this.isReading && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) {
          // Stream completed (reader cancelled or port disconnected)
          break;
        }
        if (value) {
          const textChunk = this.textDecoder.decode(value, { stream: true });
          this.processIncomingChunk(textChunk);
        }
      }
    } catch (err: any) {
      if (this.isReading) {
        console.error('[Web Serial] Read loop error:', err);
        // Only trigger disconnect if this was an active, unexpected error
        await this.handleDisconnect(err.message || 'Serial read error occurred');
      }
    } finally {
      this.isReading = false;
    }
  }

  /**
   * Accumulates chunks into lines and processes each line
   */
  private processIncomingChunk(chunk: string): void {
    this.lineBuffer += chunk;
    const lines = this.lineBuffer.split('\n');

    // Keep unfinished segment in buffer
    this.lineBuffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length > 0) {
        this.handleIncomingLine(line);
      }
    }
  }

  /**
   * Parse protocol lines and emit corresponding events
   */
  private handleIncomingLine(line: string): void {
    const logItem: SerialMessageLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      direction: 'RX',
      text: line,
    };

    const parts = line.split(',');
    const cmd = parts[0].trim();

    if (cmd === 'RAW') {
      const raw = parseFloat(parts[1]);
      if (!isNaN(raw)) {
        logItem.parsedType = 'RAW';
        this.notify({ type: 'RAW_READING', raw, timestamp: Date.now() });
      }
    } else if (cmd === 'CAL_RESULT') {
      const ml = parseFloat(parts[1]);
      const avg = parseFloat(parts[2]);
      const min = parseFloat(parts[3]);
      const max = parseFloat(parts[4]);
      const rng = parseFloat(parts[5]);
      logItem.parsedType = 'CAL_RESULT';
      this.notify({ type: 'CAL_RESULT', ml, average: avg, minimum: min, maximum: max, range: rng });
    } else if (cmd === 'CAL_ACCEPTED') {
      logItem.parsedType = 'CAL_ACCEPTED';
      this.notify({ type: 'CAL_ACCEPTED' });
    } else if (cmd === 'CAL_REJECTED') {
      const reason = parts[1] || 'UNSTABLE';
      logItem.parsedType = 'CAL_REJECTED';
      this.notify({ type: 'CAL_REJECTED', reason });
    } else if (cmd === 'CALIBRATION_SAVED') {
      logItem.parsedType = 'CALIBRATION_SAVED';
      this.notify({ type: 'CALIBRATION_SAVED' });
    } else if (cmd === 'CALIBRATION_COUNT') {
      const count = parseInt(parts[1], 10) || 0;
      logItem.parsedType = 'CALIBRATION_COUNT';
      this.notify({ type: 'CALIBRATION_COUNT', count });
    } else if (cmd === 'PROFILE_SAVED') {
      logItem.parsedType = 'PROFILE_SAVED';
      this.notify({ type: 'PROFILE_SAVED' });
    } else if (cmd === 'CURRENT_VOLUME') {
      const ml = parseFloat(parts[1]);
      logItem.parsedType = 'CURRENT_VOLUME';
      if (!isNaN(ml)) {
        this.notify({ type: 'CURRENT_VOLUME', ml });
      }
    } else if (cmd === 'AUTO_VOLUME') {
      const ml = parseFloat(parts[1]);
      logItem.parsedType = 'AUTO_VOLUME';
      if (!isNaN(ml)) {
        this.notify({ type: 'AUTO_VOLUME', ml });
      }
    } else if (cmd === 'AUTO_ROTATION') {
      const degrees = parseFloat(parts[1]);
      logItem.parsedType = 'AUTO_ROTATION';
      if (!isNaN(degrees)) {
        this.notify({ type: 'AUTO_ROTATION', degrees });
      }
    } else if (cmd === 'MOTOR_STARTED') {
      logItem.parsedType = 'MOTOR_STARTED';
      this.isMotorExecuting = true;
      this.notify({ type: 'MOTOR_STARTED' });
    } else if (cmd === 'MOTOR_COMPLETED') {
      logItem.parsedType = 'MOTOR_COMPLETED';
      this.isMotorExecuting = false;
      this.notify({ type: 'MOTOR_COMPLETED' });
    } else if (cmd === 'SYSTEM_READY') {
      logItem.parsedType = 'SYSTEM_READY';
      this.notify({ type: 'SYSTEM_READY' });
    } else if (cmd === 'ERROR') {
      const message = parts.slice(1).join(',') || 'Unknown hardware error';
      logItem.parsedType = 'ERROR';
      this.isMotorExecuting = false;
      this.notify({ type: 'ERROR', message });
    } else if (cmd === 'CAL_POINT') {
      const ml = parseFloat(parts[1]);
      const avg = parseFloat(parts[2]);
      const min = parseFloat(parts[3]);
      const max = parseFloat(parts[4]);
      const rng = parseFloat(parts[5]);
      logItem.parsedType = 'CAL_POINT';
      this.notify({ type: 'CAL_POINT', ml, average: avg, minimum: min, maximum: max, range: rng });
    } else if (cmd === 'PROFILE_POINT') {
      const ml = parseFloat(parts[1]);
      const openDeg = parseFloat(parts[2]);
      const openCW: MotorDirection = parts[3] === '1' || parts[3] === 'CW' ? 'CW' : 'CCW';
      const closeDeg = parseFloat(parts[4]);
      const closeCW: MotorDirection = parts[5] === '1' || parts[5] === 'CW' ? 'CW' : 'CCW';
      logItem.parsedType = 'PROFILE_POINT';
      this.notify({ type: 'PROFILE_POINT', ml, openDeg, openCW, closeDeg, closeCW });
    }

    this.recordMessage(logItem);
    this.notify({ type: 'RAW_MESSAGE', message: logItem });
  }

  private recordMessage(msg: SerialMessageLog): void {
    this.messageHistory.push(msg);
    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory.shift();
    }
  }

  /**
   * Enqueues a serial command to be sent sequentially
   */
  public async sendCommand(command: string): Promise<void> {
    if (this.state !== 'CONNECTED' || !this.writer || !this.port) {
      throw new Error('ESP32 is not connected');
    }

    const trimmed = command.trim();
    const isMotor = trimmed.startsWith('OPEN') ||
                    trimmed.startsWith('CLOSE') ||
                    trimmed.startsWith('AUTO_CLOSE');

    if (isMotor && this.isMotorExecuting) {
      throw new Error('Motor is currently executing another operation. Please wait or press STOP.');
    }

    return new Promise((resolve, reject) => {
      this.commandQueue.push({
        command: trimmed,
        resolve,
        reject,
        isMotorCommand: isMotor,
      });

      this.processQueue();
    });
  }

  /**
   * Emergency stop bypasses standard queue order and immediately writes STOP
   */
  public async emergencyStop(): Promise<void> {
    if (this.state !== 'CONNECTED' || !this.writer) {
      return;
    }

    this.commandQueue = this.commandQueue.filter(item => !item.isMotorCommand);
    this.isMotorExecuting = false;

    try {
      const cmdBytes = this.textEncoder.encode('STOP\n');
      await this.writer.write(cmdBytes);

      const logItem: SerialMessageLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        direction: 'TX',
        text: 'STOP (EMERGENCY)',
        parsedType: 'STOP',
      };
      this.recordMessage(logItem);
      this.notify({ type: 'RAW_MESSAGE', message: logItem });
      this.notify({ type: 'MOTOR_COMPLETED' });
    } catch (err) {
      console.error('[Web Serial] Failed to send emergency stop:', err);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.commandQueue.length === 0) return;
    this.isProcessingQueue = true;

    while (this.commandQueue.length > 0) {
      const item = this.commandQueue.shift();
      if (!item) break;

      if (item.isMotorCommand && this.isMotorExecuting) {
        this.commandQueue.unshift(item);
        break;
      }

      try {
        if (!this.writer || this.state !== 'CONNECTED') {
          throw new Error('Serial writer unavailable or device disconnected');
        }

        const payload = `${item.command}\n`;
        const payloadBytes = this.textEncoder.encode(payload);
        await this.writer.write(payloadBytes);

        const logItem: SerialMessageLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          direction: 'TX',
          text: item.command,
        };
        this.recordMessage(logItem);
        this.notify({ type: 'RAW_MESSAGE', message: logItem });

        item.resolve();
        await new Promise((r) => setTimeout(r, 50));
      } catch (err) {
        item.reject(err);
      }
    }

    this.isProcessingQueue = false;
  }
}

export const serialService = new SerialService();
