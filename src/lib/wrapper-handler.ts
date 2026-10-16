import { Wrapper as HomebridgeWrapper } from 'homebridge-plugin-wrapper';
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
    ServiceCharacteristicChange,
    SetValueCallback,
} from './types';

type CharacteristicChangeEvent = ServiceCharacteristicChange & { accessory: HapAccessory };

/**
 * Wrapper mode: runs the Homebridge plugins via homebridge-plugin-wrapper inside the adapter process,
 * no bridge is published to HomeKit.
 */
export class WrapperHandler implements HomebridgeHandler {
    private homebridgeWrapper: HomebridgeWrapper | null = null;
    private readonly charMap: Record<string, CharMapEntry> = {};
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
        const { timers: _timers, ...wrapperOptions } = config;
        this.homebridgeWrapper = new HomebridgeWrapper({
            ...wrapperOptions,
            wrapperConfig: config.wrapperConfig || {},
        });

        this.homebridgeWrapper.on('characteristic-value-change', async (data: CharacteristicChangeEvent) => {
            this.logger.info(`Char change event: ${data.oldValue} --> ${data.newValue}`);
            let value = data.newValue;

            // if we had a value before and now undefined convert to "null"
            if (data.oldValue !== undefined && data.newValue === undefined) {
                value = null;
            }
            await this.handleCharValue(data.accessory, data.service, data.characteristic, value);
        });

        this.homebridgeWrapper.on('addAccessory', (accessory: HapAccessory) => {
            this.miniQueue.addToQueue(accessory.UUID, () => this.accessoryLogic(accessory, false));
        });

        this.homebridgeWrapper.on('updateAccessory', (accessory: HapAccessory) => {
            this.miniQueue.addToQueue(accessory.UUID, () => this.accessoryLogic(accessory, false, true));
        });

        this.homebridgeWrapper.on('addExternalAccessory', (accessory: HapAccessory) => {
            this.miniQueue.addToQueue(accessory.UUID, () => this.accessoryLogic(accessory, true));
        });

        this.homebridgeWrapper.on('removeAccessory', (accessory: HapAccessory) => {
            this.miniQueue.invalidIdFromQueue(accessory.UUID);
            delete this.knownAccessories[accessory.UUID];
            this.logger.info(
                `Accessory ${accessory.displayName} was removed ... please delete objects manually if needed`,
            );
        });
    }

    private async iterateCharArray(
        chars: HapCharacteristic[],
        dev_idname: string,
        sr_id: string,
        sr_idname: string,
        accessory: HapAccessory,
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
            char.on('characteristic-warning', (type, message, stack) => {
                this.logger.info(`Characteristic warning for ${id}: ${type} ${message} ${stack}`);
            });

            await this.config.updateState(dev_idname, sr_idname, ch_idname, ch_name, ch_val, common, ch_id);
        }
    }

    private async accessoryLogic(accessory: HapAccessory, external: boolean, isUpdate?: boolean): Promise<void> {
        this.logger.info(
            `iobroker.ham Bridge ${isUpdate ? 'updateBridgedAccessory' : 'addBridgedAccessory'} (ext=${external}) ${accessory.UUID}: ${accessory.displayName}`,
        );
        this.knownAccessories[accessory.UUID] = accessory;
        // New device
        const dev_id = accessory.UUID;
        const dev_idname = this.mapper.mapAccessoryUUID(dev_id, accessory.displayName);
        const dev_name = accessory.displayName;
        const dev_cat = accessory.category;

        await this.config.updateDev(dev_idname, dev_name, dev_cat, dev_id);
        for (const service of accessory.services) {
            if (this.ended) {
                return;
            }

            const sr_id = service.UUID;
            const sr_idname = this.mapper.mapServiceType(sr_id, service.displayName);
            const sr_name = service.displayName;

            if (this.config.ignoreInfoAccessoryServices && sr_idname === 'Accessory-Information') {
                continue;
            }

            this.logger.debug(`Add service class=${customStringify(service)}`);
            await this.config.updateChannel(dev_idname, sr_idname, sr_name, sr_id);

            await this.iterateCharArray(
                service.characteristics,
                dev_idname,
                sr_id,
                sr_idname,
                accessory,
                sr_name,
                service.subtype,
            );
        }
    }

    public registerExistingAccessory(UUID: string, name: string): void {
        this.mapper.mapAccessoryUUID(UUID, name);
    }

    public start(): void {
        this.homebridgeWrapper?.init();
    }

    public end(): void {
        this.ended = true;
        this.miniQueue?.invalidAllInQueue();
        this.homebridgeWrapper?.finish();
    }

    public async setValueForCharId(id: string, value: CharacteristicValue, callback: SetValueCallback): Promise<void> {
        const entry = this.charMap[id];
        if (entry?.accessoryUUID && this.knownAccessories[entry.accessoryUUID]) {
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
            void this.homebridgeWrapper?.pollAccessoryService(accessory, service);
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
        const sr_id = serv.UUID;
        const sr_idname = this.mapper.mapServiceType(sr_id, serv.displayName);
        const ch_id = char.UUID;
        const ch_idname = this.mapper.mapCharacteristicType(sr_id, ch_id, char.displayName);
        const dev_id = accessory.UUID;
        const dev_idname = this.mapper.mapAccessoryUUID(dev_id, accessory.displayName);
        const value = newValue;

        this.logger.debug(`handleCharValue = ${newValue}`);
        this.logger.silly(`characteristic = ${customStringify(char)}`);
        this.logger.silly(`accessory =${customStringify(accessory)}`);

        if (this.config.ignoreInfoAccessoryServices && sr_idname === 'Accessory-Information') {
            return;
        }

        if (value !== undefined) {
            await this.config.setState(dev_idname, sr_idname, ch_idname, value);
        }
    }
}
