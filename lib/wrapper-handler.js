/* jshint -W097 */
// jshint strict:false
/*jslint node: true */
/*jslint esversion: 6 */
var HomebridgeWrapper = require('homebridge-plugin-wrapper').Wrapper;

var homebridgeWrapper;
var charMap = {};

var logger;
var updateState;
var updateDev;
var updateChannel;
var setState;


function init(config) {
    logger = config.logger;
    updateState = config.updateState;
    updateDev = config.updateDev;
    updateChannel = config.updateChannel;
    setState = config.setState;

    mapper = require('./mapper')(config);
    homebridgeWrapper = new HomebridgeWrapper(config);

    homebridgeWrapper.on('characteristic-value-change', function(data) {
        logger.info('Char change event: ' + data.oldValue + ' --> ' + data.newValue);
        handleCharValue(data.accessory, data.service, data.characteristic, data.newValue);
    });

    homebridgeWrapper.on('addAccessory', function(accessory) {
        logger.debug('iobroker.ham Bridge addBridgedAccessory '+JSON.stringify(accessory)); //OK
        // Новое устройство
        // New device
        var dev_id = accessory.UUID,
            dev_idname = mapper.mapAccessoryUUID(dev_id, accessory.displayName),
            dev_name = accessory.displayName,
            dev_cat = accessory.category;

        updateDev(dev_idname, dev_name, dev_cat, dev_id);
        for (var index in accessory.services) {
            var service = accessory.services[index],
                sr_id = service.UUID,
                sr_idname = mapper.mapServiceType(sr_id, service.displayName),
                sr_name = service.displayName;
            logger.debug('Add service class=' + JSON.stringify(service));
            updateChannel(dev_idname, sr_idname, sr_name, sr_id);

            function iterateCharArray(chars) {
                for (var chindex in chars) {
                    var char = chars[chindex],
                        ch_id = char.UUID,
                        ch_name = char.displayName,
                        ch_val = char.value,
                        ch_idname = mapper.mapCharacteristicType(sr_id, ch_id, ch_name),
                        id = dev_idname+'.'+sr_idname+'.'+ch_idname;

                    var common = mapper.mapCharacteristicProperties(char);
                    logger.debug('Mapped Common for ' + id + ': ' + JSON.stringify(common));
                    if (common.write) {
                        charMap[id] = char; // TODO only if write allowed!
                        logger.debug('Add object to charmap with id ' + id + '/' + JSON.stringify(char));
                    }

                    updateState(dev_idname, sr_idname, ch_idname, ch_name, ch_val, common, ch_id);
                }
            }

            iterateCharArray(service.characteristics);
            if (service.optionalCharacteristics) iterateCharArray(service.optionalCharacteristics);
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
        logger.info('set value of char for ' + id);
        charMap[id].setValue(value);
    }
}

function handleCharValue(accessory, serv, char, newValue){
    logger.debug('handleCharValue = ' + newValue);
    logger.debug('characteristic = ' + JSON.stringify(char));
    logger.debug('accessory =' + JSON.stringify(accessory));
    var sr_id = serv.UUID,
        sr_idname = mapper.mapServiceType(sr_id, serv.displayName),
        ch_id = char.UUID,
        ch_idname = mapper.mapCharacteristicType(sr_id, ch_id, char.displayName),
        dev_id = accessory.UUID,
        dev_idname = mapper.mapAccessoryUUID(dev_id, accessory.displayName),
        value = newValue;
    setState(dev_idname, sr_idname, ch_idname, value);
}

exports.init = init;
exports.end = end;
exports.setValueForCharId = setValueForCharId;
exports.start = start;
exports.registerExistingAccessory = registerExistingAccessory;
