declare module '@homebridge/dbus-native' {
  export interface InvokeError extends Error {
    type: string;
    text: string;
  }
  
  // Add other types as needed for dbus-native
  export const systemBus: any;
  export const sessionBus: any;
}