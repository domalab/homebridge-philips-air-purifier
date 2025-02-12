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

  public constructor(
    private readonly logger: Logging,
    private readonly host: string,
    private readonly port: number,
  ) {
    this.logger.debug('An API client for the device has been created');
  }

  public getInitialStatus(): DeviceStatus | null {
    return this.initialStatus;
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
    this.logger.debug('Attempt to make a request to get the device status');

    const setupObservation = (): void => {
      const request: OutgoingMessage = coap.request({
        host: this.host,
        port: this.port,
        method: 'GET',
        pathname: '/sys/dev/status',
        observe: true,
      });

      request.on('response', (response: IncomingMessage): void => {
        response.on('data', this.handleStateUpdate.bind(this));
      });

      request.on('error', (err) => {
        this.logger.error('Error while request on state', err);
        // Retry connection after 5 seconds
        setTimeout(() => this.observeState(), 5000);
      });

      request.end();
    };

    const triggerParams: object = {
      'D03-03': true,
    };

    this.sendCommand(triggerParams)
      .then(setupObservation)
      .catch((err?: Error|null): void => {
        this.logger.error(
          'An error occurred on the first request for the ' +
          'status retrieval trigger. Please try restarting ' +
          'the device.',
          err,
        );
        // Retry after 5 seconds
        setTimeout(() => this.observeState(), 5000);
      });
  }

  private handleStateUpdate(data: Buffer): void {
    try {
      const parsedData = decrypt(data.toString());
      const parsed = parsedData.state.reported;

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

          request.write(payload);

          request.on('response', (response: IncomingMessage): void => {
            response.pipe(BufferListStream((err: Error, buffer: Buffer): void => {
              if (err) {
                this.logger.error('Buffer error', err);
                done(err);
                return;
              }

              if (buffer) {
                this.lastCommandTime = Date.now();
                done(null, JSON.parse(buffer.toString()));
              }
            }));
          });

          request.on('error', (err) => {
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

        request.write(Buffer.from(payload));

        request.on('response', (response: IncomingMessage): void => {
          response.pipe(BufferListStream((err: Error, buffer: Buffer): void => {
            if (err) {
              done(err);
              return;
            }
            if (buffer) {
              done(null, buffer);
            }
          }));
        });

        request.on('error', (err): void => {
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