# Homebridge Philips Air Purifier Plugin

A Homebridge plugin that allows you to control your Philips Air Purifier through HomeKit. This plugin supports various Philips Air Purifier models and provides both air quality monitoring and purifier control capabilities.

## Supported Models

- AC0850/11 (with AWS WiFi version)
- AC0850/20
- AC1214
- AC1715
- AC2729
- AC2889
- AC3033
- AC3059
- AC3829
- AC4220

## Features

- Real-time air quality monitoring (PM2.5)
- Air quality level indication (Good/Fair/Poor/Very Poor)
- Power control (On/Off)
- Mode control (Auto/Sleep/Turbo)
- Fan speed control
- Auto mode support
- Filter status monitoring (on supported models)
- Robust connection handling with automatic recovery
- Configurable connection timeouts

## Prerequisites

- Node.js (v18.20.4, v20.16.0, or v22.6.0)
- Homebridge (v1.8.0 or newer)
- A supported Philips Air Purifier connected to your local network
- Static IP address for your air purifier (recommended to set this up in your router)

## Installation

You can install this plugin through Homebridge Config UI X or manually using npm:

```bash
npm install -g homebridge-philips-air-purifier
```

## Configuration

### Through Homebridge Config UI X

1. Navigate to the Plugins page
2. Search for "homebridge-philips-air-purifier"
3. Install the plugin
4. Click on Settings for the plugin
5. Add your device(s) with their IP addresses and ports

### Manual Configuration

Add this to your Homebridge `config.json`:

```json
{
    "platforms": [
        {
            "platform": "PhilipsAirPurifier",
            "name": "Philips Air Purifier",
            "connectionTimeout": 10000,
            "devices": [
                {
                    "name": "Living Room Air Purifier",
                    "ip": "192.168.1.100",
                    "port": 5683,
                    "connectionTimeout": 15000
                }
            ]
        }
    ]
}
```

### Configuration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `platform` | string | Required | Must be "PhilipsAirPurifier" |
| `name` | string | "Philips Air Purifier" | Name of the platform |
| `connectionTimeout` | number | 10000 | Global connection timeout in milliseconds |
| `devices` | array | Required | Array of device configurations |
| `devices[].name` | string | Required | Name of the device in HomeKit |
| `devices[].ip` | string | Required | IP address of the device |
| `devices[].port` | number | 5683 | Port number (usually 5683) |
| `devices[].connectionTimeout` | number | *inherited from global* | Device-specific timeout (overrides global) |

## Features Details

### Air Quality Sensor

- PM2.5 density measurement
- Air quality levels based on PM2.5 readings:
  - Good: 1-12 μg/m³
  - Fair: 13-35 μg/m³
  - Poor: 36-55 μg/m³
  - Very Poor: >55 μg/m³

### Air Purifier Control

- Power control
- Mode selection:
  - Auto
  - Sleep
  - Turbo
- Fan speed control (percentage-based)
- Manual and automatic operation modes

### Connection Reliability

- Automatic connection recovery with exponential backoff
- Configurable timeouts for network operations
- Enhanced error reporting and handling
- Improved device detection for various models

## Troubleshooting

1. **Device Not Responding**
   - Verify the IP address is correct
   - Ensure the device is on the same network
   - Check if port 5683 is accessible
   - Try increasing the `connectionTimeout` value

2. **Incorrect Readings**
   - Restart the air purifier
   - Restart Homebridge
   - Check if the device firmware is up to date

3. **Connection Issues**
   - Ensure your device has a stable network connection
   - Consider setting up a static IP for your device
   - Check your network firewall settings
   - Look for connection logs in Homebridge

4. **Unknown Model**
   - If your device is reported as "Unknown", please submit an issue with the logs
   - The plugin will still attempt to work with basic functionality

## Development

```bash
# Clone the repository
git clone https://github.com/domalab/homebridge-philips-air-purifier.git

# Install dependencies
npm install

# Build the plugin
npm run build

# Link for development
npm link

# Watch for changes
npm run watch
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache-2.0 License - see the LICENSE file for details.

## Disclaimer

This plugin is not officially associated with or endorsed by Philips. All product names, logos, and brands are property of their respective owners.
