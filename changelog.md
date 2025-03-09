# Changelog

All notable changes to the Homebridge Philips Air Purifier plugin will be documented in this file.

## [1.0.1] - 2024-10-26

### Added
- Enhanced connection recovery with exponential backoff retry mechanism
- Improved model detection for unknown device types
- Added configurable connection timeout (global and per-device)
- Added connection state tracking to improve reliability
- Better error reporting and comprehensive debug logging

### Fixed
- More robust error handling for network failures
- Improved handling of device state updates
- Better timeout handling for COAP requests
- Enhanced model detection to better support various Philips models