/**
 * Ham
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
var inherits = require('util').inherits;

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
var adapter = new utils.Adapter('ham');

var User = require('/usr/lib/node_modules/homebridge/lib/user').User;
User.setStoragePath('/home/pi/.homebridge');
var hap = require("/usr/lib/node_modules/homebridge/node_modules/hap-nodejs");
var version = require('/usr/lib/node_modules/homebridge/lib/version');
var Server = require('/usr/lib/node_modules/homebridge/lib/server').Server;
var Plugin = require('/usr/lib/node_modules/homebridge/lib/plugin').Plugin;
var log = require('/usr/lib/node_modules/homebridge/lib/logger')._system;
var server;

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        if (server) {
            // Save cached accessories to persist storage.
            server._updateCachedAccessories();
        }
        callback();
    } catch (e) {
        callback();
    }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.info('ack is not set!');
        if (state._id == "ham.0.c8ec75a9-6d8c-4206-993c-7b99c0c9b2a5.00000043-0000-1000-8000-0026BB765291.00000025-0000-1000-8000-0026BB765291") {

        }
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj === 'object' && obj.message) {
        if (obj.command === 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});

function updateState(dev_id, ch_id, st_id, name, value, common) {
    let id = dev_id + '.' + ch_id + '.'+ st_id;    
    let new_common = {
        name: name, 
        role: 'value',
        read: true,
        write: (common != undefined && common.write == undefined) ? false : true
    };
    if (common != undefined) {
        if (common.type != undefined) {
            new_common.type = common.type;
        }
        if (common.unit != undefined) {
            new_common.unit = common.unit;
        }
        if (common.states != undefined) {
            new_common.states = common.states;
        }
    }
    adapter.extendObject(id, {type: 'state', common: new_common});
    adapter.setState(id, value, true);
}

function updateDev(dev_id, dev_name, dev_type) {
    // create dev
    adapter.setObjectNotExists(dev_id, {
        type: 'device',
        common: {name: dev_name, type: dev_type}
    }, {});
    adapter.getObject(dev_id, function(err, obj) {
        if (!err && obj) {
            adapter.extendObject(dev_id, {
                type: 'device',
                common: {type: dev_type}
            });
        }
    });
}

function updateChannel(dev_id, ch_id, name, type) {
    var id = dev_id + '.' + ch_id;
    // create channel for dev
    adapter.setObjectNotExists(id, {
        type: 'channel',
        common: {name: name, type: type}
    }, {});
    adapter.getObject(id, function(err, obj) {
        if (!err && obj) {
            adapter.extendObject(id, {
                type: 'channel',
                common: {type: type}
            });
        }
    });
}

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

function handleRegisterPlatformAccessories(accessories) {
    adapter.log.info('handleRegisterPlatformAccessories');
    // var hapAccessories = [];
    for (var index in accessories) {
        var accessory = accessories[index];
        adapter.log.info('accessory='+JSON.stringify(accessory));
        // accessory._prepareAssociatedHAPAccessory();
        // hapAccessories.push(accessory._associatedHAPAccessory);

        //   this._cachedPlatformAccessories.push(accessory);
    }
    // 
    // this._bridge.addBridgedAccessories(hapAccessories);
    // this._updateCachedAccessories();
}

function handleUpdatePlatformAccessories(accessories) {
    // Update persisted accessories
    // this._updateCachedAccessories();
    adapter.log.info('handleUpdatePlatformAccessories');
}

function handleUnregisterPlatformAccessories(accessories) {
    adapter.log.info('handleUnregisterPlatformAccessories');
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

function handlePublishCameraAccessories(accessories) {
    adapter.log.info('handlePublishCameraAccessories');
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

function handleCharacteristicChange(change, accessory){
    adapter.log.info('change = '+JSON.stringify(change) + ' accessory =' + JSON.stringify(accessory));
    var st_id = change.characteristic.UUID,
        ch_id = change.service.UUID,
        dev_id = accessory.UUID,
        value = change.newValue,
        id = dev_id+'.'+ch_id+'.'+st_id;
    adapter.setState(id, value, true);
}

function handleSetCharacteristics(data, events, callback, remote, connectionID) {
    adapter.log.info('handleSetCharacteristics = '+JSON.stringify(data) + ' events = '+JSON.stringify(events));
}

function handleCharChange(change){
    adapter.log.info('char change = '+JSON.stringify(change));
}

function handleCharSet(newValue, callback, context, connectionID) {
    adapter.log.info('char set = '+newValue);
}

function handleCharValue(accessory, serv, char, newValue){
    adapter.log.info('char set = '+newValue);
    adapter.log.info('characteristics = ' + JSON.stringify(char) + ' accessory =' + JSON.stringify(accessory));
    var st_id = char.UUID,
        ch_id = serv.UUID,
        dev_id = accessory.UUID,
        value = newValue,
        id = dev_id+'.'+ch_id+'.'+st_id;
    adapter.setState(id, value, true);
}

// Средство для переопределения функций
function override(child, fn) {
  child.prototype[fn.name] = fn;
  fn.inherited = child.super_.prototype[fn.name];
}

function overrideM(object, methodName, callback) {
  object[methodName] = callback(object[methodName])
}

function after(extraBehavior) {
  return function(original) {
    return function() {
      var returnValue = original.apply(this, arguments)
      extraBehavior.apply(this, arguments)
      return returnValue
    }
  }
}

function MyBridge(displayName, serialNumber) {
    adapter.log.info('is my bridge');
    MyBridge.super_.call(this, displayName, serialNumber);
}

inherits(MyBridge, hap.Bridge);

// MyBridge.prototype.addService = function(service) {
//     // Собственный функционал
//     adapter.log.info('my addService'+JSON.stringify(service));
//     // Вызов метода родительского класса
//     service = MyBridge.super_.prototype.addService.apply(this, arguments);
//     return service;
// };

override(MyBridge, function publish(info, allowInsecureRequest) {
    adapter.log.info('my publish '+JSON.stringify(info));
    // Вызов метода родительского класса
    publish.inherited.call(this, info, allowInsecureRequest);
    //this._server.on('set-characteristics', handleSetCharacteristics.bind(this));
});

// Переопределение метода в дочернем классе
override(MyBridge, function addService(service) {
    // Собственный функционал
    adapter.log.info('my addService'+JSON.stringify(service));
    // Вызов метода родительского класса
    return addService.inherited.call(this, service);
});

override(MyBridge, function addBridgedAccessory(accessory, deferUpdate) {
    // Вызов метода родительского класса
    var accessory = addBridgedAccessory.inherited.call(this, accessory, deferUpdate);
    // Новое устройство
    var dev_id = accessory.UUID,
        dev_name = accessory.displayName,
        dev_cat = accessory.category;
    // accessory.on('service-characteristic-change', function(change) {
    //     handleCharacteristicChange(change, accessory);
    // }.bind(this));
    updateDev(dev_id, dev_name, dev_cat);
    for (var index in accessory.services) {
        var service = accessory.services[index],
            sr_id = service.UUID,
            sr_name = service.displayName;
        //adapter.log.info('Add service class='+ service.constructor.name+' '+JSON.stringify(service));
        updateChannel(dev_id, sr_id, sr_name);
        //var characteristic = service.getCharacteristicByIID(iid);
        //if (characteristic) return characteristic;
        for (var chindex in service.characteristics) {
            var char = service.characteristics[chindex],
                ch_id = char.UUID,
                ch_name = char.displayName,
                ch_val = char.value;
            // char.on('change', function(change) {
            //     handleCharChange(change);
            //     return this;
            // }.bind(this));
            overrideM(char, 'setValue', after(function(newValue, callback, context, connectionID) {
                adapter.log.info('setValue = ' + newValue);
                handleCharValue(accessory, service, this, newValue);
            }).bind(char));
            overrideM(char, 'updateValue', after(function(newValue, callback, context) {
                adapter.log.info('updateValue = ' + newValue);
                handleCharValue(accessory, service, this, newValue);
            }).bind(char));
            // char.on('set', function(newValue, callback, context, connectionID) {
            //     //handleCharSet(newValue, callback, context, connectionID);
            //     if (callback) callback();
            // }.bind(this));
            //adapter.log.info('Add service characteristic ='+ char.constructor.name+' '+JSON.stringify(char));
            updateState(dev_id, sr_id, ch_id, ch_name, ch_val, {write: true});
        }
    }
    //adapter.log.info('my addBridgedAccessory class='+ accessory.constructor.name+' '+JSON.stringify(accessory));
    return accessory;
});

override(MyBridge, function addBridgedAccessories(accessories) {
    adapter.log.info('my addBridgedAccessories'+JSON.stringify(accessories));
    // Вызов метода родительского класса
    var result = addBridgedAccessories.inherited.call(this, accessories);
    return result;
});

Server.prototype._createBridge = function() {
    // pull out our custom Bridge settings from config.json, if any
    var bridgeConfig = this._config.bridge || {};
  
    // Create our Bridge which will host all loaded Accessories
    return new MyBridge(bridgeConfig.name || 'Homebridge', hap.uuid.generate("HomeBridge"));
}


function main() {
    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    // adapter.log.info('config test1: '    + adapter.config.test1);
    // adapter.log.info('config test1: '    + adapter.config.test2);
    // adapter.log.info('config mySelect: ' + adapter.config.mySelect);

    var insecureAccess = false;
    adapter.log.info(User.persistPath());
    // Initialize HAP-NodeJS with a custom persist directory
    hap.init(User.persistPath());

    server = new Server(insecureAccess);

    // server._api.on('registerPlatformAccessories', function(accessories) {
    //     handleRegisterPlatformAccessories(accessories);
    // }.bind(server));

    // server._api.on('updatePlatformAccessories', function(accessories) {
    //     handleUpdatePlatformAccessories(accessories);
    // }.bind(server));

    // server._api.on('unregisterPlatformAccessories', function(accessories) {
    //     handleUnregisterPlatformAccessories(accessories);
    // }.bind(server));

    // server._api.on('publishCameraAccessories', function(accessories) {
    //     handlePublishCameraAccessories(accessories);
    // }.bind(server));

    server.run();

    /**
     *
     *      For every state in the system there has to be also an object of type state
     *
     *      Here a simple template for a boolean variable named "testVariable"
     *
     *      Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
     *
     */

    // adapter.setObject('testVariable', {
    //     type: 'state',
    //     common: {
    //         name: 'testVariable',
    //         type: 'boolean',
    //         role: 'indicator'
    //     },
    //     native: {}
    // });

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');


    /**
     *   setState examples
     *
     *   you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
     *
     */

    // // the variable testVariable is set to true as command (ack=false)
    // adapter.setState('testVariable', true);

    // // same thing, but the value is flagged "ack"
    // // ack should be always set to true if the value is received from or acknowledged from the target system
    // adapter.setState('testVariable', {val: true, ack: true});

    // // same thing, but the state is deleted after 30s (getState will return null afterwards)
    // adapter.setState('testVariable', {val: true, ack: true, expire: 30});



    // // examples for the checkPassword/checkGroup functions
    // adapter.checkPassword('admin', 'iobroker', function (res) {
    //     console.log('check user admin pw ioboker: ' + res);
    // });

    // adapter.checkGroup('admin', 'admin', function (res) {
    //     console.log('check group user admin group admin: ' + res);
    // });



}
