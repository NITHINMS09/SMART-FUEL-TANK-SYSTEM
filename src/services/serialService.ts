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
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readableStreamClosed: Promise<void> | null = null;

  private state: ConnectionState = 'DISCONNECTED';
  private baudRate: number = 115200;
  private subscribers: Set<SerialEventCallback> = new Set();
  private messageHistory: SerialMessageLog[] = [];
  private maxHistory: number = 200;

  // Queue management
  private commandQueue: QueuedCommand[] = [];
  private isProcessingQueue: boolean = false;
  private isMotorExecuting: boolean = false;

  private isReading: boolean = false;
  private lineBuffer: string = '';
  private textEncoder: TextEncoder = new TextEncoder();

  constructor() {
    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      navigator.serial.addEventListener('disconnect', (event) => {
        if (event.target === this.port) {
          this.handleDisconnect('Hardware device disconnected from USB port');
        }
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
   * Request user permission and connect to ESP32
   */
  public async connect(baudRate: number = 115200): Promise<boolean> {
    if (!this.isWebSerialSupported()) {
      const err = 'Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.';
      this.setState('ERROR', err);
      return false;
    }

    try {
      this.setState('CONNECTING');
      this.baudRate = baudRate;

      this.port = await navigator.serial.requestPort();
      await this.openPort();
      return true;
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        this.setState('DISCONNECTED');
      } else {
        const errorMsg = err.message || 'Failed to connect to serial port';
        this.setState('ERROR', errorMsg);
      }
      return false;
    }
  }

  /**
   * Try to auto-connect to an already authorized port
   */
  public async autoConnect(baudRate: number = 115200): Promise<boolean> {
    if (!this.isWebSerialSupported()) return false;

    try {
      const ports = await navigator.serial.getPorts();
      if (ports.length > 0) {
        this.port = ports[0];
        this.baudRate = baudRate;
        this.setState('CONNECTING');
        await this.openPort();
        return true;
      }
    } catch (err) {
      console.warn('Auto-connect failed:', err);
    }
    return false;
  }

  private async openPort(): Promise<void> {
    if (!this.port) return;

    await this.port.open({
      baudRate: this.baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferSize: 4096,
      flowControl: 'none',
    });

    // Create text decoder stream for reading incoming lines
    const textDecoder = new TextDecoderStream();
    this.readableStreamClosed = (this.port.readable as ReadableStream<any>).pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    // Use raw binary writer with TextEncoder for maximum reliability
    this.writer = this.port.writable!.getWriter();

    this.setState('CONNECTED');
    this.startReadingLoop();

    // Query ESP32 for initial sync
    setTimeout(() => {
      this.sendCommand('GET_DATA').catch(() => {});
    }, 500);
  }

  /**
   * Disconnect and release all resources
   */
  public async disconnect(): Promise<void> {
    await this.handleDisconnect('User disconnected');
  }

  private async handleDisconnect(reason?: string): Promise<void> {
    this.isReading = false;
    this.isMotorExecuting = false;
    this.commandQueue = [];

    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }
    } catch (e) {
      console.warn('Error closing reader:', e);
    }

    try {
      if (this.readableStreamClosed) {
        await this.readableStreamClosed.catch(() => {});
        this.readableStreamClosed = null;
      }
    } catch (e) {}

    try {
      if (this.writer) {
        await this.writer.close();
        this.writer.releaseLock();
        this.writer = null;
      }
    } catch (e) {
      console.warn('Error closing writer:', e);
    }

    try {
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (e) {
      console.warn('Error closing port:', e);
    }

    this.setState('DISCONNECTED', reason);
  }

  private setState(state: ConnectionState, error?: string): void {
    this.state = state;
    this.notify({ type: 'STATE_CHANGED', state, error });
  }

  /**
   * Read loop: continuously parses lines terminated with \n
   */
  private async startReadingLoop(): Promise<void> {
    if (!this.reader || this.isReading) return;
    this.isReading = true;

    try {
      while (this.isReading && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.processIncomingChunk(value);
        }
      }
    } catch (err: any) {
      if (this.isReading) {
        console.error('Serial read loop error:', err);
        this.handleDisconnect(err.message || 'Serial read error occurred');
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
    if (this.state !== 'CONNECTED' || !this.writer) {
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
      console.error('Failed to send emergency stop:', err);
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
        if (!this.writer) {
          throw new Error('Serial writer unavailable');
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
