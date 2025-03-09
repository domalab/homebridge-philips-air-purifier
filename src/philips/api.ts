import crypto from 'crypto';
import coap, { IncomingMessage, OutgoingMessage } from 'coap';
import { decrypt, encrypt, nextClientKey } from './encryption.js';
import type { Logging } from 'homebridge';
import { Status, Mode, CommandResult } from './apiTypes.js';
import AsyncLock, { AsyncLockDoneCallback } from 'async-lock';
import EventEmitter from 'node:events';
import BufferListStream from 'bl';

interface DeviceStatus {
  D03224: number;  // pm2_5
  D0310C: string;  // mode
  D03102: string;  // power status
  D01S12?: string; // firmware version
  DeviceId?: string;
  D01S0D?: string;
  D01S05?: string; // model ID
  modelid?: string;
  WifiVersion?: string;
  'D03-13'?: string; // Manual fan speed
}

const lock = new AsyncLock({
  timeout: 15000,
});

export default class PhilipsAPI {
  private readonly eventEmitter: NodeJS.EventEmitter = new EventEmitter();
  private initialStatus: DeviceStatus | null = null;
  private lastCommandTime: number = 0;
  private readonly commandDelay: number = 1000; // 1 second delay between commands
  private connectionAttempts: number = 0;
  private readonly maxConnectionAttempts: number = 5;
  private connectionTimeout: number = 10000; // Default 10s timeout
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  public constructor(
    private readonly logger: Logging,
    private readonly host: string,
    private readonly port: number,
    timeout?: number,
  ) {
    this.logger.debug('An API client for the device has been created');
    
    // Set custom timeout if provided
    if (timeout && typeof timeout === 'number' && timeout > 0) {
      this.connectionTimeout = timeout;
    }
    
    // Set connection timeout for COAP requests
    coap.updateTiming({
      ackTimeout: Math.min(this.connectionTimeout / 2, 5000),
      ackRandomFactor: 1.5,
      maxRetransmit: 4,
    });
  }

  public getInitialStatus(): DeviceStatus | null {
    return this.initialStatus;
  }

  public isDeviceConnected(): boolean {
    return this.isConnected;
  }

  public changeStatus(status: Status): Promise<CommandResult> {
    const params = {
      'D03-02': status === Status.ON ? 'ON' : 'OFF',
    };
    return this.sendCommand(params);
  }

  public changeMode(mode: Mode, speed?: number): Promise<CommandResult> {
    let modeString: string;
    const params: Record<string, string | number> = {};
    
    switch (mode) {
    case Mode.AUTO_PLUS:
      modeString = 'Auto+';
      break;
    case Mode.SLEEP:
      modeString = 'Sleep';
      break;
    case Mode.MEDIUM:
      modeString = 'Medium';
      break;
    case Mode.TURBO:
      modeString = 'Turbo';
      break;
    case Mode.MANUAL:
      modeString = 'Manual';
      if (typeof speed === 'number') {
        params['D03-13'] = Math.min(100, Math.max(1, speed));
      }
      break;
    case Mode.AUTO:
    default:
      modeString = 'Auto General';
      break;
    }
    
    params['D03-12'] = modeString;
    return this.sendCommand(params);
  }

  public observeState(): void {
    this.logger.debug('Attempt to connect to the device and observe status');
    this.connectionAttempts = 0;
    this.attemptConnection();
  }

  private attemptConnection(): void {
    this.connectionAttempts++;
    this.logger.debug(`Connection attempt ${this.connectionAttempts} to ${this.host}:${this.port}`);

    const triggerParams: object = {
      'D03-03': true,
    };

    this.sendCommand(triggerParams)
      .then(() => {
        this.isConnected = true;
        this.connectionAttempts = 0;
        this.logger.info(`Successfully connected to Philips Air Purifier at ${this.host}:${this.port}`);
        this.setupObservation();
      })
      .catch((err?: Error|null): void => {
        this.isConnected = false;
        const retryDelay = Math.min(this.connectionAttempts * 5000, 30000); // Exponential backoff up to 30s
        
        this.logger.warn(
          `Failed to connect to Philips Air Purifier at ${this.host}:${this.port}. ` +
          `Attempt ${this.connectionAttempts}/${this.maxConnectionAttempts}. ` +
          `Will retry in ${retryDelay/1000}s. Error: ${err?.message || 'Unknown error'}`,
        );
        
        // Clear any existing timers
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
        }
        
        // Retry with exponential backoff if under max attempts
        if (this.connectionAttempts < this.maxConnectionAttempts) {
          this.reconnectTimer = setTimeout(() => this.attemptConnection(), retryDelay);
        } else {
          this.logger.error(
            `Failed to connect to Philips Air Purifier after ${this.maxConnectionAttempts} attempts. ` +
            'Please check your network connection and device.',
          );
          
          // Reset attempts and try again after a longer delay
          this.connectionAttempts = 0;
          this.reconnectTimer = setTimeout(() => this.attemptConnection(), 60000); // 1 minute
        }
      });
  }

  private setupObservation(): void {
    this.logger.debug('Setting up observation for device status updates');
    
    const request: OutgoingMessage = coap.request({
      host: this.host,
      port: this.port,
      method: 'GET',
      pathname: '/sys/dev/status',
      observe: true,
    });
    
    request.on('response', (response: IncomingMessage): void => {
      this.logger.debug('Received observational response from device');
      response.on('data', this.handleStateUpdate.bind(this));
      
      response.on('end', () => {
        this.logger.debug('Observation response ended unexpectedly');
        this.isConnected = false;
        // Try to re-establish the connection
        setTimeout(() => this.attemptConnection(), 5000);
      });
    });
    
    request.on('error', (err) => {
      this.isConnected = false;
      this.logger.error(`Error while observing device state: ${err.message}`);
      // Retry connection after delay
      setTimeout(() => this.attemptConnection(), 5000);
    });
    
    request.on('timeout', () => {
      this.isConnected = false;
      this.logger.error('Connection to device timed out while observing');
      // Retry connection after delay
      setTimeout(() => this.attemptConnection(), 5000);
    });
    
    request.end();
  }

  private handleStateUpdate(data: Buffer): void {
    try {
      const parsedData = decrypt(data.toString());
      const parsed = parsedData.state.reported;
      
      // Confirm we're connected since we received data
      this.isConnected = true;
      
      // Store initial status if not already set
      if (!this.initialStatus) {
        this.initialStatus = parsed;
        this.logger.debug('Initial device status stored', this.initialStatus);
      }
      
      this.logger.debug('Status received from the device', parsed);
      
      let mode: Mode = Mode.AUTO;
      switch (parsed.D0310C) {
      case 'P':
      case 'AI':
      case 'Auto+':
        mode = Mode.AUTO_PLUS;
        break;
      case 0:
      case '0':
      case 'Auto':
      case 'Auto General':
        mode = Mode.AUTO;
        break;
      case 1:
      case '1':
      case 'Sleep':
        mode = Mode.SLEEP;
        break;
      case 2:
      case '2':
      case 'Medium':
        mode = Mode.MEDIUM;
        break;
      case 3:
      case '3':
      case 'Turbo':
        mode = Mode.TURBO;
        break;
      case 'M':
      case 'Manual':
        mode = Mode.MANUAL;
        break;
      }
      
      let status: Status = Status.OFF;
      switch (parsed.D03102) {
      case 1:
      case '1':
      case 'ON':
        status = Status.ON;
        break;
      case 0:
      case '0':
      case 'OFF':
        status = Status.OFF;
        break;
      }
      
      this.eventEmitter.emit('source:state', {
        pm2_5: parsed.D03224,
        mode,
        status,
        speed: parsed['D03-13'] ? parseInt(parsed['D03-13']) : undefined,
      });
    } catch (error) {
      this.logger.error('Error processing state update:', error);
    }
  }

  private async sendCommand(params: object): Promise<CommandResult> {
    this.logger.debug('Attempt to execute a command on the device');
    
    // Ensure minimum delay between commands
    const now = Date.now();
    const timeSinceLastCommand = now - this.lastCommandTime;
    if (timeSinceLastCommand < this.commandDelay) {
      await new Promise(resolve => setTimeout(resolve, this.commandDelay - timeSinceLastCommand));
    }
    
    return new Promise((resolve, reject): void => {
      const fn = async (done: AsyncLockDoneCallback<CommandResult>): Promise<void> => {
        try {
          const buffer = await this.getSync();
          const originalCounter = buffer.toString();
          this.logger.debug('The counter has been received from the device', originalCounter);
          
          const clientKey: string = nextClientKey(originalCounter);
          const state = {
            state: {
              desired: {
                CommandType: 'app',
                DeviceId: '',
                EnduserId: '',
                ...params,
              },
            },
          };
          
          const payload = encrypt(clientKey, JSON.stringify(state));
          const request = coap.request({
            host: this.host,
            port: this.port,
            method: 'POST',
            pathname: '/sys/dev/control',
            retrySend: 3,
          });
          
          let responseReceived = false;
          
          // Set timeout for command
          const requestTimeout = setTimeout(() => {
            if (!responseReceived) {
              request.destroy();
              done(new Error(`Command timed out after ${this.connectionTimeout}ms`));
            }
          }, this.connectionTimeout);
          
          request.write(payload);
          
          request.on('response', (response: IncomingMessage): void => {
            responseReceived = true;
            clearTimeout(requestTimeout);
            
            response.pipe(BufferListStream((err: Error, buffer: Buffer): void => {
              if (err) {
                this.logger.error('Buffer error', err);
                done(err);
                return;
              }
              
              if (buffer) {
                try {
                  this.lastCommandTime = Date.now();
                  this.isConnected = true; // Successfully received response
                  const result = JSON.parse(buffer.toString());
                  done(null, result);
                } catch (parseError: unknown) {
                  const errorMessage = parseError instanceof Error 
                    ? parseError.message 
                    : 'Unknown parse error';
                  done(new Error(`Failed to parse command response: ${errorMessage}`));
                }
              } else {
                done(new Error('Empty response received'));
              }
            }));
          });
          
          request.on('error', (err) => {
            responseReceived = true;
            clearTimeout(requestTimeout);
            this.isConnected = false;
            done(err);
          });
          
          request.end();
        } catch (error) {
          done(error as Error);
        }
      };
      
      lock.acquire<CommandResult>('api:send_command', fn)
        .then(resolve)
        .catch(reject);
    });
  }

  private getSync(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const fn = (done: AsyncLockDoneCallback<Buffer>): void => {
        const payload = crypto.randomBytes(4)
          .toString('hex')
          .toUpperCase();
        
        const request: OutgoingMessage = coap.request({
          host: this.host,
          port: this.port,
          method: 'POST',
          pathname: '/sys/dev/sync',
        });
        
        let responseReceived = false;
        
        // Set timeout for sync request
        const requestTimeout = setTimeout(() => {
          if (!responseReceived) {
            request.destroy();
            done(new Error(`Sync request timed out after ${this.connectionTimeout}ms`));
          }
        }, this.connectionTimeout);
        
        request.write(Buffer.from(payload));
        
        request.on('response', (response: IncomingMessage): void => {
          responseReceived = true;
          clearTimeout(requestTimeout);
          
          response.pipe(BufferListStream((err: Error, buffer: Buffer): void => {
            if (err) {
              done(err);
              return;
            }
            
            if (buffer) {
              done(null, buffer);
            } else {
              done(new Error('Empty sync response'));
            }
          }));
        });
        
        request.on('error', (err): void => {
          responseReceived = true;
          clearTimeout(requestTimeout);
          done(err);
        });
        
        request.end();
      };
      
      lock.acquire<Buffer>('api:get_sync', fn)
        .then(resolve)
        .catch(reject);
    });
  }

  public getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}