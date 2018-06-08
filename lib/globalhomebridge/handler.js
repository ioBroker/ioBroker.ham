/* jshint -W097 */
// jshint strict:false
/*jslint node: true */
/*jslint esversion: 6 */

var inherits = require('util').inherits;

var User;
var hap;
//var version;
var Server;
//var Plugin;
//var log;

var server;
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

    mapper = require('../mapper')(config);

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

    override(MyBridge, function addBridgedAccessory(accessory, deferUpdate) {
        // Вызов метода родительского класса
        // Calling the method of the parent class
        accessory = addBridgedAccessory.inherited.call(this, accessory, deferUpdate);
        logger.debug('iobroker.ham Bridge addBridgedAccessory '+JSON.stringify(accessory)); //OK
        // Новое устройство
        // New device
        var dev_id = accessory.UUID,
            dev_name = accessory.displayName,
            dev_cat = accessory.category;

        updateDev(dev_id, dev_name, dev_cat);
        for (var index in accessory.services) {
            var service = accessory.services[index],
                sr_id = service.UUID,
                sr_idname = mapper.mapServiceType(sr_id),
                sr_name = service.displayName;
            logger.debug('Add service class=' + JSON.stringify(service));
            updateChannel(dev_id, sr_idname, sr_name);

            function iterateCharArray(chars) {
                for (var chindex in chars) {
                    var char = chars[chindex],
                        ch_id = char.UUID,
                        ch_name = char.displayName,
                        ch_val = char.value,
                        ch_idname = mapper.mapCharacteristicType(ch_id),
                        id = dev_id+'.'+sr_idname+'.'+ch_idname;

                    var common = mapper.mapCharacteristicProperties(char);
                    logger.debug('Mapped Common for ' + id + ': ' + JSON.stringify(common));
                    if (common.write) {
                        charMap[id] = char; // TODO only if write allowed!
                        logger.debug('Add object to charmap with id ' + id + '/' + JSON.stringify(char));
                    }

                    char.on('change', function(data) {
                        logger.info('Char change event: ' + data.oldValue + ' --> ' + data.newValue);
                        handleCharValue(accessory, service, this, data.newValue);
                    });

                    updateState(dev_id, sr_idname, ch_idname, ch_name, ch_val, common);
                }
            }

            iterateCharArray(service.characteristics);
            if (service.optionalCharacteristics) iterateCharArray(service.optionalCharacteristics);

        }
        return accessory;
    });

    /*
    override(MyBridge, function addBridgedAccessories(accessories) {
        logger.info('iobroker.ham Bridge addBridgedAccessories'+JSON.stringify(accessories));
        // Вызов метода родительского класса
        // Calling the method of the parent class
        var result = addBridgedAccessories.inherited.call(this, accessories);
        return result;
    });
    */

    Server.prototype._createBridge = function() {
        logger.debug('iobroker.ham Bridge create'); //OK
        // pull out our custom Bridge settings from config.json, if any
        var bridgeConfig = this._config.bridge || {};

        // Create our Bridge which will host all loaded Accessories
        return new MyBridge(bridgeConfig.name || 'Homebridge', hap.uuid.generate("HomeBridge"));
    };

    function MyBridge(displayName, serialNumber) {
        logger.debug('iobroker.ham Bridge constructor');
        MyBridge.super_.call(this, displayName, serialNumber);
    }

}

function start() {
    var insecureAccess = false;
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
    var ch_id = char.UUID,
        ch_idname = mapper.mapCharacteristicType(ch_id),
        sr_id = serv.UUID,
        sr_idname = mapper.mapServiceType(sr_id),
        dev_id = accessory.UUID,
        value = newValue;
    setState(dev_id, sr_idname, ch_idname, value);
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
            var returnValue = original.apply(this, arguments);
            extraBehavior.apply(this, arguments);
            return returnValue;
        };
    };
}
*/

/*
function handleRegisterPlatformAccessories(accessories) {
    logger.info('handleRegisterPlatformAccessories');
    // var hapAccessories = [];
    for (var index in accessories) {
        var accessory = accessories[index];
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
  // var hapAccessories = [];
  // for (var index in accessories) {
  //   var accessory = accessories[index];

  //   if (accessory._associatedHAPAccessory) {
  //     hapAccessories.push(accessory._associatedHAPAccessory);
  //   }

  //   for (var targetIndex in this._cachedPlatformAccessories) {
  //     var existing = this._cachedPlatformAccessories[targetIndex];
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
  // var accessoryPin = (this._config.bridge || {}).pin || "031-45-154";

  // for (var index in accessories) {
  //   var accessory = accessories[index];

  //   accessory._prepareAssociatedHAPAccessory();
  //   var hapAccessory = accessory._associatedHAPAccessory;
  //   var advertiseAddress = mac.generate(accessory.UUID);

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
    var st_id = change.characteristic.UUID,
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
