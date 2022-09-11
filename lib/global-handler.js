/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const path = require('path');
const fs = require('fs');
const inherits = require('util').inherits;

let User;
let hap;
let hapStorage;
//let version;
let Server;
//let Plugin;
//let log;
let Characteristic;
let InterceptedBridge;
let once;

let server;
const charMap = {};

let logger;
let updateState;
let updateDev;
let updateChannel;
let setState;
let mapper;
let ignoreInfoAccessoryServices;
let insecureAccess;
let characteristicPollingInterval;
const characteristicPollingTimeouts = {};
const characteristicPollingList = {};
const characteristicValues = {};
const knownAccessories = {};

function customStringify(v, func, intent) {
    const cache = new Map();
    return JSON.stringify(v, function (key, value) {
        if (typeof value === 'object' && value !== null) {
            if (cache.get(value)) {
                // Circular reference was found, discard key
                return;
            }
            // Store value in our map
            cache.set(value, true);
        }
        return value;
    }, intent);
}

function init(config) {
    logger = config.logger;
    updateState = config.updateState;
    updateDev = config.updateDev;
    updateChannel = config.updateChannel;
    setState = config.setState;
    ignoreInfoAccessoryServices = config.ignoreInfoAccessoryServices;
    insecureAccess = config.insecureAccess;
    characteristicPollingInterval = config.characteristicPollingInterval;

    mapper = require('./mapper')(config);

    User = require(path.join(config.homebridgeBasePath, 'lib', 'user')).User;
    User.setStoragePath(config.homebridgeConfigPath);

    let hapBasePath;

    if (fs.existsSync(path.join(config.homebridgeBasePath, 'node_modules/hap-nodejs/dist'))) {
        hapBasePath = path.join(config.homebridgeBasePath, 'node_modules/hap-nodejs/dist');
    } else if (fs.existsSync(path.join(config.homebridgeBasePath, '../hap-nodejs/dist'))) {
        hapBasePath = path.join(config.homebridgeBasePath, '../hap-nodejs/dist');
    } else {
        try {
            hapBasePath = path.dirname(require.resolve('hap-nodejs', {paths: [path.join(config.homebridgeBasePath, 'node_modules'), config.homebridgeBasePath]}));
            logger.info(`HAP-NodeJS lookup fallback used: ${hapBasePath}`);
        }
        catch (err) {
            console.log(`hap-nodejs resolve path: ${JSON.stringify([path.join(config.homebridgeBasePath, 'node_modules'), config.homebridgeBasePath])}`)
            return;
        }
    }

    hap = require(hapBasePath);
    hapStorage = require(path.join(hapBasePath, 'lib/model/HAPStorage')).HAPStorage;
    //version = require(config.homebridgeBasePath + 'lib/version');
    Server = require(path.join(config.homebridgeBasePath, 'lib/server'));
    //Plugin = require(config.homebridgeBasePath + 'lib/plugin').Plugin;
    //log = require(config.homebridgeBasePath + 'lib/logger')._system;
    once = require(path.join(hapBasePath, 'lib/util/once')).once;
    Characteristic = hap.Characteristic;

    function handleCharacteristicPolling(accessory, serviceOrUUID, characteristicOrUUID) {
        const service = typeof serviceOrUUID === 'string' ? accessory.services.find(s => s.UUID === serviceOrUUID) : serviceOrUUID;
        const characteristic = typeof characteristicOrUUID === 'string' ? service.characteristics.find(c => c.UUID === characteristicOrUUID) : characteristicOrUUID;
        let pollingInterval;
        if (characteristicPollingList && (characteristic.displayName in characteristicPollingList)) {
            pollingInterval = characteristicPollingList[characteristic.displayName];
        } else {
            pollingInterval = characteristicPollingInterval;
        }
        //that.logger.debug('Interval: char=' + characteristic.displayName + ' ; interval= ' + customStringify(pollingInterval));
        if (pollingInterval) {
            const serviceUUID = service.UUID;
            const characteristicUUID = characteristic.UUID;
            const key = `${accessory.UUID}.${serviceUUID}.${characteristicUUID}`;
            //that.logger.debug('POLLING: char=' + characteristic.displayName + ' ; interval= ' + customStringify(pollingInterval));
            if (characteristicPollingTimeouts[key]) {
                clearTimeout(characteristicPollingTimeouts[key]);
            }
            characteristicPollingTimeouts[key] = setTimeout(() => {
                delete characteristicPollingTimeouts[key];
                const service = accessory.services.find(s => s.UUID === serviceUUID);
                const characteristic = service.characteristics.find(c => c.UUID === characteristicUUID);
                if (!characteristic) {
                    //console.log(`Characteristic not found: ${serviceUUID}/${characteristicUUID} in ${accessory.displayName}`);
                    return;
                }
                getAndPollCharacteristic(accessory, service, characteristic, false);
            }, pollingInterval);
        }
    }

    async function getAndPollCharacteristic(accessory, service, characteristic, isUpdate) {
        return new Promise(resolve => characteristic.getValue(async (err, value) => {
            if (!err) {
                const key = `${accessory.UUID}.${service.UUID}.${characteristic.UUID}`;
                if (!characteristicValues[key] || characteristicValues[key].val !== value || isUpdate) {
                    // for accessory updates we should check if we need to repost the value
                    characteristicValues[key] = {
                        val: value,
                        ts: Date.now()
                    };
                    logger.debug(`Char value update from polling: ${characteristicValues[`${accessory.UUID}.${service.UUID}.${characteristic.UUID}`]} --> ${value}`);
                    await handleCharValue(accessory, service, characteristic, value);
                }
            } else {
                value = undefined;
            }
            handleCharacteristicPolling(accessory, service, characteristic);
            resolve(value);
        }));
    }

    async function iterateCharArray(chars, accessory, service, dev_idname, sr_id, sr_idname) {
        for (const channelIndex in chars) {
            if (!chars.hasOwnProperty(channelIndex)) {
                continue;
            }

            const char      = chars[channelIndex];
            const ch_id     = char.UUID;
            const ch_name   = char.displayName;
            const ch_val    = char.value;
            const ch_idname = mapper.mapCharacteristicType(sr_id, ch_id, ch_name);
            const id        = `${dev_idname}.${sr_idname}.${ch_idname}`;

            const common = mapper.mapCharacteristicProperties(char);
            logger.debug(`Mapped Common for ${id}: ${JSON.stringify(common)}`);
            if (common.write) {
                charMap[id] = {
                    ch_id,
                    sr_id,
                    accessory
                };
                logger.silly(`Add object to charmap with id ${id}/${customStringify(char)}`);
            }

            char.on('characteristic-warning', (type, message, stack) =>
                logger.info(`Characteristic warning for ${id}: ${type} ${message} ${stack}`));

            await updateState(dev_idname, sr_idname, ch_idname, ch_name, ch_val, common, ch_id);
            char.getValue(async (err, value) => {
                if (err) {
                    logger.warn(`Error while getting current value: ${err}`);
                    return;
                }
                await handleCharValue(accessory, service, char, value);
            })
            handleCharacteristicPolling(accessory, service, char);
        }
    }

    if (!InterceptedBridge) {
        function MyBridge(displayName, serialNumber) {
            logger.debug(`iobroker.ham Bridge constructor: displayName=${displayName}, UUID=${serialNumber}`);
            // @ts-ignore
            MyBridge.super_.call(this, displayName, serialNumber);

            this._origPublish = this.publish;
            this._origAddBridgedAccessory = this.addBridgedAccessory;

            this.publish = function(info, allowInsecureRequest) {
                logger.debug(`iobroker.ham Bridge publish ${customStringify(info)}`);
                // Calling the method of the parent class
                this._origPublish.call(this, info, allowInsecureRequest);
            };

            this.___wrapperAccessoryLogic = async function(accessory, external, isUpdate) {
                logger.debug(`iobroker.ham Bridge addBridgedAccessory (ext=${external}) ${accessory.UUID}: ${accessory.displayName}`); //OK

                if (knownAccessories[accessory.UUID]) {
                    logger.debug(`Accessory ${accessory.displayName} with ID ${accessory.UUID} already known`);
                    for (const key of Object.keys(characteristicPollingTimeouts)) {
                        // Check if we already know the accessory, if yes remove all polling timeouts because will be re-registered
                        if (key.startsWith(accessory.UUID)) {
                            clearTimeout(characteristicPollingTimeouts[key]);
                            delete characteristicPollingTimeouts[key];
                        }
                    }
                    isUpdate = true;
                }

                if (!isUpdate) {
                    accessory.on('service-characteristic-change', async (data) => {
                        logger.debug(`Char change event: ${data.oldValue} --> ${data.newValue}`);
                        const key = `${accessory.UUID}.${data.service.UUID}.${data.characteristic.UUID}`;
                        const now = Date.now();
                        if (characteristicValues[key] && characteristicValues[key].val === data.newValue && characteristicValues[key].ts > now - 2000) {
                            // Sometimes events are submitted twice, so we ignore them if they are submitted within 2 seconds with same value
                            return;
                        }
                        characteristicValues[key] = {
                            val: data.newValue,
                            ts: now
                        };
                        await handleCharValue(accessory, data.service, data.characteristic, data.newValue);
                    });
                }

                knownAccessories[accessory.UUID] = accessory;

                // New device
                const dev_id = accessory.UUID;
                const dev_idname = mapper.mapAccessoryUUID(dev_id, accessory.displayName);
                const dev_name = accessory.displayName;
                const dev_cat = accessory.category;

                await updateDev(dev_idname, dev_name, dev_cat, dev_id);

                for (const index in accessory.services) {
                    if (!accessory.services.hasOwnProperty(index)) {
                        continue;
                    }

                    const service = accessory.services[index];
                    const sr_id = service.UUID;
                    const sr_idname = mapper.mapServiceType(sr_id, service.displayName);
                    const sr_name = service.displayName;

                    if (ignoreInfoAccessoryServices && sr_idname === 'Accessory-Information') {
                        continue;
                    }

                    logger.silly(`Add service class=${customStringify(service)}`);
                    await updateChannel(dev_idname, sr_idname, sr_name, sr_id);

                    await iterateCharArray(service.characteristics, accessory, service, dev_idname, sr_id, sr_idname);
                }
            };

            this.___wrapperAccessoryRemoveLogic = function(accessory) {
                if (knownAccessories[accessory.UUID] && !knownAccessories[accessory.UUID] === accessory) {
                    logger.debug(`Accessory ${accessory.displayName} with ID ${accessory.UUID} to remove but not the same object as we know`);
                    return;
                }
                if (knownAccessories[accessory.UUID]) {
                    logger.debug(`Delete Accessory ${accessory.displayName} with ID ${accessory.UUID}`);
                    for (const key of Object.keys(characteristicPollingTimeouts)) {
                        // Check if we already know the accessory, if yes remove all polling timeouts because will be re-registered
                        if (key.startsWith(accessory.UUID)) {
                            clearTimeout(characteristicPollingTimeouts[key]);
                            delete characteristicPollingTimeouts[key];
                        }
                    }
                }
                delete knownAccessories[accessory.UUID];
            };

            this.addBridgedAccessory = function (accessory, deferUpdate) {
                logger.debug(`PRE iobroker.ham Bridge addBridgedAccessory ${accessory.UUID}: ${accessory.displayName}`); // OK
                // Calling the method of the parent class
                accessory = this._origAddBridgedAccessory.call(this, accessory, deferUpdate);

                this.___wrapperAccessoryLogic(accessory);
                return accessory;
            };

            this.___pollAccessory = async function ___pollAccessory(accessory, isUpdate) {
                for (const service of accessory.services) {
                    await this.___pollAccessoryService(accessory, service, isUpdate);
                }
            };

            this.___pollAccessoryService = async function ___pollAccessoryService(accessory, serviceOrUUID, isUpdate) {
                if (typeof serviceOrUUID === 'string') {
                    serviceOrUUID = accessory.getServiceByUUID(serviceOrUUID);
                }
                if (!serviceOrUUID) {
                    return;
                }
                for (const characteristic of serviceOrUUID.characteristics) {
                    await getAndPollCharacteristic(accessory, serviceOrUUID, characteristic, isUpdate);
                }
            };

            this.___pollAccessoryServiceCharacteristic = async function ___pollAccessoryServiceCharacteristic(accessory, serviceOrUUID, characteristicOrUUID, isUpdate) {
                if (typeof serviceOrUUID === 'string') {
                    serviceOrUUID = accessory.getServiceByUUID(serviceOrUUID);
                }
                if (serviceOrUUID && typeof characteristicOrUUID === 'string') {
                    characteristicOrUUID = serviceOrUUID.characteristics.find(c => c.UUID === characteristicOrUUID);
                }

                if (!serviceOrUUID || !characteristicOrUUID) {
                    return;
                }
                return getAndPollCharacteristic(accessory, serviceOrUUID, characteristicOrUUID, isUpdate);
            };
        }

        inherits(MyBridge, hap.Bridge);

        InterceptedBridge = MyBridge;
    }
}

function registerExistingAccessory(UUID, name) {
    mapper.mapAccessoryUUID(UUID, name);
}

function start() {
    const insecureAccess = false;
    logger.info(`Using Homebridge Config Path: ${User.persistPath()}`);
    // Initialize HAP-NodeJS with a custom persist directory
    hapStorage.setCustomStoragePath(User.persistPath());

    server = new Server.Server(insecureAccess);
    server.bridgeService.bridge = new InterceptedBridge(server.config.bridge.name, hap.uuid.generate('HomeBridge'));

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

    server.bridgeService.api.on('updatePlatformAccessories', (accessories) => {
        if (!Array.isArray(accessories)) {
            return;
        }
        accessories.forEach(accessory => {
            if (!accessory._associatedHAPAccessory) return;

            server.bridgeService.bridge.___wrapperAccessoryLogic(accessory._associatedHAPAccessory, false, true)
        });
    });

    server.bridgeService.api.on('unregisterPlatformAccessories', (accessories) => {
        if (!Array.isArray(accessories)) {
            return;
        }
        accessories.forEach(accessory => {
            if (!accessory._associatedHAPAccessory) return;
            server.bridgeService.bridge.___wrapperAccessoryRemoveLogic(accessory._associatedHAPAccessory)
        });
    });

    const origHandlePublishExternalAccessories = server.bridgeService.handlePublishExternalAccessories;
    server.bridgeService.handlePublishExternalAccessories = async accessories => {
        for (const accessory of accessories) {
            server.bridgeService.bridge.__wrapperAccessoryLogic(accessory, true);
        }
        return origHandlePublishExternalAccessories.call(server.bridgeService, accessories);
    }

    server.start();
}

async function pollAccessory(accessory, isUpdate) {
    return server.bridgeService.bridge.___pollAccessory(accessory, isUpdate);
}

async function pollAccessoryService(accessory, serviceOrUUID, isUpdate) {
    return server.bridgeService.bridge.___pollAccessoryService(accessory, serviceOrUUID, isUpdate);
}

async function pollAccessoryServiceCharacteristic(accessory, serviceOrUUID, characteristicOrUUID, isUpdate) {
    return server.bridgeService.bridge.___pollAccessoryServiceCharacteristic(accessory, serviceOrUUID, characteristicOrUUID, isUpdate);
}


function end() {
    if (server) {
        server.teardown();
        // Save cached accessories to persist storage.
        server.bridgeService && server.bridgeService.saveCachedPlatformAccessoriesOnDisk();
    }
}

async function setValueForCharId(id, value, callback) {
    if (charMap[id]) {
        logger.debug(`set value ${value} of char ${charMap[id].ch_name} for ${id}`);
        const service = charMap[id].accessory.services.find(s => s.UUID === charMap[id].sr_id);
        const characteristic = service.characteristics.find(c => c.UUID === charMap[id].ch_id);
        if (!characteristic) {
            logger.debug(`Characteristic to set id ${id} not existing anymore`);
            callback && callback(`Characteristic to set id ${id} not existing anymore`);
            return;
        }
        await characteristic.setValue(value, callback);
        await pollAccessoryService(charMap[id].accessory, service);
    }
    else {
        logger.debug(`id ${id} not known`);
        callback && callback(`id ${id} not known on setValue`);
    }
}

async function handleCharValue(accessory, serv, char, newValue){
    logger.debug(`handleCharValue = ${newValue}`);
    logger.silly(`characteristic = ${customStringify(char)}`);
    logger.silly(`accessory =${customStringify(accessory)}`);

    const sr_id      = serv.UUID;
    const sr_idname  = mapper.mapServiceType(sr_id, serv.displayName);
    const ch_id      = char.UUID;
    const ch_idname  = mapper.mapCharacteristicType(sr_id, ch_id, char.displayName);
    const dev_id     = accessory.UUID;
    const dev_idname = mapper.mapAccessoryUUID(dev_id, accessory.displayName);
    let value      = newValue;

    // if we had a value before and now undefined convert to "null"
    if (characteristicValues[`${accessory.UUID}.${serv.UUID}.${char.UUID}`] !== undefined && value === undefined) {
        value = null;
    }
    if (value !== undefined) {
        await setState(dev_idname, sr_idname, ch_idname, value);
    }
}

exports.init = init;
exports.end = end;
exports.setValueForCharId = setValueForCharId;
exports.start = start;
exports.registerExistingAccessory = registerExistingAccessory;
