export enum Mode {
    AUTO = 'AUTO',                // Standard Auto Mode
    AUTO_PLUS = 'AUTO_PLUS',      // Auto+ (AI Mode) 
    SLEEP = 'SLEEP',              // Sleep Mode
    MEDIUM = 'MEDIUM',            // Medium Mode
    TURBO = 'TURBO',              // Turbo Mode
    MANUAL = 'MANUAL'             // Manual Speed
}

export enum Status {
    ON,
    OFF
}

export interface State {
    pm2_5: number,
    mode: Mode,
    status: Status,
    speed?: number    // For manual mode speed level
}

export interface Info {
    name: string,
    model: string
}

export interface CommandResult {
    status: 'failed' | 'success'
}