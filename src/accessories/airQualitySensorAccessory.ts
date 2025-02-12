import { CharacteristicValue, type Logging, PlatformAccessory, Service } from 'homebridge';
import type { PhilipsAirPurifierHomebridgePlatform } from '../platform.js';
import PhilipsAPI from '../philips/api.js';
import { State, Status } from '../philips/apiTypes.js';
import { FanModel, ModelConfig, MODEL_CONFIGS, detectModel, DeviceStatus } from '../types.js';

export class AirQualitySensorAccessory {
  private service: Service;
  private currentState: State | undefined;
  private readonly model: FanModel;
  private readonly modelConfig: ModelConfig;

  public constructor(
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

    this.service = this.accessory.getService(this.platform.Service.AirQualitySensor)
      || this.accessory.addService(this.platform.Service.AirQualitySensor);
    
    // Setup required characteristics
    this.service.getCharacteristic(this.platform.Characteristic.StatusActive)
      .onGet(this.getStatusActive.bind(this));
    
    this.service.getCharacteristic(this.platform.Characteristic.AirQuality)
      .onGet(this.getAirQuality.bind(this));
    
    this.service.getCharacteristic(this.platform.Characteristic.PM2_5Density)
      .onGet(this.getPM2_5Density.bind(this));

    // Subscribe to state updates
    this.api.getEventEmitter().on('source:state', (currentState: State) => {
      this.currentState = currentState;
      this.updateCharacteristics();
    });

    // Initial update
    this.updateCharacteristics();
  }

  private getPM25Value(rawValue: number): number {
    // Convert the raw PM2.5 value using model-specific divisor
    const divisor = this.modelConfig.pm25Divisor || 100; // Default to 100 if not specified
    const convertedValue = rawValue / divisor;
    
    this.logger.debug(
      `PM2.5 conversion: raw=${rawValue}, divisor=${divisor}, converted=${convertedValue}`,
    );
    
    return convertedValue;
  }

  private updateCharacteristics(): void {
    if (this.currentState) {
      const airQuality = this.getAirQualityCharacteristicValue();
      const pm25 = this.getPM25Value(this.currentState.pm2_5);
      const isActive = this.currentState.status === Status.ON;

      this.logger.debug(
        `Updating characteristics - Raw PM2.5: ${this.currentState.pm2_5}, ` +
        `Converted PM2.5: ${pm25}, Air Quality: ${airQuality}, Active: ${isActive}`,
      );

      this.service.updateCharacteristic(
        this.platform.Characteristic.StatusActive,
        isActive,
      );

      this.service.updateCharacteristic(
        this.platform.Characteristic.AirQuality,
        airQuality,
      );

      this.service.updateCharacteristic(
        this.platform.Characteristic.PM2_5Density,
        pm25,
      );

      // Log readings for debug purposes if enabled
      if (this.modelConfig.supports?.debugLogging) {
        this.logger.debug(
          `Device status - Model: ${this.model}, ` +
          `PM2.5: ${pm25} μg/m³, ` +
          `Air Quality: ${airQuality}, ` +
          `Active: ${isActive}`,
        );
      }
    }
  }

  async getStatusActive(): Promise<CharacteristicValue> {
    if (!this.currentState) {
      return false;
    }
    return this.currentState.status === Status.ON;
  }

  async getAirQuality(): Promise<CharacteristicValue> {
    if (!this.currentState || this.currentState.status === Status.OFF) {
      return this.platform.Characteristic.AirQuality.UNKNOWN;
    }
    return this.getAirQualityCharacteristicValue();
  }

  async getPM2_5Density(): Promise<CharacteristicValue> {
    if (!this.currentState || this.currentState.status === Status.OFF) {
      return 0;
    }
    return this.getPM25Value(this.currentState.pm2_5);
  }

  private getAirQualityCharacteristicValue(): number {
    if (this.currentState && this.currentState.status === Status.ON) {
      const pm2_5 = this.getPM25Value(this.currentState.pm2_5);
      const thresholds = this.modelConfig.airQualityThresholds;
  
      this.logger.debug(
        `Air Quality calculation - PM2.5: ${pm2_5}, ` +
        `Thresholds: Good ≤${thresholds.good}, ` +
        `Fair ≤${thresholds.fair}, ` +
        `Poor ≤${thresholds.poor}`,
      );
  
      if (pm2_5 <= thresholds.good) {
        return this.platform.Characteristic.AirQuality.GOOD;
      } else if (pm2_5 <= thresholds.fair) {
        return this.platform.Characteristic.AirQuality.FAIR;
      } else if (pm2_5 <= thresholds.poor) {
        return this.platform.Characteristic.AirQuality.POOR;
      } else {
        return this.platform.Characteristic.AirQuality.INFERIOR;
      }
    }
    return this.platform.Characteristic.AirQuality.UNKNOWN;
  }
}