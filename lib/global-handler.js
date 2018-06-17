/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const inherits = require('util').inherits;

let User;
let hap;
//let version;
let Server;
//let Plugin;
//let log;

let server;
const charMap = {};

let logger;
let updateState;
let updateDev;
let updateChannel;
let setState;
let mapper;

function init(config) {
    logger = config.logger;
    updateState = config.updateState;
    updateDev = config.updateDev;
    updateChannel = config.updateChannel;
    setState = config.setState;

    mapper = require('./mapper')(config);

    User = require(config.homebridgeBasePath + 'lib/user').User;
    User.setStoragePath(config.homebridgeConfigPath);
    hap = require(config.homebridgeBasePath + 'node_modules/hap-nodejs');
    //version = require(config.homebridgeBasePath + 'lib/version');
    Server = require(config.homebridgeBasePath + 'lib/server').Server;
    //Plugin = require(config.homebridgeBasePath + 'lib/plugin').Plugin;
    //log = require(config.homebridgeBasePath + 'lib/logger')._system;

    inherits(MyBridge, hap.Bridge);

    override(MyBridge, function publish(info, allowInsecureRequest) {
        logger.info('iobroker.ham Bridge publish ' + JSON.stringify(info));
        // Вызов метода родительского класса
        // Calling the method of the parent class
        publish.inherited.call(this, info, allowInsecureRequest);
    });

    /*
    // Переопределение метода в дочернем классе
    // Overriding a method in a child class
    override(MyBridge, function addService(service) {
        // Собственный функционал
        // Own Functionality
        logger.info('iobroker.ham Bridge addService '+JSON.stringify(service)); //OK, undefined
        // Вызов метода родительского класса
        // Calling the method of the parent class
        return addService.inherited.call(this, service);
    });
    */
    function iterateCharArray(chars, parent, accessory, service, dev_idname, sr_id, sr_idname) {
        for (const channelIndex in chars) {
            if (!chars.hasOwnProperty(channelIndex)) continue;

            const char      = chars[channelIndex];
            const ch_id     = char.UUID;
            const ch_name   = char.displayName;
            const ch_val    = char.value;
            const ch_idname = mapper.mapCharacteristicType(sr_id, ch_id, ch_name);
            const id        = dev_idname + '.' + sr_idname + '.' + ch_idname;

            const common = mapper.mapCharacteristicProperties(char);
            logger.debug('Mapped Common for ' + id + ': ' + JSON.stringify(common));
            if (common.write) {
                charMap[id] = char; // TODO only if write allowed!
                logger.debug('Add object to charmap with id ' + id + '/' + JSON.stringify(char));
            }

            char.on('change', data => {
                logger.info('Char change event: ' + data.oldValue + ' --> ' + data.newValue);
                handleCharValue(accessory, service, parent, data.newValue);
            });

            updateState(dev_idname, sr_idname, ch_idname, ch_name, ch_val, common, ch_id, () => {
                char.getValue((err, value) => {
                    if (err) {
                        logger.warn('Error while getting current value: ' + err);
                        return;
                    }
                    handleCharValue(accessory, service, char, value);
                })
            });
        }
    }

    override(MyBridge, function addBridgedAccessory(accessory, deferUpdate) {
        // Вызов метода родительского класса
        // Calling the method of the parent class
        accessory = addBridgedAccessory.inherited.call(this, accessory, deferUpdate);
        logger.debug('iobroker.ham Bridge addBridgedAccessory ' + JSON.stringify(accessory)); //OK
        // Новое устройство
        // New device
        const dev_id     = accessory.UUID;
        const dev_idname = mapper.mapAccessoryUUID(dev_id, accessory.displayName);
        const dev_name   = accessory.displayName;
        const dev_cat    = accessory.category;

        updateDev(dev_idname, dev_name, dev_cat, dev_id);

        for (const index in accessory.services) {
            if (!accessory.services.hasOwnProperty(index)) continue;

            const service   = accessory.services[index];
            const sr_id     = service.UUID;
            const sr_idname = mapper.mapServiceType(sr_id, service.displayName);
            const sr_name   = service.displayName;

            logger.debug('Add service class=' + JSON.stringify(service));
            updateChannel(dev_idname, sr_idname, sr_name, sr_id);

            iterateCharArray(service.characteristics, this, accessory, service, dev_idname, sr_id, sr_idname);
            if (service.optionalCharacteristics) {
                iterateCharArray(service.optionalCharacteristics, this, accessory, service, dev_idname, sr_id, sr_idname);
            }

        }
        return accessory;
    });

    /*
    override(MyBridge, function addBridgedAccessories(accessories) {
        logger.info('iobroker.ham Bridge addBridgedAccessories'+JSON.stringify(accessories));
        // Вызов метода родительского класса
        // Calling the method of the parent class
        const result = addBridgedAccessories.inherited.call(this, accessories);
        return result;
    });
    */

    Server.prototype._createBridge = function() {
        logger.debug('iobroker.ham Bridge create'); //OK
        // pull out our custom Bridge settings from config.json, if any
        const bridgeConfig = this._config.bridge || {};

        // Create our Bridge which will host all loaded Accessories
        return new MyBridge(bridgeConfig.name || 'Homebridge', hap.uuid.generate('HomeBridge'));
    };

    function MyBridge(displayName, serialNumber) {
        logger.debug('iobroker.ham Bridge constructor');
        MyBridge.super_.call(this, displayName, serialNumber);
    }
}

function registerExistingAccessory(UUID, name) {
    mapper.mapAccessoryUUID(UUID, name);
}

function start() {
    const insecureAccess = false;
    logger.info('Using Homebridge Config Path: ' + User.persistPath());
    // Initialize HAP-NodeJS with a custom persist directory
    hap.init(User.persistPath());

    server = new Server(insecureAccess);

    server.run();
}

function end() {
    if (server) {
        server._teardown();
        // Save cached accessories to persist storage.
        server._updateCachedAccessories();
    }
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

    const sr_id      = serv.UUID;
    const sr_idname  = mapper.mapServiceType(sr_id, serv.displayName);
    const ch_id      = char.UUID;
    const ch_idname  = mapper.mapCharacteristicType(sr_id, ch_id, char.displayName);
    const dev_id     = accessory.UUID;
    const dev_idname = mapper.mapAccessoryUUID(dev_id, accessory.displayName);
    const value      = newValue;

    setState(dev_idname, sr_idname, ch_idname, value);
}

// Средство для переопределения функций
// Tools for overriding functions
function override(child, fn) {
    child.prototype[fn.name] = fn;
    fn.inherited = child.super_.prototype[fn.name];
}

/*
function overrideM(object, methodName, callback) {
    object[methodName] = callback(object[methodName]);
}

function after(extraBehavior) {
    return function(original) {
        return function() {
            const returnValue = original.apply(this, arguments);
            extraBehavior.apply(this, arguments);
            return returnValue;
        };
    };
}
*/

/*
function handleRegisterPlatformAccessories(accessories) {
    logger.info('handleRegisterPlatformAccessories');
    // const hapAccessories = [];
    for (const index in accessories) {
        const accessory = accessories[index];
        logger.info('accessory='+JSON.stringify(accessory));
        // accessory._prepareAssociatedHAPAccessory();
        // hapAccessories.push(accessory._associatedHAPAccessory);

        //   this._cachedPlatformAccessories.push(accessory);
    }
    //
    // this._bridge.addBridgedAccessories(hapAccessories);
    // this._updateCachedAccessories();
}
*/
/*
function handleUpdatePlatformAccessories(accessories) {
    // Update persisted accessories
    // this._updateCachedAccessories();
    logger.info('handleUpdatePlatformAccessories');
}
*/
/*
function handleUnregisterPlatformAccessories(accessories) {
    logger.info('handleUnregisterPlatformAccessories');
  // const hapAccessories = [];
  // for (const index in accessories) {
  //   const accessory = accessories[index];

  //   if (accessory._associatedHAPAccessory) {
  //     hapAccessories.push(accessory._associatedHAPAccessory);
  //   }

  //   for (const targetIndex in this._cachedPlatformAccessories) {
  //     const existing = this._cachedPlatformAccessories[targetIndex];
  //     if (existing.UUID === accessory.UUID) {
  //       this._cachedPlatformAccessories.splice(targetIndex, 1);
  //       break;
  //     }
  //   }
  // }

  // this._bridge.removeBridgedAccessories(hapAccessories);
  // this._updateCachedAccessories();
}
*/
/*
function handlePublishCameraAccessories(accessories) {
    logger.info('handlePublishCameraAccessories');
  // const accessoryPin = (this._config.bridge || {}).pin || "031-45-154";

  // for (const index in accessories) {
  //   const accessory = accessories[index];

  //   accessory._prepareAssociatedHAPAccessory();
  //   const hapAccessory = accessory._associatedHAPAccessory;
  //   const advertiseAddress = mac.generate(accessory.UUID);

  //   if (this._publishedCameras[advertiseAddress]) {
  //     throw new Error("Camera accessory " + accessory.displayName + " experienced an address collision.");
  //   } else {
  //     this._publishedCameras[advertiseAddress] = accessory;
  //   }

  //   (function(name){
  //     hapAccessory.on('listening', function(port) {

  //         log.info("%s is running on port %s.", name, port);
  //     })
  //   })(accessory.displayName);

  //   hapAccessory.publish({
  //     username: advertiseAddress,
  //     pincode: accessoryPin,
  //     category: accessory.category
  //   }, this._allowInsecureAccess);
  // }
}
*/
/*
function handleCharacteristicChange(change, accessory){
    logger.info('handleCharacteristicChange');
    logger.info('change = '+JSON.stringify(change) + ' accessory =' + JSON.stringify(accessory));
    const st_id = change.characteristic.UUID,
        ch_id = change.service.UUID,
        dev_id = accessory.UUID,
        value = change.newValue;
    setState(dev_id, ch_id, st_id, value);
}
*/
/*
function handleSetCharacteristics(data, events, callback, remote, connectionID) {
    logger.info('handleSetCharacteristics = '+JSON.stringify(data) + ' events = '+JSON.stringify(events));
}
*/
/*
function handleCharChange(change){
    logger.info('handleCharChange = '+JSON.stringify(change));
}
*/
/*
function handleCharSet(newValue, callback, context, connectionID) {
    logger.info('handleCharSet = '+newValue);
}
*/


exports.init = init;
exports.end = end;
exports.setValueForCharId = setValueForCharId;
exports.start = start;
exports.registerExistingAccessory = registerExistingAccessory;
