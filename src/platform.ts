import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { AirQualitySensorAccessory } from './accessories/airQualitySensorAccessory.js';
import { AirPurifierAccessory } from './accessories/airPurifierAccessory.js';
import PhilipsAPI from './philips/api.js';

interface DeviceConfig {
  name: string;
  ip: string;
  port: number;
}

export class PhilipsAirPurifierHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  private devices: DeviceConfig[] = [];

  constructor(
    public readonly logger: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // Check if configuration contains devices array
    if (config.devices && Array.isArray(config.devices)) {
      this.devices = config.devices;
    } else if (config.ip && config.port) {
      // Support legacy single device config
      this.devices = [{
        name: config.name || 'Philips Air Purifier',
        ip: config.ip,
        port: config.port,
      }];
    } else {
      this.logger.warn('No devices specified in the configuration');
    }

    this.logger.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      this.logger.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.logger.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices() {
    for (const device of this.devices) {
      const api = new PhilipsAPI(
        this.logger,
        device.ip,
        device.port,
      );
      api.observeState();

      this.registerSensor(api, device);
      this.registerPurifier(api, device);
    }
  }

  registerSensor(api: PhilipsAPI, device: DeviceConfig) {
    const uuid: string = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${device.ip}:Quality`);

    const existingAccessory = this.accessories.find(
      accessory => accessory.UUID === uuid,
    );

    if (!existingAccessory) {
      const accessory = new this.api.platformAccessory(`${device.name} Air Quality`, uuid);
      accessory.context.device = device;

      new AirQualitySensorAccessory(
        this,
        accessory,
        this.logger,
        device.ip,
        device.port,
        api,
      );

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    } else {
      existingAccessory.context.device = device;
      new AirQualitySensorAccessory(
        this,
        existingAccessory,
        this.logger,
        device.ip,
        device.port,
        api,
      );
    }
  }

  registerPurifier(api: PhilipsAPI, device: DeviceConfig) {
    const uuid: string = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${device.ip}:Purifier`);

    const existingAccessory = this.accessories.find(
      accessory => accessory.UUID === uuid,
    );

    if (!existingAccessory) {
      const accessory = new this.api.platformAccessory(`${device.name}`, uuid);
      accessory.context.device = device;

      new AirPurifierAccessory(
        this,
        accessory,
        this.logger,
        device.ip,
        device.port,
        api,
      );

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    } else {
      existingAccessory.context.device = device;
      new AirPurifierAccessory(
        this,
        existingAccessory,
        this.logger,
        device.ip,
        device.port,
        api,
      );
    }
  }
}