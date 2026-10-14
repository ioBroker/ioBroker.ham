// Minimal, honest typings for the parts of HAP-NodeJS / Homebridge / homebridge-plugin-wrapper the adapter touches.
// The objects come from whatever Homebridge version is loaded at runtime (bundled with the wrapper, installed
// locally or globally), so only the members actually used here are declared.

/** Value of a HomeKit characteristic as far as the adapter forwards it to ioBroker */
export type CharacteristicValue = ioBroker.StateValue;

export interface HapCharacteristicProps {
    format: string;
    unit?: string;
    minValue?: number | null;
    maxValue?: number | null;
    perms: string[];
}

export interface HapCharacteristic {
    UUID: string;
    displayName: string;
    value: CharacteristicValue | undefined;
    props: HapCharacteristicProps;
    /** Not set by HAP-NodeJS (it uses props.validValues) - read for compatibility with the original mapper */
    validValues?: CharacteristicValue[];
    on(event: 'characteristic-warning', listener: (type: string, message: string, stack?: string) => void): unknown;
    getValue(callback: (err: unknown, value: CharacteristicValue | undefined) => void | Promise<void>): unknown;
    setValue(value: CharacteristicValue, callback?: SetValueCallback): unknown;
}

export interface HapService {
    UUID: string;
    displayName: string;
    subtype?: string;
    characteristics: HapCharacteristic[];
}

export interface ServiceCharacteristicChange {
    service: HapService;
    characteristic: HapCharacteristic;
    oldValue: CharacteristicValue | undefined;
    newValue: CharacteristicValue | undefined;
}

export interface HapAccessory {
    UUID: string;
    displayName: string;
    category: number;
    services: HapService[];
    on(event: 'service-characteristic-change', listener: (data: ServiceCharacteristicChange) => void): unknown;
}

/** Homebridge PlatformAccessory, only used to get to the wrapped HAP accessory */
export interface PlatformAccessory {
    UUID: string;
    _associatedHAPAccessory?: HapAccessory;
}

export type SetValueCallback = (err?: unknown, value?: CharacteristicValue) => void;

/** Content of the wrapper / local Homebridge config.json */
export interface WrapperConfig {
    bridge?: {
        name?: string;
        username?: string;
        port?: number;
        pin?: string;
        [key: string]: unknown;
    };
    accessories?: Record<string, unknown>[];
    platforms?: Record<string, unknown>[];
    [key: string]: unknown;
}

/** Logger handed to the handlers and to the wrapper. `info` is mapped to the ioBroker debug level. */
export interface HamLogger {
    info(message: string): void;
    warn(message: string): void;
    debug(message: string): void;
    silly(message: string): void;
}

/** Timer functions of the adapter instance, so that all timers are cleaned up on unload */
export interface AdapterTimers {
    setTimeout(callback: () => void, ms: number): ioBroker.Timeout | undefined;
    clearTimeout(timer: ioBroker.Timeout | undefined): void;
}

export interface CharMapEntry {
    ch_id: string;
    ch_name: string;
    sr_id: string;
    sr_name: string;
    sr_subtype: string | undefined;
    accessoryUUID: string;
}

export interface HandlerConfig {
    logger: HamLogger;
    timers: AdapterTimers;
    /** Path of the Homebridge installation (global and local mode only), with trailing separator in global mode */
    homebridgeBasePath?: string;
    homebridgeConfigPath: string;
    /** wrapper mode only */
    wrapperConfig?: WrapperConfig;
    updateDev(devId: string, devName: string, devType: number, devUuid: string): Promise<void>;
    updateChannel(devId: string, chId: string, name: string, chUuid: string): Promise<void>;
    updateState(
        devId: string,
        chId: string,
        stId: string,
        name: string,
        value: CharacteristicValue | undefined,
        common: Partial<ioBroker.StateCommon>,
        stUuid: string,
    ): Promise<void>;
    setState(devId: string, chId: string, stId: string, value: CharacteristicValue): Promise<void>;
    ignoreInfoAccessoryServices: boolean;
    /** in milliseconds */
    characteristicPollingInterval: number;
    insecureAccess: boolean;
    debugModeEnabled: boolean;
    forbiddenCharacters: RegExp;
}

export interface HomebridgeHandler {
    init(config: HandlerConfig): void;
    start(): void;
    end(): void;
    setValueForCharId(id: string, value: CharacteristicValue, callback: SetValueCallback): Promise<void>;
    registerExistingAccessory(UUID: string, name: string): void;
}
