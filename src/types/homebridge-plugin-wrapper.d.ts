// homebridge-plugin-wrapper ships no typings. Only the members used by the adapter are declared.
declare module 'homebridge-plugin-wrapper' {
    import { EventEmitter } from 'node:events';

    export interface WrapperOptions {
        logger: {
            info(message: string): void;
            warn(message: string): void;
            debug(message: string): void;
            silly(message: string): void;
        };
        homebridgeConfigPath: string;
        wrapperConfig: Record<string, unknown>;
        characteristicPollingInterval?: number;
        characteristicPollingList?: Record<string, number>;
        insecureAccess?: boolean;
        debugModeEnabled?: boolean;
        [key: string]: unknown;
    }

    /**
     * Runs Homebridge plugins without a published bridge.
     *
     * Events: `addAccessory`, `updateAccessory`, `addExternalAccessory`, `removeAccessory` (accessory),
     * `characteristic-value-change` / `characteristic-value-update` ({ accessory, service, characteristic, oldValue, newValue })
     */
    export class Wrapper extends EventEmitter {
        public constructor(config: WrapperOptions);
        public init(): void;
        public finish(): void;
        public pollAccessoryService(
            accessory: object,
            serviceOrNameOrUUID: object | string,
            isUpdate?: boolean,
        ): Promise<void>;
    }

    /** UUIDs of the HomeKit service (`*_STYPE`) and characteristic (`*_CTYPE`) types */
    export const HapTypes: Record<string, string>;
}
