/* jshint strict: false */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const HomebridgeWrapper = require('homebridge-plugin-wrapper').Wrapper;
const miniQueue = require('./miniqueue.js');

let homebridgeWrapper;
const charMap = {};
const knownAccessories = {};
let ended = false;

let logger;
let updateState;
let updateDev;
let updateChannel;
let setState;
let mapper;
let ignoreInfoAccessoryServices;

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
    logger        = config.logger;
    updateState   = config.updateState;
    updateDev     = config.updateDev;
    updateChannel = config.updateChannel;
    setState      = config.setState;
    ignoreInfoAccessoryServices = config.ignoreInfoAccessoryServices;

    mapper = require('./mapper')(config);
    homebridgeWrapper = new HomebridgeWrapper(config);

    homebridgeWrapper.on('characteristic-value-change', async data => {
        logger.info(`Char change event: ${data.oldValue} --> ${data.newValue}`);
        let value = data.newValue;

        // if we had a value before and now undefined convert to "null"
        if (data.oldValue !== undefined && data.newValue === undefined) {
            value = null;
        }
        await handleCharValue(data.accessory, data.service, data.characteristic, value);
    });

    async function accessoryLogic(accessory, external, isUpdate) {
        async function iterateCharArray(chars, dev_idname, sr_id, sr_idname, accessory, sr_name, sr_subtype) {
            for (const chIndex in chars) {
                if (ended) return;
                if (!chars.hasOwnProperty(chIndex)) continue;
                const char = chars[chIndex];
                const ch_id = char.UUID;
                const ch_name = char.displayName;
                const ch_val = char.value;
                const ch_idname = mapper.mapCharacteristicType(sr_id, ch_id, ch_name);
                const id = `${dev_idname}.${sr_idname}.${ch_idname}`;

                const common = mapper.mapCharacteristicProperties(char);
                logger.debug(`Mapped Common for ${id}: ${JSON.stringify(common)}`);
                //console.log(`DEBUG: Register details for ${id}: writeable=${common.write}, #listeners=${char.listeners('set').length} and sr_subtype=${sr_subtype}`);
                if (common.write) {
                    charMap[id] = {
                        ch_id,
                        ch_name,
                        sr_id,
                        sr_name,
                        sr_subtype,
                        accessoryUUID: accessory.UUID
                    };
                    logger.silly(`Add object to charmap with id ${id}/${customStringify(char)}`);
                }
                char.on('characteristic-warning', (type, message, stack) => {
                    logger.info(`Characteristic warning for ${id}: ${type} ${message} ${stack}`);
                });

                await updateState(dev_idname, sr_idname, ch_idname, ch_name, ch_val, common, ch_id);
            }
        }

        //logger.debug('iobroker.ham Bridge addBridgedAccessory ' + customStringify(accessory)); //OK
        logger.info(`iobroker.ham Bridge ${isUpdate ? 'updateBridgedAccessory' : 'addBridgedAccessory'} (ext=${external}) ${accessory.UUID}: ${accessory.displayName}`); //OK
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
            if (ended) return;

            const service = accessory.services[index];
            const sr_id = service.UUID;
            const sr_idname = mapper.mapServiceType(sr_id, service.displayName);
            const sr_name = service.displayName;

            if (ignoreInfoAccessoryServices && sr_idname === 'Accessory-Information') {
                continue;
            }

            logger.debug(`Add service class=${customStringify(service)}`);
            await updateChannel(dev_idname, sr_idname, sr_name, sr_id);

            await iterateCharArray(service.characteristics, dev_idname, sr_id, sr_idname, accessory, sr_name, service.subtype);
        }
    }

    homebridgeWrapper.on('addAccessory', accessory => {
        miniQueue.addToQueue(accessory.UUID, async () => accessoryLogic(accessory, false));
    });

    homebridgeWrapper.on('updateAccessory', accessory => {
        miniQueue.addToQueue(accessory.UUID, async () => accessoryLogic(accessory, false, true));
    });

    homebridgeWrapper.on('addExternalAccessory', accessory => {
        miniQueue.addToQueue(accessory.UUID, async () => accessoryLogic(accessory, true));
    });

    homebridgeWrapper.on('removeAccessory', accessory => {
        miniQueue.invalidIdFromQueue(accessory.UUID);
        delete knownAccessories[accessory.UUID];
        logger.info(`Accessory ${accessory.displayName} was removed ... please delete objects manually if needed`)
    });
}

function registerExistingAccessory(UUID, name) {
    mapper.mapAccessoryUUID(UUID, name);
}

function start() {
    homebridgeWrapper.init();
}

function end() {
    ended = true;
    miniQueue.invalidAllInQueue();
    homebridgeWrapper.finish();
}

async function setValueForCharId(id, value, callback) {
    if (charMap[id] && knownAccessories[charMap[id].accessoryUUID]) {
        logger.debug(`set value ${value} of char ${charMap[id].ch_name} for ${id}`);
        const service = knownAccessories[charMap[id].accessoryUUID].services.find(s => s.displayName === charMap[id].sr_name && s.UUID === charMap[id].sr_id && s.subtype=== charMap[id].sr_subtype);
        const characteristic = service.characteristics.find(c => c.displayName === charMap[id].ch_name && c.UUID === charMap[id].ch_id);
        if (!characteristic) {
            logger.debug(`Characteristic to set id ${id} not existing anymore`);
            callback && callback(`Characteristic to set id ${id} not existing anymore`);
            return
        }
        await characteristic.setValue(value, callback);
        homebridgeWrapper.pollAccessoryService(knownAccessories[charMap[id].accessoryUUID], service);
    }
    else {
        logger.debug(`id ${id} not known`);
        callback && callback(`id ${id} not available for setValue (Accessory exists: ${knownAccessories[charMap[id].accessoryUUID] !== undefined})`);
    }
}

async function handleCharValue(accessory, serv, char, newValue) {
    const sr_id      = serv.UUID;
    const sr_idname  = mapper.mapServiceType(sr_id, serv.displayName);
    const ch_id      = char.UUID;
    const ch_idname  = mapper.mapCharacteristicType(sr_id, ch_id, char.displayName);
    const dev_id     = accessory.UUID;
    const dev_idname = mapper.mapAccessoryUUID(dev_id, accessory.displayName);
    const value      = newValue;

    logger.debug(`handleCharValue = ${newValue}`);
    logger.silly(`characteristic = ${customStringify(char)}`);
    logger.silly(`accessory =${customStringify(accessory)}`);

    if (ignoreInfoAccessoryServices && sr_idname === 'Accessory-Information') {
        return;
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
