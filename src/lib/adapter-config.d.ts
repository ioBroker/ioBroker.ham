// Augments the globally declared ioBroker types with everything this adapter adds.
// Keep in sync with `native` in io-package.json and with admin/jsonConfig.json.
import type { WrapperConfig } from './types';

declare global {
    namespace ioBroker {
        interface AdapterConfig {
            /** Global mode: start an existing Homebridge installation. Wins over `useLocalHomebridge`. */
            useGlobalHomebridge: boolean;
            /** Local mode: install Homebridge into the adapter directory and run it as a bridge */
            useLocalHomebridge: boolean;
            /** Global mode: path of the global homebridge module, e.g. /usr/local/lib/node_modules/homebridge/ */
            globalHomebridgeBasePath: string;
            /** Global mode: Homebridge config directory, e.g. /home/pi/.homebridge/ */
            globalHomebridgeConfigPath: string;
            /** Homebridge plugins to install, separated by spaces, commas or semicolons */
            libraries: string;
            ignoreInfoAccessoryServices: boolean;
            insecureAccess: boolean;
            debugModeEnabled: boolean;
            /** in seconds; the old HTML admin stored it as string */
            characteristicPollingInterval: number | string;
            /**
             * Wrapper configuration / config.json of the local Homebridge.
             * The JsonConfig editor stores it as JSON string, older versions and the React tab as object.
             * main.ts converts it to an object at start.
             */
            wrapperConfig: WrapperConfig | string;
            /** Reinstall all plugins on next start; reset by the adapter afterwards */
            updateLibraries: boolean;
            /** Additional Homebridge command line parameters (e.g. -D) */
            virtualCommandLine: string;
        }
    }
}

export {}; // required so that the file is treated as a module
