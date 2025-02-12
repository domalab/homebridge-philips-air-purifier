import { CharacteristicValue, type Logging, PlatformAccessory, Service } from 'homebridge';
import PhilipsAPI from '../philips/api.js';
import { CommandResult, Mode, State, Status } from '../philips/apiTypes.js';
import type { PhilipsAirPurifierHomebridgePlatform } from '../platform.js';
import { FanModel, ModelConfig, MODEL_CONFIGS, detectModel, DeviceStatus } from '../types.js';

export class AirPurifierAccessory {
  private service: Service;
  private currentState: State = {
    pm2_5: 0,
    status: Status.OFF,
    mode: Mode.AUTO,
  };
  private savedRotationSpeed: number|null = null;
  private readonly model: FanModel;
  private readonly modelConfig: ModelConfig;

  constructor(
    private readonly platform: PhilipsAirPurifierHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly logger: Logging,
    private readonly ip: string,
    private readonly port: number,
    private readonly api: PhilipsAPI,
  ) {
    // Get initial status to detect model and serial number
    const initialStatus: DeviceStatus = api.getInitialStatus() || {} as DeviceStatus;
    this.model = detectModel(initialStatus);
    this.modelConfig = MODEL_CONFIGS[this.model];

    // Initialize state from initial status
    if (initialStatus) {
      this.currentState = {
        pm2_5: initialStatus.D03224 || 0,
        status: this.parseDeviceStatus(initialStatus.D03102 ?? '0'),
        mode: this.parseDeviceMode(initialStatus.D0310C ?? '0'),
      };
    }

    // Get serial from device ID fields, fallback to network ID if none found
    const serialNumber = initialStatus.DeviceId || 
                        initialStatus.D01S0D || 
                        `${this.ip}-${this.port}`;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Philips')
      .setCharacteristic(this.platform.Characteristic.Model, this.model)
      .setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, serialNumber)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, initialStatus.D01S12 || '0.0.0');

    this.service = this.accessory.getService(this.platform.Service.AirPurifier)
      || this.accessory.addService(this.platform.Service.AirPurifier);

    this.setupCharacteristics();

    // Subscribe to state updates
    this.api.getEventEmitter().on('source:state', (newState: State): void => {
      this.currentState = newState;
      this.updateCharacteristics();
      
      if (this.modelConfig.supports?.debugLogging) {
        this.logger.debug('State updated:', {
          status: this.currentState.status,
          mode: this.currentState.mode,
          pm2_5: this.currentState.pm2_5,
          speed: this.currentState.speed,
        });
      }
    });

    // Initial update of characteristics
    this.updateCharacteristics();
  }

  private setupCharacteristics(): void {
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.setActiveStatus.bind(this))
      .onGet(this.getActiveStatus.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentAirPurifierState)
      .onGet(this.getState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onSet(this.setRotationSpeed.bind(this))
      .onGet(this.getRotationSpeed.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetAirPurifierState)
      .onSet(this.setTargetState.bind(this))
      .onGet(this.getTargetState.bind(this));
  }

  private parseDeviceStatus(status: number | string): Status {
    if (typeof status === 'number') {
      return status === 1 ? Status.ON : Status.OFF;
    }
    if (typeof status === 'string') {
      const numStatus = parseInt(status);
      if (!isNaN(numStatus)) {
        return numStatus === 1 ? Status.ON : Status.OFF;
      }
      return status.toUpperCase() === 'ON' ? Status.ON : Status.OFF;
    }
    return Status.OFF;
  }

  private parseDeviceMode(mode: number | string): Mode {
    if (typeof mode === 'number') {
      switch (mode) {
      case 0: return Mode.AUTO;
      case 1: return Mode.SLEEP;
      case 2: return Mode.MEDIUM;
      case 3: return Mode.TURBO;
      default: return Mode.AUTO;
      }
    }
    if (typeof mode === 'string') {
      const numMode = parseInt(mode);
      if (!isNaN(numMode)) {
        return this.parseDeviceMode(numMode);
      }
      switch (mode.toLowerCase()) {
      case 'auto+':
      case 'ai': return Mode.AUTO_PLUS;
      case 'auto':
      case 'auto general': return Mode.AUTO;
      case 'sleep': return Mode.SLEEP;
      case 'medium': return Mode.MEDIUM;
      case 'turbo': return Mode.TURBO;
      case 'manual': return Mode.MANUAL;
      default: return Mode.AUTO;
      }
    }
    return Mode.AUTO;
  }

  private updateCharacteristics(): void {
    if (this.currentState) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.Active,
        this.currentState.status === Status.ON
          ? this.platform.Characteristic.Active.ACTIVE
          : this.platform.Characteristic.Active.INACTIVE,
      );

      this.service.updateCharacteristic(
        this.platform.Characteristic.CurrentAirPurifierState,
        this.currentState.status === Status.OFF
          ? this.platform.Characteristic.CurrentAirPurifierState.INACTIVE
          : this.platform.Characteristic.CurrentAirPurifierState.PURIFYING_AIR,
      );

      this.service.updateCharacteristic(
        this.platform.Characteristic.TargetAirPurifierState,
        this.isAutoMode(this.currentState.mode)
          ? this.platform.Characteristic.TargetAirPurifierState.AUTO
          : this.platform.Characteristic.TargetAirPurifierState.MANUAL,
      );

      // Update rotation speed based on current mode
      const rotationSpeed = this.getRotationSpeedFromMode(this.currentState.mode);
      this.service.updateCharacteristic(
        this.platform.Characteristic.RotationSpeed,
        rotationSpeed,
      );
    }
  }

  private isAutoMode(mode: Mode): boolean {
    return mode === Mode.AUTO || mode === Mode.AUTO_PLUS;
  }

  private getRotationSpeedFromMode(mode: Mode): number {
    switch (mode) {
    case Mode.SLEEP: return 20;
    case Mode.AUTO: return 40;
    case Mode.AUTO_PLUS: return 60;
    case Mode.MEDIUM: return 80;
    case Mode.TURBO: return 100;
    case Mode.MANUAL: 
      return this.currentState.speed || 0;
    default: return 0;
    }
  }

  public async getActiveStatus(): Promise<CharacteristicValue> {
    return this.currentState.status === Status.ON
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;
  }

  public async setActiveStatus(value: CharacteristicValue) {
    if (this.platform.Characteristic.Active.ACTIVE === value) {
      await this.changeStatus(Status.ON);
    } else if (this.platform.Characteristic.Active.INACTIVE === value) {
      await this.changeStatus(Status.OFF);
    }
  }

  public async getState(): Promise<CharacteristicValue> {
    return this.currentState.status === Status.OFF
      ? this.platform.Characteristic.CurrentAirPurifierState.INACTIVE
      : this.platform.Characteristic.CurrentAirPurifierState.PURIFYING_AIR;
  }

  public async getTargetState(): Promise<CharacteristicValue> {
    return this.isAutoMode(this.currentState.mode)
      ? this.platform.Characteristic.TargetAirPurifierState.AUTO
      : this.platform.Characteristic.TargetAirPurifierState.MANUAL;
  }

  public async setTargetState(value: CharacteristicValue) {
    if (this.platform.Characteristic.TargetAirPurifierState.AUTO === value) {
      await this.changeMode(Mode.AUTO);
    } else if (this.platform.Characteristic.TargetAirPurifierState.MANUAL === value) {
      await this.changeMode(Mode.TURBO);
    }
  }

  public async setRotationSpeed(value: CharacteristicValue) {
    if (typeof value === 'number') {
      if (value === 0) {
        await this.changeStatus(Status.OFF);
        this.savedRotationSpeed = 0;
      } else if (value > 0 && value <= 20) {
        await this.changeMode(Mode.SLEEP);
        this.savedRotationSpeed = value;
      } else if (value > 20 && value <= 40) {
        await this.changeMode(Mode.AUTO);
        this.savedRotationSpeed = value;
      } else if (value > 40 && value <= 60) {
        await this.changeMode(Mode.AUTO_PLUS);
        this.savedRotationSpeed = value;
      } else if (value > 60 && value <= 80) {
        await this.changeMode(Mode.MEDIUM);
        this.savedRotationSpeed = value;
      } else if (value > 80) {
        await this.changeMode(Mode.TURBO);
        this.savedRotationSpeed = value;
      }
    }
  }

  public async getRotationSpeed(): Promise<CharacteristicValue> {
    if (this.savedRotationSpeed !== null) {
      return this.savedRotationSpeed;
    }
    return this.getRotationSpeedFromMode(this.currentState.mode);
  }

  private async changeMode(mode: Mode, speed?: number): Promise<CommandResult|null> {
    let commandResult: CommandResult|null = null;
    if (this.currentState.mode !== mode) {
      commandResult = await this.api.changeMode(mode, speed);
    }

    if (commandResult?.status === 'success') {
      this.currentState.mode = mode;
      if (typeof speed === 'number') {
        this.currentState.speed = speed;
      }
      return commandResult;
    }
    return null;
  }

  private async changeStatus(status: Status): Promise<CommandResult|null> {
    let commandResult: CommandResult|null = null;
    if (this.currentState.status !== status) {
      commandResult = await this.api.changeStatus(status);
    }

    if (commandResult?.status === 'success') {
      this.currentState.status = status;
      return commandResult;
    }
    return null;
  }
}