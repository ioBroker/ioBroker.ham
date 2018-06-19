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

function init(config) {
    logger        = config.logger;
    updateState   = config.updateState;
    updateDev     = config.updateDev;
    updateChannel = config.updateChannel;
    setState      = config.setState;

    mapper = require('./mapper')(config);
    homebridgeWrapper = new HomebridgeWrapper(config);

    homebridgeWrapper.on('characteristic-value-change', data => {
        logger.info('Char change event: ' + data.oldValue + ' --> ' + data.newValue);
        handleCharValue(data.accessory, data.service, data.characteristic, data.newValue);
    });

    homebridgeWrapper.on('addAccessory', accessory => {
        function iterateCharArray(chars, dev_idname, sr_id, sr_idname) {
            for (const chindex in chars) {
                if (!chars.hasOwnProperty(chindex)) continue;
                const char = chars[chindex];
                const ch_id = char.UUID;
                const ch_name = char.displayName;
                const ch_val = char.value;
                const ch_idname = mapper.mapCharacteristicType(sr_id, ch_id, ch_name);
                const id = dev_idname + '.' + sr_idname + '.' + ch_idname;

                const common = mapper.mapCharacteristicProperties(char);
                logger.debug('Mapped Common for ' + id + ': ' + JSON.stringify(common));
                if (common.write) {
                    charMap[id] = char; // TODO only if write allowed!
                    logger.debug('Add object to charmap with id ' + id + '/' + JSON.stringify(char));
                }

                updateState(dev_idname, sr_idname, ch_idname, ch_name, ch_val, common, ch_id);
            }
        }

        logger.debug('iobroker.ham Bridge addBridgedAccessory ' + JSON.stringify(accessory)); //OK
        // Новое устройство
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

            logger.debug('Add service class=' + JSON.stringify(service));
            updateChannel(dev_idname, sr_idname, sr_name, sr_id);

            iterateCharArray(service.characteristics, dev_idname, sr_id, sr_idname);
            if (service.optionalCharacteristics) {
                iterateCharArray(service.optionalCharacteristics, dev_idname, sr_id, sr_idname);
            }
        }

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

function setValueForCharId(id, value) {
    if (charMap[id]) {
        logger.info('set value ' + value + ' of char for ' + id);
        charMap[id].setValue(value);
    }
}

function handleCharValue(accessory, serv, char, newValue){
    logger.debug('handleCharValue = ' + newValue);
    logger.debug('characteristic = ' + JSON.stringify(char));
    logger.debug('accessory =' + JSON.stringify(accessory));

    const sr_id      = serv.UUID;
    const sr_idname  = mapper.mapServiceType(sr_id, serv.displayName);
    const ch_id      = char.UUID;
    const ch_idname  = mapper.mapCharacteristicType(sr_id, ch_id, char.displayName);
    const dev_id     = accessory.UUID;
    const dev_idname = mapper.mapAccessoryUUID(dev_id, accessory.displayName);
    const value      = newValue;

    setState(dev_idname, sr_idname, ch_idname, value);
}

exports.init = init;
exports.end = end;
exports.setValueForCharId = setValueForCharId;
exports.start = start;
exports.registerExistingAccessory = registerExistingAccessory;
