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
  ProductId?: string; // Product ID, sometimes used for model identification
  name?: string;      // Device name, may include model information
  type?: string;      // Device type
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
    supports: {
      debugLogging: true, // Enable debug for unknown models to help with diagnosis
    },
    pm25Divisor: 100,
    airQualityThresholds: {
      good: 12,
      fair: 35,
      poor: 55,
    },
  },
};

/**
 * Pattern map to help identify models from various identifiers
 */
const MODEL_PATTERNS: Record<string, FanModel> = {
  'AC0850/11': FanModel.AC0850_11,
  'AC0850/10': FanModel.AC0850_11, // Similar enough to AC0850/11
  'AC0850/20': FanModel.AC0850_20,
  'AC1214': FanModel.AC1214,
  'AC1715': FanModel.AC1715,
  'AC2729': FanModel.AC2729,
  'AC2889': FanModel.AC2889,
  'AC3033': FanModel.AC3033,
  'AC3059': FanModel.AC3059,
  'AC3829': FanModel.AC3829,
  'AC4220': FanModel.AC4220,
};

/**
 * Attempt to detect the model of the Philips Air Purifier from its status information
 * 
 * @param status The device status object containing model information
 * @returns The detected FanModel
 */
export function detectModel(status: DeviceStatus): FanModel {
  if (!status) {
    console.warn('No device status provided for model detection');
    return FanModel.UNKNOWN;
  }

  // Collect all potential model identifiers
  const potentialIds = [
    status.D01S05,
    status.modelid,
    status.ProductId,
    status.name,
    status.type,
  ].filter(Boolean).map(id => id?.toString() || '');

  // Join all the identifiers for logging
  const allIdentifiers = potentialIds.join(', ');
  const wifiVersion = status.WifiVersion || 'unknown';

  console.debug(`Detecting model from identifiers: [${allIdentifiers}], WifiVersion: ${wifiVersion}`);

  // First, try exact matches
  for (const id of potentialIds) {
    for (const [pattern, model] of Object.entries(MODEL_PATTERNS)) {
      if (id.includes(pattern)) {
        console.info(`Detected model ${model} from pattern match: ${pattern} in ${id}`);
        return model;
      }
    }
  }

  // Handle specific model detection for more complex cases
  if (wifiVersion && wifiVersion.includes('AWS_Philips_AIR')) {
    for (const id of potentialIds) {
      if (id.includes('AC0850')) {
        return FanModel.AC0850_11;
      }
    }
  }

  // If we get here, try to extract model number from any identifiers
  for (const id of potentialIds) {
    // Try to extract AC#### pattern
    const modelMatch = id.match(/AC[0-9]{4}/i);
    if (modelMatch) {
      const extractedModel = modelMatch[0];
      console.info(`Extracted model pattern ${extractedModel} from ${id}`);
      
      // Look for closest match in our enum
      for (const model of Object.values(FanModel)) {
        if (model.includes(extractedModel)) {
          console.info(`Using closest model match: ${model}`);
          return model;
        }
      }
    }
  }
  
  console.warn(`Unable to detect model from identifiers: [${allIdentifiers}], WifiVersion: ${wifiVersion}`);
  return FanModel.UNKNOWN;
}