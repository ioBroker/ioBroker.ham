/* jshint strict: false */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const HomebridgeWrapper = require('homebridge-plugin-wrapper').Wrapper;

let homebridgeWrapper;
const charMap = {};

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
                // Circular reference found, discard key
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

    homebridgeWrapper.on('characteristic-value-change', data => {
        logger.debug(`Char change event: ${data.oldValue} --> ${data.newValue}`);
        let value = data.newValue;

        // if we had a value before and now undefined convert to "null"
        if (data.oldValue !== undefined && data.newValue === undefined) {
            value = null;
        }
        handleCharValue(data.accessory, data.service, data.characteristic, value);
    });

    function accessoryLogic(accessory, external) {
        function iterateCharArray(chars, dev_idname, sr_id, sr_idname) {
            for (const chindex in chars) {
                if (!chars.hasOwnProperty(chindex)) continue;
                const char = chars[chindex];
                const ch_id = char.UUID;
                const ch_name = char.displayName;
                const ch_val = char.value;
                const ch_idname = mapper.mapCharacteristicType(sr_id, ch_id, ch_name);
                const id = `${dev_idname}.${sr_idname}.${ch_idname}`;

                const common = mapper.mapCharacteristicProperties(char);
                logger.debug(`Mapped Common for ${id}: ${JSON.stringify(common)}`);
                if (common.write) {
                    charMap[id] = char; // TODO only if write allowed!
                    logger.silly(`Add object to charmap with id ${id}/${customStringify(char)}`);
                }
                char.on('characteristic-warning', (type, message, stack) => {
                    logger.info(`Characteristic warning for ${id}: ${type} ${message} ${stack}`);
                });

                updateState(dev_idname, sr_idname, ch_idname, ch_name, ch_val, common, ch_id);
            }
        }

        //logger.debug('iobroker.ham Bridge addBridgedAccessory ' + customStringify(accessory)); //OK
        logger.debug(`iobroker.ham Bridge addBridgedAccessory (ext=${external}) ${accessory.UUID}: ${accessory.displayName} from plugin ${accessory._associatedPlugin}`); //OK
        // New device
        const dev_id = accessory.UUID;
        const dev_idname = mapper.mapAccessoryUUID(dev_id, accessory.displayName);
        const dev_name = accessory.displayName;
        const dev_cat = accessory.category;

        updateDev(dev_idname, dev_name, dev_cat, dev_id);
        for (const index in accessory.services) {
            if (!accessory.services.hasOwnProperty(index)) continue;

            const service = accessory.services[index];
            const sr_id = service.UUID;
            const sr_idname = mapper.mapServiceType(sr_id, service.displayName);
            const sr_name = service.displayName;

            if (ignoreInfoAccessoryServices && sr_idname === 'Accessory-Information') {
                continue;
            }

            logger.silly(`Add service class=${customStringify(service)}`);
            updateChannel(dev_idname, sr_idname, sr_name, sr_id);

            iterateCharArray(service.characteristics, dev_idname, sr_id, sr_idname);
            if (service.optionalCharacteristics) {
                iterateCharArray(service.optionalCharacteristics, dev_idname, sr_id, sr_idname);
            }
        }
    }

    homebridgeWrapper.on('addAccessory', accessory => {
        accessoryLogic(accessory);
    });
    homebridgeWrapper.on('addExternalAccessory', accessory => {
        accessoryLogic(accessory, true);
    });
}

function registerExistingAccessory(UUID, name) {
    mapper.mapAccessoryUUID(UUID, name);
}

function start() {
    homebridgeWrapper.init();
}

function end() {
    homebridgeWrapper.finish();
}

function setValueForCharId(id, value, callback) {
    if (charMap[id]) {
        logger.debug(`set value ${value} of char for ${id}`);
        charMap[id].setValue(value, callback);
    }
    else {
        logger.debug(`id ${id} not known`);
        callback && callback(`id ${id} not known on setValue`);
    }
}

function handleCharValue(accessory, serv, char, newValue){
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
        setState(dev_idname, sr_idname, ch_idname, value);
    }
}

exports.init = init;
exports.end = end;
exports.setValueForCharId = setValueForCharId;
exports.start = start;
exports.registerExistingAccessory = registerExistingAccessory;
