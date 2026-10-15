import { exec } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as utils from '@iobroker/adapter-core';
import { GlobalHandler } from './lib/global-handler';
import { WrapperHandler } from './lib/wrapper-handler';
import type { CharacteristicValue, HamLogger, HandlerConfig, HomebridgeHandler, WrapperConfig } from './lib/types';
import {
    completeStateCommon,
    getLibraryDir,
    isEmptyValue,
    isHomebridgeInstallNeeded,
    parseWrapperConfig,
    splitLibraries,
} from './lib/utils';

/** Homebridge version installed into the adapter directory in local mode */
const INSTALL_LOCAL_HOMEBRIDGE_VERSION = '2.4.0';

/** Root directory of the adapter. This file is compiled to build/main.js, plugins are installed one level up. */
const ADAPTER_DIR = join(__dirname, '..');

interface LastRealStateValue {
    val: CharacteristicValue;
    ts: number;
    alreadySet: boolean;
}

type HamAdapterOptions = Partial<utils.AdapterOptions> & {
    /** Stop the adapter 10 seconds after start (used by old tests) */
    exitAfter?: boolean;
};

class HamAdapter extends utils.Adapter {
    private homebridgeHandler: HomebridgeHandler | null = null;
    private readonly npmLibrariesToInstall: string[] = [];
    private readonly initializedStateObjects: Record<string, boolean> = {};
    private readonly lastRealStateValue: Record<string, LastRealStateValue> = {};
    private readonly dataDir = utils.getAbsoluteDefaultDataDir();
    private readonly exitAfter: boolean;

    public constructor(options: HamAdapterOptions = {}) {
        super({ ...options, name: 'ham' });
        this.exitAfter = !!options.exitAfter;

        this.on('ready', () => this.onReady().catch(err => this.onException(err)));
        this.on('stateChange', (id, state) => this.onStateChange(id, state));
        this.on('unload', callback => this.onUnload(callback));

        process.on('SIGINT', () => this.homebridgeHandler?.end());
        process.on('SIGTERM', () => this.homebridgeHandler?.end());
        // Plugins tend to throw from their own callbacks. Intentionally keep the adapter running (as before).
        process.on('uncaughtException', err => this.onException(err));

        // Catch Homebridge Console Logging
        if (!process.argv.includes('--logs') && !process.argv.includes('-l')) {
            console.log = (logs: unknown): void => {
                if (this.log?.debug) {
                    this.log.debug(String(logs));
                }
                process.stdout.write(`${String(logs)}\n`);
            };
        }
    }

    private onException(err: unknown): void {
        this.log?.warn(`Exception: ${String(err)}`);
        this.homebridgeHandler?.end();
    }

    // is called when adapter shuts down - callback has to be called under any circumstances!
    private onUnload(callback: () => void): void {
        try {
            this.log.info('cleaned everything up...');
            this.homebridgeHandler?.end();
            callback();
        } catch {
            callback();
        }
    }

    // is called if a subscribed state changes
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        // Warning, state can be null if it was deleted
        this.log.info(`stateChange ${id} ${JSON.stringify(state)}`);

        if (state && !state.ack) {
            const charId = id.substring(this.namespace.length + 1);
            this.log.debug(`Set value ${JSON.stringify(state.val)} for lookup id ${charId}`);
            void this.homebridgeHandler?.setValueForCharId(charId, state.val, (err, val) => {
                if (err) {
                    this.log.info(`Error setting value ${JSON.stringify(state.val)} for ${charId}: ${err as string}`);
                } else {
                    if (val === undefined) {
                        val = state.val;
                    }
                    this.log.debug(`Set value ${JSON.stringify(val)} for ${charId} successful`);
                }
            });
        }
    }

    private updateDev = async (dev_id: string, dev_name: string, dev_type: number, dev_uuid: string): Promise<void> => {
        this.log.info(`updateDev ${dev_id}: name = ${dev_name} /type= ${dev_type}`);
        // create dev
        await this.extendObject(dev_id, {
            type: 'device',
            common: { name: dev_name },
            native: {
                UUID: dev_uuid,
                displayName: dev_name,
                category: dev_type,
            },
        });
    };

    private updateChannel = async (dev_id: string, ch_id: string, name: string, ch_uuid: string): Promise<void> => {
        const id = `${dev_id}.${ch_id}`;
        // create channel for dev
        this.log.info(`updateChannel ${id}: name = ${name}`);

        await this.extendObject(id, {
            type: 'channel',
            common: { name },
            native: {
                UUID: ch_uuid,
                displayName: name,
            },
        });
    };

    private updateState = async (
        dev_id: string,
        ch_id: string,
        st_id: string,
        name: string,
        value: CharacteristicValue | undefined,
        common: Partial<ioBroker.StateCommon> | undefined,
        st_uuid: string,
    ): Promise<void> => {
        const id = `${dev_id}.${ch_id}.${st_id}`;
        common = completeStateCommon(common, name);

        this.log.info(`updateState ${id}: value = ${value} /common= ${JSON.stringify(common)}`);

        await this.extendObject(id, {
            type: 'state',
            common,
            native: {
                UUID: st_uuid,
                displayName: name,
            },
        });

        this.initializedStateObjects[id] = true;

        const lastValue = this.lastRealStateValue[id];
        if (lastValue && !lastValue.alreadySet) {
            // When a setState came before objects were initialized set the postponed value now
            this.log.debug(`updateState ${id}: set postponed value = ${lastValue.val}`);
            lastValue.alreadySet = true;
            await this.setState(id, {
                val: lastValue.val,
                ts: lastValue.ts,
                ack: true,
            });
        } else if (value !== undefined && !lastValue) {
            // Only set values from object definition if no real queried value exists
            this.log.debug(`updateState ${id}: set value = ${value}`);
            await this.setState(id, { val: value, ack: true });
        }
    };

    private setHomebridgeState = async (
        dev_id: string,
        ch_id: string,
        st_id: string,
        value: CharacteristicValue,
    ): Promise<void> => {
        const id = `${dev_id}.${ch_id}.${st_id}`;
        this.log.debug(`setState ${id}: set value = ${value}`);
        if (!this.initializedStateObjects[id]) {
            if (isEmptyValue(value)) {
                this.log.debug(`setState ${id}: discard value because most likely "no value" available right now`);
                return;
            }
            this.lastRealStateValue[id] = {
                val: value,
                ts: Date.now(),
                alreadySet: false,
            };
            return;
        }
        this.lastRealStateValue[id] = {
            val: value,
            ts: Date.now(),
            alreadySet: true,
        };
        await this.setState(id, value, true);
    };

    private async loadExistingAccessories(): Promise<boolean> {
        let res: ioBroker.DeviceObject[] | undefined;
        try {
            res = await this.getDevicesAsync();
        } catch (err) {
            this.log.error(`Can not get all existing devices: ${err}`);
            return false;
        }
        if (!res) {
            this.log.error(`Can not get all existing devices: ${String(res)}`);
            return false;
        }
        for (const device of res) {
            const native = device.native as { UUID?: string; displayName?: string } | undefined;
            if (native?.UUID) {
                this.log.debug(`Remember existing Accessory ${native.displayName} with UUID ${native.UUID}`);
                this.homebridgeHandler?.registerExistingAccessory(native.UUID, native.displayName as string);
            }
        }
        return true;
    }

    /** The handlers always get the wrapper configuration as object (see parseWrapperConfig) */
    private getWrapperConfig(): WrapperConfig | null {
        try {
            return parseWrapperConfig(this.config.wrapperConfig);
        } catch (e) {
            this.log.error(`Cannot parse the wrapper configuration (JSON): ${(e as Error).message}`);
            return null;
        }
    }

    // is called when databases are connected and adapter received configuration.
    private async onReady(): Promise<void> {
        const usedLogger: HamLogger = {
            info: (message: string): void => this.log.debug(message),
            warn: (message: string): void => this.log.warn(message),
            debug: (message: string): void => this.log.debug(message),
            silly: (message: string): void => this.log.silly(message),
        };
        if (this.config.virtualCommandLine) {
            // string-argv declares its types as ESM, so it is loaded via dynamic import from this CommonJS build
            const { parseArgsStringToArgv } = await import('string-argv');
            parseArgsStringToArgv(this.config.virtualCommandLine).forEach(e => process.argv.push(e));
        }

        const wrapperConfig = this.getWrapperConfig();
        if (!wrapperConfig) {
            return;
        }
        this.config.wrapperConfig = wrapperConfig;

        if (!(await this.checkLocalMode(wrapperConfig))) {
            return;
        }
        if (!(await this.installAllLibraries())) {
            return;
        }

        const configDir = join(this.dataDir, this.namespace.replace('.', '_'));
        const handlerConfig: Omit<HandlerConfig, 'homebridgeConfigPath'> = {
            logger: usedLogger,
            timers: {
                setTimeout: (callback, ms) => this.setTimeout(callback, ms),
                clearTimeout: timer => this.clearTimeout(timer),
            },
            updateDev: this.updateDev,
            updateChannel: this.updateChannel,
            updateState: this.updateState,
            setState: this.setHomebridgeState,
            ignoreInfoAccessoryServices: this.config.ignoreInfoAccessoryServices,
            // the old HTML admin stored the interval as string
            characteristicPollingInterval: Number(this.config.characteristicPollingInterval) * 1000,
            insecureAccess: this.config.insecureAccess || false,
            debugModeEnabled: this.config.debugModeEnabled || false,
            forbiddenCharacters: this.FORBIDDEN_CHARS,
        };

        if (this.config.useGlobalHomebridge) {
            this.log.info('Adapter uses Global mode');
            this.log.debug(`Use Global Homebridge Path: ${this.config.globalHomebridgeBasePath}`);
            const delimiter = process.platform === 'win32' ? ';' : ':';
            let nodePathEnv = process.env.NODE_PATH;
            if (!nodePathEnv) {
                nodePathEnv = this.config.globalHomebridgeBasePath;
            } else {
                nodePathEnv = `${this.config.globalHomebridgeBasePath}${delimiter}${nodePathEnv}`;
            }
            nodePathEnv = `${join(this.config.globalHomebridgeBasePath, '..')}${delimiter}${nodePathEnv}`;
            // Homebridge's plugin manager reads NODE_PATH to find the globally installed plugins
            process.env.NODE_PATH = nodePathEnv;
            this.homebridgeHandler = new GlobalHandler();
            await this.homebridgeHandler.init({
                ...handlerConfig,
                homebridgeBasePath: this.config.globalHomebridgeBasePath,
                homebridgeConfigPath: this.config.globalHomebridgeConfigPath,
            });
        } else if (this.config.useLocalHomebridge) {
            this.log.info('Adapter uses Local mode');
            try {
                if (!existsSync(configDir)) {
                    mkdirSync(configDir);
                }
                // some Plugins want to have config file
                writeFileSync(join(configDir, 'config.json'), JSON.stringify(wrapperConfig));
            } catch (err) {
                this.log.error(
                    `Error writing config file at ${join(configDir, 'config.json')}, but needed for local Mode to work! Exiting: ${err}`,
                );
                return;
            }
            this.homebridgeHandler = new GlobalHandler();
            await this.homebridgeHandler.init({
                ...handlerConfig,
                homebridgeBasePath: join(ADAPTER_DIR, 'node_modules', 'homebridge'),
                homebridgeConfigPath: configDir,
            });
        } else {
            this.log.info('Adapter uses Wrapper mode');
            this.homebridgeHandler = new WrapperHandler();
            await this.homebridgeHandler.init({
                ...handlerConfig,
                homebridgeConfigPath: configDir,
                wrapperConfig,
                // The plugins are installed into the adapter directory, but the wrapper (and with it Homebridge, which
                // searches relative to itself) is usually hoisted into the node_modules of ioBroker
                customPluginPath: join(ADAPTER_DIR, 'node_modules'),
            });
        }

        if (!(await this.loadExistingAccessories())) {
            return;
        }

        // in this template all states changes inside the adapters namespace are subscribed
        await this.subscribeStatesAsync('*');

        this.homebridgeHandler.start();

        if (this.exitAfter) {
            this.setTimeout(() => void this.stop?.(), 10000);
        }
    }

    private installNpm(npmLib: string): Promise<void> {
        if (!existsSync(join(ADAPTER_DIR, 'node_modules'))) {
            mkdirSync(join(ADAPTER_DIR, 'node_modules'));
        }

        const cmd = `npm install ${npmLib} --production  --loglevel error`;
        this.log.info(`${cmd} (System call)`);

        // Install node modules as system call
        // System call used for update of js-controller itself,
        // because during installation npm packet will be deleted too, but some files must be loaded even during the install process.
        return new Promise(resolve => {
            const child = exec(cmd, {
                cwd: ADAPTER_DIR,
                windowsHide: true,
            });

            child.stdout?.on('data', (buf: Buffer | string) => this.log.info(buf.toString('utf8')));
            child.stderr?.on('data', (buf: Buffer | string) => this.log.info(buf.toString('utf8')));

            child.on('exit', (code /* , signal */) => {
                // exit code 1 is treated as success (as in the original code)
                if (code && code !== 1) {
                    this.log.error(`Cannot install ${npmLib}: ${code}`);
                }
                // the result is checked by installNpmLibraryWithRetries
                resolve();
            });
        });
    }

    /**
     * Installs the library if it is missing (or always for URLs / updateLibraries / force). Throws after 3 failed attempts.
     *
     * @param npmLib npm package (with optional version) or URL
     * @param force install even if the package already exists (e.g. in another version)
     */
    private async installNpmLibraryWithRetries(npmLib: string, force = false): Promise<void> {
        for (let counter = 3; ; counter--) {
            if (counter === 0) {
                throw new Error(`Library ${npmLib} not installed after 3 attempts`);
            }
            const libraryDir = getLibraryDir(npmLib);
            const isUrl = npmLib.includes('://');
            if (
                (isUrl && counter === 3) ||
                (!isUrl && !existsSync(join(ADAPTER_DIR, 'node_modules', libraryDir, 'package.json'))) ||
                ((this.config.updateLibraries || force) && counter === 3)
            ) {
                await this.installNpm(npmLib);
            } else {
                return;
            }
        }
    }

    private async installLibraries(): Promise<void> {
        while (this.npmLibrariesToInstall.length) {
            const lib = this.npmLibrariesToInstall[0];
            this.log.info(`Install/Update ${lib}`);

            try {
                await this.installNpmLibraryWithRetries(lib);
            } catch (err) {
                this.log.error(String(err));
            }
            this.npmLibrariesToInstall.shift();
        }
    }

    /** @returns false if the adapter must not continue (it will be restarted because of a config change) */
    private async installAllLibraries(): Promise<boolean> {
        if (this.config?.libraries && !this.config.useGlobalHomebridge) {
            this.npmLibrariesToInstall.push(...splitLibraries(this.config.libraries));
        }

        if (this.npmLibrariesToInstall.length) {
            this.log.info(`Install/Update the following Libraries: ${this.npmLibrariesToInstall.join(', ')}`);
            await this.installLibraries();
            if (this.config.updateLibraries) {
                this.log.info('All NPM Modules got reinstalled/updated ... restarting ...');
                await this.extendForeignObjectAsync(`system.adapter.${this.namespace}`, {
                    native: {
                        updateLibraries: false,
                    },
                });
                return false;
            }
            this.log.info('All Libraries installed/updated');
            return true;
        }
        this.log.info('No additional Libraries to install ...');
        return true;
    }

    /** @returns false if the adapter cannot start in local mode */
    private async checkLocalMode(wrapperConfig: WrapperConfig): Promise<boolean> {
        if (!this.config.useLocalHomebridge) {
            return true;
        }
        const localConfigDir = join(this.dataDir, this.namespace.replace('.', '_'));
        if (existsSync(join(localConfigDir, 'config.json'))) {
            try {
                const formerConfig = JSON.parse(readFileSync(join(localConfigDir, 'config.json'), 'utf8')) as
                    WrapperConfig | undefined;
                if (
                    formerConfig?.bridge?.username &&
                    wrapperConfig?.bridge?.username &&
                    wrapperConfig.bridge.username !== formerConfig.bridge.username
                ) {
                    this.log.info('remove homebridge cache directory because Bridge username changed!');
                    rmSync(localConfigDir, { recursive: true, force: true });
                }
            } catch (err) {
                this.log.error(`Error while checking former homebridge config: ${err}`);
            }
        }

        const homebridgePackage = join(ADAPTER_DIR, 'node_modules', 'homebridge', 'package.json');
        let packageJson: string | null = null;
        if (existsSync(homebridgePackage)) {
            try {
                packageJson = readFileSync(homebridgePackage, 'utf-8');
            } catch {
                // unreadable: treated like an invalid package.json
                packageJson = '';
            }
        }

        if (isHomebridgeInstallNeeded(packageJson, INSTALL_LOCAL_HOMEBRIDGE_VERSION) || this.config.updateLibraries) {
            this.log.info(`Need to install/update homebridge@${INSTALL_LOCAL_HOMEBRIDGE_VERSION}`);
            try {
                // force: an existing Homebridge in another version must be replaced
                await this.installNpmLibraryWithRetries(`homebridge@${INSTALL_LOCAL_HOMEBRIDGE_VERSION}`, true);
            } catch (err) {
                this.log.error(`Can not start in local Mode because Homebridge is not installed: ${err}`);
                return false;
            }
            this.log.debug('Install/Update homebridge done');
        }
        return true;
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new HamAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new HamAdapter())();
}
