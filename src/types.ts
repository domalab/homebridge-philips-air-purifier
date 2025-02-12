export enum FanModel {
  AC0850_11 = 'AC0850/11',
  AC0850_20 = 'AC0850/20',
  AC1214 = 'AC1214',
  AC1715 = 'AC1715',
  AC2729 = 'AC2729',
  AC2889 = 'AC2889',
  AC3033 = 'AC3033',
  AC3059 = 'AC3059',
  AC3829 = 'AC3829',
  AC4220 = 'AC4220',
  UNKNOWN = 'Unknown'
}

export interface ModelConfig {
  modes: string[];
  speeds: number[];
  supports: {
    humidity?: boolean;
    temperature?: boolean;
    filterStatus?: boolean;
    debugLogging?: boolean;
  };
  pm25Divisor?: number;
  airQualityThresholds: {
    good: number;     // 1-12 = Good
    fair: number;     // 13-35 = Fair
    poor: number;     // 36-55 = Poor
                      // >55 = Very Poor
  };
}

export interface DeviceStatus {
  D03224?: number;    // pm2_5
  D0310C?: string;    // mode
  D03102?: string;    // power status
  D01S05?: string;    // model ID
  modelid?: string;   // alternative model ID
  WifiVersion?: string; // Wifi version
  DeviceId?: string;  // Device ID for serial number
  D01S0D?: string;    // Alternative Device ID for serial number
  D01S12?: string;    // Firmware version
}

export const MODEL_CONFIGS: Record<FanModel, ModelConfig> = {
  [FanModel.AC0850_11]: {
    modes: ['auto', 'sleep', 'turbo'],
    speeds: [1, 2, 3],
    supports: {
      filterStatus: true,
      debugLogging: true,
    },
    pm25Divisor: 100,
    airQualityThresholds: {
      good: 12,     // 1-12 = Good
      fair: 35,     // 13-35 = Fair
      poor: 55,     // 36-55 = Poor
    },
  },
  [FanModel.AC0850_20]: {
    modes: ['auto', 'sleep', 'turbo'],
    speeds: [1, 2, 3],
    supports: {
      filterStatus: true,
    },
    pm25Divisor: 100,
    airQualityThresholds: {
      good: 12,
      fair: 35,
      poor: 55,
    },
  },
  [FanModel.AC1214]: {
    modes: ['auto', 'allergen', 'night', 'turbo'],
    speeds: [1, 2, 3],
    supports: {
      filterStatus: true,
    },
    pm25Divisor: 100,
    airQualityThresholds: {
      good: 12,
      fair: 35,
      poor: 55,
    },
  },
  [FanModel.AC1715]: {
    modes: ['auto', 'sleep', 'turbo'],
    speeds: [1, 2, 3],
    supports: {
      filterStatus: true,
    },
    pm25Divisor: 100,
    airQualityThresholds: {
      good: 12,
      fair: 35,
      poor: 55,
    },
  },
  [FanModel.AC2729]: {
    modes: ['auto', 'sleep', 'turbo'],
    speeds: [1, 2, 3],
    supports: {
      filterStatus: true,
    },
    pm25Divisor: 100,
    airQualityThresholds: {
      good: 12,
      fair: 35,
      poor: 55,
    },
  },
  [FanModel.AC2889]: {
    modes: ['auto', 'sleep', 'turbo'],
    speeds: [1, 2, 3],
    supports: {
      filterStatus: true,
    },
    pm25Divisor: 100,
    airQualityThresholds: {
      good: 12,
      fair: 35,
      poor: 55,
    },
  },
  [FanModel.AC3033]: {
    modes: ['auto', 'sleep', 'turbo'],
    speeds: [1, 2, 3],
    supports: {
      filterStatus: true,
    },
    pm25Divisor: 100,
    airQualityThresholds: {
      good: 12,
      fair: 35,
      poor: 55,
    },
  },
  [FanModel.AC3059]: {
    modes: ['auto', 'sleep', 'turbo'],
    speeds: [1, 2, 3],
    supports: {
      filterStatus: true,
    },
    pm25Divisor: 100,
    airQualityThresholds: {
      good: 12,
      fair: 35,
      poor: 55,
    },
  },
  [FanModel.AC3829]: {
    modes: ['auto', 'sleep', 'turbo'],
    speeds: [1, 2, 3],
    supports: {
      filterStatus: true,
    },
    pm25Divisor: 100,
    airQualityThresholds: {
      good: 12,
      fair: 35,
      poor: 55,
    },
  },
  [FanModel.AC4220]: {
    modes: ['auto', 'sleep', 'turbo'],
    speeds: [1, 2, 3],
    supports: {
      filterStatus: true,
      debugLogging: true,
    },
    pm25Divisor: 100,
    airQualityThresholds: {
      good: 12,
      fair: 35,
      poor: 55,
    },
  },
  [FanModel.UNKNOWN]: {
    modes: ['auto'],
    speeds: [1],
    supports: {},
    pm25Divisor: 100,
    airQualityThresholds: {
      good: 12,
      fair: 35,
      poor: 55,
    },
  },
};

export function detectModel(status: DeviceStatus): FanModel {
  const modelId = status.D01S05 || status.modelid || '';
  const wifiVersion = status.WifiVersion || '';

  if (modelId.includes('AC4220/12')) {
    return FanModel.AC4220;
  } else if (modelId.includes('AC0850') && wifiVersion.includes('AWS_Philips_AIR')) {
    return FanModel.AC0850_11;
  } else if (modelId.includes('AC1214')) {
    return FanModel.AC1214;
  } else if (modelId.includes('AC1715')) {
    return FanModel.AC1715;
  } else if (modelId.includes('AC2729')) {
    return FanModel.AC2729;
  } else if (modelId.includes('AC2889')) {
    return FanModel.AC2889;
  } else if (modelId.includes('AC3033')) {
    return FanModel.AC3033;
  } else if (modelId.includes('AC3059')) {
    return FanModel.AC3059;
  } else if (modelId.includes('AC3829')) {
    return FanModel.AC3829;
  }
  
  // If no match found but we have a model ID, log it
  if (modelId) {
    console.warn(`Unknown model ID: ${modelId}, WifiVersion: ${wifiVersion}`);
  }
  
  return FanModel.UNKNOWN;
}