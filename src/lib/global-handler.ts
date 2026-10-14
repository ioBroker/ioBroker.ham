import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Mapper } from './mapper';
import { MiniQueue } from './miniqueue';
import { customStringify } from './utils';
import type {
    CharacteristicValue,
    CharMapEntry,
    HamLogger,
    HandlerConfig,
    HapAccessory,
    HapCharacteristic,
    HapService,
    HomebridgeHandler,
    PlatformAccessory,
    SetValueCallback,
} from './types';

// Shapes of the Homebridge / HAP-NodeJS internals that are loaded at runtime from the Homebridge installation

interface HomebridgeUserClass {
    setStoragePath(...storagePathSegments: string[]): void;
    persistPath(): string;
}

interface HapBridge {
    publish(info: unknown, allowInsecureRequest?: boolean): unknown;
    addBridgedAccessory(accessory: HapAccessory, deferUpdate?: boolean): HapAccessory;
    on(event: string, listener: () => void): unknown;
}

type HapBridgeConstructor = new (displayName: string, serialNumber: string) => HapBridge;

interface HapModule {
    Bridge: HapBridgeConstructor;
    uuid: { generate(data: string): string };
}

interface HapStorageClass {
    setCustomStoragePath(path: string): void;
}

interface InterceptedBridge extends HapBridge {
    ___wrapperAccessoryLogic(accessory: HapAccessory, external?: boolean, isUpdate?: boolean): Promise<void>;
    ___wrapperAccessoryRemoveLogic(accessory: HapAccessory): void;
    ___pollAccessory(accessory: HapAccessory, isUpdate?: boolean): Promise<void>;
    ___pollAccessoryService(
        accessory: HapAccessory,
        serviceOrNameOrUUID: HapService | string | undefined,
        isUpdate?: boolean,
    ): Promise<void>;
    ___pollAccessoryServiceCharacteristic(
        accessory: HapAccessory,
        serviceOrNameOrUUID: HapService | string | undefined,
        characteristicOrNameOrUUID: HapCharacteristic | string | undefined,
        isUpdate?: boolean,
    ): Promise<CharacteristicValue | undefined>;
}

interface HomebridgeServer {
    config: { bridge: { name: string } };
    serverStatus: string;
    setServerStatus(status: string): void;
    bridgeService: {
        bridge: InterceptedBridge;
        api: {
            on(
                event: 'updatePlatformAccessories' | 'unregisterPlatformAccessories',
                listener: (accessories: PlatformAccessory[]) => void,
            ): unknown;
        };
        handlePublishExternalAccessories(accessories: HapAccessory[]): Promise<void>;
        saveCachedPlatformAccessoriesOnDisk(): void;
    };
    start(): unknown;
    teardown(): void;
}

interface HomebridgeServerModule {
    Server: new (options?: unknown) => HomebridgeServer;
}

interface HomebridgeLoggerModule {
    setDebugEnabled(enabled?: boolean): void;
}

/**
 * Global and local mode: starts the Homebridge server of an installed Homebridge (global installation or
 * the one installed into the adapter directory) and intercepts its bridge to mirror all accessories.
 */
export class GlobalHandler implements HomebridgeHandler {
    private User: HomebridgeUserClass | null = null;
    private hap: HapModule | null = null;
    private hapStorage: HapStorageClass | null = null;
    private Server: HomebridgeServerModule | null = null;
    private InterceptedBridge: (new (displayName: string, serialNumber: string) => InterceptedBridge) | null = null;

    private server: HomebridgeServer | null = null;
    private readonly charMap: Record<string, CharMapEntry> = {};
    private readonly characteristicPollingTimeouts: Record<string, ioBroker.Timeout | undefined> = {};
    /** Per characteristic polling intervals (by displayName). Never filled, kept from the original implementation. */
    private readonly characteristicPollingList: Record<string, number> = {};
    private readonly characteristicValues: Record<string, { val: CharacteristicValue | undefined; ts: number }> = {};
    private readonly knownAccessories: Record<string, HapAccessory> = {};
    private ended = false;

    private logger!: HamLogger;
    private config!: HandlerConfig;
    private mapper!: Mapper;
    private miniQueue!: MiniQueue;

    public init(config: HandlerConfig): void {
        this.config = config;
        this.logger = config.logger;
        this.miniQueue = new MiniQueue(config.timers);
        this.mapper = new Mapper(config.forbiddenCharacters);

        const homebridgeBasePath = config.homebridgeBasePath || '';

        this.User = (require(join(homebridgeBasePath, 'lib', 'user')) as { User: HomebridgeUserClass }).User;
        this.User.setStoragePath(config.homebridgeConfigPath);

        let hapBasePath: string;

        if (existsSync(join(homebridgeBasePath, 'node_modules/hap-nodejs/dist'))) {
            hapBasePath = join(homebridgeBasePath, 'node_modules/hap-nodejs/dist');
        } else if (existsSync(join(homebridgeBasePath, '../hap-nodejs/dist'))) {
            hapBasePath = join(homebridgeBasePath, '../hap-nodejs/dist');
        } else {
            try {
                hapBasePath = dirname(
                    require.resolve('hap-nodejs', {
                        paths: [join(homebridgeBasePath, 'node_modules'), homebridgeBasePath],
                    }),
                );
                this.logger.info(`HAP-NodeJS lookup fallback used: ${hapBasePath}`);
            } catch {
                console.log(
                    `hap-nodejs resolve path: ${JSON.stringify([join(homebridgeBasePath, 'node_modules'), homebridgeBasePath])}`,
                );
                return;
            }
        }

        this.hap = require(hapBasePath) as HapModule;
        this.hapStorage = (
            require(join(hapBasePath, 'lib/model/HAPStorage')) as { HAPStorage: HapStorageClass }
        ).HAPStorage;
        this.Server = require(join(homebridgeBasePath, 'lib/server')) as HomebridgeServerModule;
        const homebridgeLogger = require(join(homebridgeBasePath, 'lib/logger')) as HomebridgeLoggerModule;
        if (config.debugModeEnabled) {
            homebridgeLogger.setDebugEnabled(true);
        }

        if (!this.InterceptedBridge) {
            this.InterceptedBridge = this.createInterceptedBridge(this.hap.Bridge);
        }
    }

    private pollingKey(accessory: HapAccessory, service: HapService, characteristic: HapCharacteristic): string {
        return `${accessory.UUID}-${accessory.displayName}.${service.UUID}-${service.displayName}-${service.subtype}.${characteristic.UUID}-${characteristic.displayName}`;
    }

    private handleCharacteristicPolling(
        accessory: HapAccessory,
        serviceOrNameOrUUID: HapService | string,
        characteristicOrNameOrUUID: HapCharacteristic | string,
    ): void {
        const service =
            typeof serviceOrNameOrUUID === 'string'
                ? accessory.services.find(s => s.displayName === serviceOrNameOrUUID || s.UUID === serviceOrNameOrUUID)!
                : serviceOrNameOrUUID;
        const characteristic =
            typeof characteristicOrNameOrUUID === 'string'
                ? service.characteristics.find(
                      c => c.displayName === characteristicOrNameOrUUID || c.UUID === characteristicOrNameOrUUID,
                  )!
                : characteristicOrNameOrUUID;
        let pollingInterval: number;
        if (this.characteristicPollingList && characteristic.displayName in this.characteristicPollingList) {
            pollingInterval = this.characteristicPollingList[characteristic.displayName];
        } else {
            pollingInterval = this.config.characteristicPollingInterval;
        }
        if (pollingInterval) {
            const key = this.pollingKey(accessory, service, characteristic);
            if (this.characteristicPollingTimeouts[key]) {
                this.config.timers.clearTimeout(this.characteristicPollingTimeouts[key]);
            }
            this.characteristicPollingTimeouts[key] = this.config.timers.setTimeout(() => {
                delete this.characteristicPollingTimeouts[key];
                const currService = accessory.services.find(
                    s =>
                        s.UUID === service.UUID &&
                        s.displayName === service.displayName &&
                        s.subtype === service.subtype,
                );
                // currService is not checked in the original code either
                const currCharacteristic = currService!.characteristics.find(
                    c => c.UUID === characteristic.UUID && c.displayName === characteristic.displayName,
                );
                if (!currCharacteristic) {
                    return;
                }
                void this.getAndPollCharacteristic(accessory, currService!, currCharacteristic, false);
            }, pollingInterval);
        }
    }

    private getAndPollCharacteristic(
        accessory: HapAccessory,
        service: HapService,
        characteristic: HapCharacteristic,
        isUpdate?: boolean,
    ): Promise<CharacteristicValue | undefined> {
        return new Promise(resolve =>
            characteristic.getValue(async (err, value) => {
                if (!err) {
                    const key = this.pollingKey(accessory, service, characteristic);
                    if (!this.characteristicValues[key] || this.characteristicValues[key].val !== value || isUpdate) {
                        // for accessory updates we should check if we need to repost the value
                        const oldValue = this.characteristicValues[key]?.val;
                        this.characteristicValues[key] = {
                            val: value,
                            ts: Date.now(),
                        };
                        this.logger.debug(`Char value update from polling: ${oldValue} --> ${value}`);
                        await this.handleCharValue(accessory, service, characteristic, value);
                    }
                } else {
                    value = undefined;
                }
                this.handleCharacteristicPolling(accessory, service, characteristic);
                resolve(value);
            }),
        );
    }

    private async iterateCharArray(
        chars: HapCharacteristic[],
        accessory: HapAccessory,
        service: HapService,
        dev_idname: string,
        sr_id: string,
        sr_idname: string,
        sr_name: string,
        sr_subtype: string | undefined,
    ): Promise<void> {
        for (const char of chars) {
            if (this.ended) {
                return;
            }

            const ch_id = char.UUID;
            const ch_name = char.displayName;
            const ch_val = char.value;
            const ch_idname = this.mapper.mapCharacteristicType(sr_id, ch_id, ch_name);
            const id = `${dev_idname}.${sr_idname}.${ch_idname}`;

            const common = this.mapper.mapCharacteristicProperties(char);
            this.logger.debug(`Mapped Common for ${id}: ${JSON.stringify(common)}`);
            if (common.write) {
                this.charMap[id] = {
                    ch_id,
                    ch_name,
                    sr_id,
                    sr_name,
                    sr_subtype,
                    accessoryUUID: accessory.UUID,
                };
                this.logger.silly(`Add object to charmap with id ${id}/${customStringify(char)}`);
            }

            char.on('characteristic-warning', (type, message, stack) =>
                this.logger.info(`Characteristic warning for ${id}: ${type} ${message} ${stack}`),
            );

            await this.config.updateState(dev_idname, sr_idname, ch_idname, ch_name, ch_val, common, ch_id);
            char.getValue(async (err, value) => {
                if (err) {
                    this.logger.warn(`Error while getting current value: ${err as string}`);
                    return;
                }
                await this.handleCharValue(accessory, service, char, value);
            });
            this.handleCharacteristicPolling(accessory, service, char);
        }
    }

    private clearPollingOfAccessory(accessory: HapAccessory): void {
        for (const key of Object.keys(this.characteristicPollingTimeouts)) {
            if (key.startsWith(accessory.UUID)) {
                this.config.timers.clearTimeout(this.characteristicPollingTimeouts[key]);
                delete this.characteristicPollingTimeouts[key];
            }
        }
    }

    /** Subclasses the HAP-NodeJS Bridge of the loaded Homebridge to see every bridged accessory */
    private createInterceptedBridge(
        Bridge: HapBridgeConstructor,
    ): new (displayName: string, serialNumber: string) => InterceptedBridge {
        const handler = this;
        const logger = this.logger;

        return class MyBridge extends Bridge implements InterceptedBridge {
            public constructor(displayName: string, serialNumber: string) {
                logger.debug(`iobroker.ham Bridge constructor: displayName=${displayName}, UUID=${serialNumber}`);
                super(displayName, serialNumber);
            }

            public publish(info: unknown, allowInsecureRequest?: boolean): void {
                logger.debug(`iobroker.ham Bridge publish ${customStringify(info)}`);
                // Calling the method of the parent class (its result was not returned in the original code either)
                super.publish(info, allowInsecureRequest);
            }

            public async ___wrapperAccessoryLogic(
                accessory: HapAccessory,
                external?: boolean,
                isUpdate?: boolean,
            ): Promise<void> {
                logger.debug(
                    `iobroker.ham Bridge addBridgedAccessory (ext=${external}) ${accessory.UUID}: ${accessory.displayName}`,
                );

                if (handler.knownAccessories[accessory.UUID]) {
                    logger.debug(`Accessory ${accessory.displayName} with ID ${accessory.UUID} already known`);
                    // We already know the accessory: remove all polling timeouts because they will be re-registered
                    handler.clearPollingOfAccessory(accessory);
                    isUpdate = true;
                }

                if (!isUpdate) {
                    accessory.on('service-characteristic-change', async data => {
                        logger.debug(`Char change event: ${data.oldValue} --> ${data.newValue}`);
                        const key = handler.pollingKey(accessory, data.service, data.characteristic);
                        const now = Date.now();
                        if (
                            handler.characteristicValues[key] &&
                            handler.characteristicValues[key].val === data.newValue &&
                            handler.characteristicValues[key].ts > now - 2000
                        ) {
                            // Sometimes events are submitted twice, so we ignore them if they are submitted within 2 seconds with same value
                            return;
                        }
                        handler.characteristicValues[key] = {
                            val: data.newValue,
                            ts: now,
                        };
                        await handler.handleCharValue(accessory, data.service, data.characteristic, data.newValue);
                    });
                }

                handler.knownAccessories[accessory.UUID] = accessory;

                // New device
                const dev_id = accessory.UUID;
                const dev_idname = handler.mapper.mapAccessoryUUID(dev_id, accessory.displayName);
                const dev_name = accessory.displayName;
                const dev_cat = accessory.category;

                await handler.config.updateDev(dev_idname, dev_name, dev_cat, dev_id);

                for (const service of accessory.services) {
                    if (handler.ended) {
                        return;
                    }

                    const sr_id = service.UUID;
                    const sr_idname = handler.mapper.mapServiceType(sr_id, service.displayName);
                    const sr_name = service.displayName;

                    if (handler.config.ignoreInfoAccessoryServices && sr_idname === 'Accessory-Information') {
                        continue;
                    }

                    logger.silly(`Add service class=${customStringify(service)}`);
                    await handler.config.updateChannel(dev_idname, sr_idname, sr_name, sr_id);

                    await handler.iterateCharArray(
                        service.characteristics,
                        accessory,
                        service,
                        dev_idname,
                        sr_id,
                        sr_idname,
                        sr_name,
                        service.subtype,
                    );
                }
            }

            public ___wrapperAccessoryRemoveLogic(accessory: HapAccessory): void {
                // The original code had an additional check `!knownAccessories[UUID] === accessory` here that
                // compared a boolean with an object and therefore never matched. It is left out.
                if (handler.knownAccessories[accessory.UUID]) {
                    logger.debug(`Delete Accessory ${accessory.displayName} with ID ${accessory.UUID}`);
                    handler.clearPollingOfAccessory(accessory);
                }
                delete handler.knownAccessories[accessory.UUID];
            }

            public addBridgedAccessory(accessory: HapAccessory, deferUpdate?: boolean): HapAccessory {
                logger.debug(`PRE iobroker.ham Bridge addBridgedAccessory ${accessory.UUID}: ${accessory.displayName}`);
                // Calling the method of the parent class
                const bridgedAccessory = super.addBridgedAccessory(accessory, deferUpdate);

                handler.miniQueue.addToQueue(bridgedAccessory.UUID, () =>
                    this.___wrapperAccessoryLogic(bridgedAccessory),
                );
                return bridgedAccessory;
            }

            public async ___pollAccessory(accessory: HapAccessory, isUpdate?: boolean): Promise<void> {
                for (const service of accessory.services) {
                    await this.___pollAccessoryService(accessory, service, isUpdate);
                }
            }

            public async ___pollAccessoryService(
                accessory: HapAccessory,
                serviceOrNameOrUUID: HapService | string | undefined,
                isUpdate?: boolean,
            ): Promise<void> {
                if (typeof serviceOrNameOrUUID === 'string') {
                    const nameOrUUID = serviceOrNameOrUUID;
                    serviceOrNameOrUUID = accessory.services.find(
                        s => s.displayName === nameOrUUID || s.UUID === nameOrUUID,
                    );
                }
                if (!serviceOrNameOrUUID) {
                    return;
                }
                for (const characteristic of serviceOrNameOrUUID.characteristics) {
                    await handler.getAndPollCharacteristic(accessory, serviceOrNameOrUUID, characteristic, isUpdate);
                }
            }

            public async ___pollAccessoryServiceCharacteristic(
                accessory: HapAccessory,
                serviceOrNameOrUUID: HapService | string | undefined,
                characteristicOrNameOrUUID: HapCharacteristic | string | undefined,
                isUpdate?: boolean,
            ): Promise<CharacteristicValue | undefined> {
                if (typeof serviceOrNameOrUUID === 'string') {
                    const nameOrUUID = serviceOrNameOrUUID;
                    serviceOrNameOrUUID = accessory.services.find(
                        s => s.displayName === nameOrUUID || s.UUID === nameOrUUID,
                    );
                }
                if (serviceOrNameOrUUID && typeof characteristicOrNameOrUUID === 'string') {
                    const nameOrUUID = characteristicOrNameOrUUID;
                    characteristicOrNameOrUUID = serviceOrNameOrUUID.characteristics.find(
                        c => c.displayName === nameOrUUID || c.UUID === nameOrUUID,
                    );
                }

                if (
                    !serviceOrNameOrUUID ||
                    !characteristicOrNameOrUUID ||
                    typeof characteristicOrNameOrUUID === 'string'
                ) {
                    return;
                }
                return handler.getAndPollCharacteristic(
                    accessory,
                    serviceOrNameOrUUID,
                    characteristicOrNameOrUUID,
                    isUpdate,
                );
            }
        };
    }

    public registerExistingAccessory(UUID: string, name: string): void {
        this.mapper.mapAccessoryUUID(UUID, name);
    }

    public start(): void {
        if (!this.User || !this.hap || !this.hapStorage || !this.Server || !this.InterceptedBridge) {
            // the original code crashed here with a TypeError, when HAP-NodeJS could not be found in init()
            throw new Error('Homebridge / HAP-NodeJS could not be loaded');
        }
        // The configured insecureAccess is not used here (also not in the original code)
        const insecureAccess = false;
        this.logger.info(`Using Homebridge Config Path: ${this.User.persistPath()}`);
        // Initialize HAP-NodeJS with a custom persist directory
        this.hapStorage.setCustomStoragePath(this.User.persistPath());

        const server = new this.Server.Server(insecureAccess);
        this.server = server;
        server.bridgeService.bridge = new this.InterceptedBridge(
            server.config.bridge.name,
            this.hap.uuid.generate('HomeBridge'),
        );

        server.bridgeService.bridge.on('characteristic-warning' /* CHARACTERISTIC_WARNING */, () => {});
        server.bridgeService.bridge.on('advertised', () => {
            server.setServerStatus('ok');
        });

        // watch for the paired event to update the server status
        server.bridgeService.bridge.on('paired', () => {
            server.setServerStatus(server.serverStatus);
        });

        // watch for the unpaired event to update the server status
        server.bridgeService.bridge.on('unpaired', () => {
            server.setServerStatus(server.serverStatus);
        });

        server.bridgeService.api.on('updatePlatformAccessories', accessories => {
            if (!Array.isArray(accessories)) {
                return;
            }
            accessories.forEach(accessory => {
                const hapAccessory = accessory._associatedHAPAccessory;
                if (!hapAccessory) {
                    return;
                }

                this.miniQueue.addToQueue(accessory.UUID, () =>
                    server.bridgeService.bridge.___wrapperAccessoryLogic(hapAccessory, false, true),
                );
            });
        });

        server.bridgeService.api.on('unregisterPlatformAccessories', accessories => {
            if (!Array.isArray(accessories)) {
                return;
            }
            accessories.forEach(accessory => {
                const hapAccessory = accessory._associatedHAPAccessory;
                if (!hapAccessory) {
                    return;
                }
                this.miniQueue.invalidIdFromQueue(hapAccessory.UUID);
                server.bridgeService.bridge.___wrapperAccessoryRemoveLogic(hapAccessory);
            });
        });

        // NOTE: Homebridge registers the bound original handler for "publishExternalAccessories" already in the
        // BridgeService constructor, so this override is never called. It is kept as in the original code
        // (which additionally called a misspelled `__wrapperAccessoryLogic` here).
        const origHandlePublishExternalAccessories = server.bridgeService.handlePublishExternalAccessories;
        server.bridgeService.handlePublishExternalAccessories = async (accessories: HapAccessory[]): Promise<void> => {
            for (const accessory of accessories) {
                void server.bridgeService.bridge.___wrapperAccessoryLogic(accessory, true);
            }
            return origHandlePublishExternalAccessories.call(server.bridgeService, accessories);
        };

        server.start();
    }

    public end(): void {
        this.ended = true;
        this.miniQueue?.invalidAllInQueue();
        if (this.server) {
            this.server.teardown();
            // Save cached accessories to persist storage.
            this.server.bridgeService?.saveCachedPlatformAccessoriesOnDisk();
        }
    }

    public async setValueForCharId(id: string, value: CharacteristicValue, callback: SetValueCallback): Promise<void> {
        const entry = this.charMap[id];
        if (entry && this.knownAccessories[entry.accessoryUUID]) {
            this.logger.debug(`set value ${value} of char ${entry.ch_name} for ${id}`);
            const accessory = this.knownAccessories[entry.accessoryUUID];
            const service = accessory.services.find(
                s => s.displayName === entry.sr_name && s.UUID === entry.sr_id && s.subtype === entry.sr_subtype,
            );
            if (!service) {
                this.logger.debug(`Service to set id ${id} not existing anymore`);
                callback?.(`Service to set id ${id} not existing anymore`);
                return;
            }
            const characteristic = service.characteristics.find(
                c => c.displayName === entry.ch_name && c.UUID === entry.ch_id,
            );
            if (!characteristic) {
                this.logger.debug(`Characteristic to set id ${id} not existing anymore`);
                callback?.(`Characteristic to set id ${id} not existing anymore`);
                return;
            }
            await characteristic.setValue(value, callback);
            await this.server?.bridgeService.bridge.___pollAccessoryService(accessory, service);
        } else {
            this.logger.debug(`id ${id} not known`);
            callback?.(
                `id ${id} not available for setValue (Accessory exists: ${
                    entry?.accessoryUUID ? this.knownAccessories[entry.accessoryUUID] !== undefined : 'unknown'
                })`,
            );
        }
    }

    private async handleCharValue(
        accessory: HapAccessory,
        serv: HapService,
        char: HapCharacteristic,
        newValue: CharacteristicValue | undefined,
    ): Promise<void> {
        this.logger.debug(`handleCharValue = ${newValue}`);
        this.logger.silly(`characteristic = ${customStringify(char)}`);
        this.logger.silly(`accessory =${customStringify(accessory)}`);

        const sr_id = serv.UUID;
        const sr_idname = this.mapper.mapServiceType(sr_id, serv.displayName);
        const ch_id = char.UUID;
        const ch_idname = this.mapper.mapCharacteristicType(sr_id, ch_id, char.displayName);
        const dev_id = accessory.UUID;
        const dev_idname = this.mapper.mapAccessoryUUID(dev_id, accessory.displayName);
        let value = newValue;

        // if we had a value before and now undefined convert to "null"
        const key = this.pollingKey(accessory, serv, char);
        if (this.characteristicValues[key] !== undefined && value === undefined) {
            value = null;
        }
        if (value !== undefined) {
            await this.config.setState(dev_idname, sr_idname, ch_idname, value);
        }
    }
}
