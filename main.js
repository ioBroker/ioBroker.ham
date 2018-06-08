/* jshint -W097 */
// jshint strict:false
/*jslint node: true */
/*jslint esversion: 6 */
'use strict';

// you have to require the utils module and call adapter function
var utils = require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
var adapter = new utils.Adapter('ham');

var homebridgeHandler;

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        homebridgeHandler.end();
        callback();
    } catch (e) {
        callback();
    }
});

process.on('SIGINT', function () {
    homebridgeHandler.end();
});

process.on('SIGTERM', function () {
    homebridgeHandler.end();
});

process.on('uncaughtException', function (err) {
    if (adapter && adapter.log) {
        adapter.log.warn('Exception: ' + err);
    }
    homebridgeHandler.end();
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

    id = id.substr(adapter.namespace.length+1);
    adapter.log.info('lookup id: ' + id);
    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.info('ack is not set!');
        homebridgeHandler.setValueForCharId(id, state.val);
    }
});

function updateDev(dev_id, dev_name, dev_type) {
    adapter.log.info('updateDev ' + dev_id + ': name = ' + dev_name + ' /type= ' + dev_type);
    // create dev
    adapter.getObject(dev_id, function(err, obj) {
        if (!err && obj) {
            adapter.extendObject(dev_id, {
                type: 'device',
                common: {type: dev_type}
            });
        }
        else {
            adapter.setObject(dev_id, {
                type: 'device',
                common: {name: dev_name, type: dev_type}
            }, {});
        }
    });
}

function updateChannel(dev_id, ch_id, name, type) {
    var id = dev_id + '.' + ch_id;
    // create channel for dev
    adapter.log.info('updateChannel ' + id + ': name = ' + name + ' /type= ' + type);
    adapter.getObject(id, function(err, obj) {
        if (!err && obj) {
            adapter.extendObject(id, {
                type: 'channel',
                common: {type: type}
            });
        }
        else {
            adapter.setObject(id, {
                type: 'channel',
                common: {name: name, type: type}
            }, {});
        }
    });
}

function updateState(dev_id, ch_id, st_id, name, value, common) {
    var id = dev_id + '.' + ch_id + '.'+ st_id;
    if (!common) common = {};
    if (common.name === undefined) common.name = name;
    if (common.role === undefined) common.role = 'state';
    if (common.read === undefined && common.write === undefined) common.read = true;
    if (common.type === undefined) common.type = 'string';
    if (common.unit === undefined) common.unit = '';

    adapter.log.info('updateState ' + id + ': value = ' + value + ' /common= ' + JSON.stringify(common));

    adapter.getObject(id, function(err, obj) {
        if (!err && obj) {
            adapter.extendObject(id, {
                type: 'state',
                common: common
            });
        }
        else {
            adapter.setObject(id, {
                type: 'state',
                common: common
            }, {});
        }
    });

    adapter.setState(id, value, true);
}


function setState(dev_id, ch_id, st_id, value) {
    var id = dev_id+'.'+ch_id+'.'+st_id;
    adapter.setState(id, value, true);
}

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});


function main() {
    if (adapter.config.useGlobalHomebridge) {
        homebridgeHandler = require(__dirname + '/lib/globalhomebridge/handler');
        homebridgeHandler.init({
            logger: adapter.log,
            homebridgeBasePath: adapter.config.globalHomebridgeBasePath,
            homebridgeConfigPath: adapter.config.globalHomebridgeConfigPath, // /Users/ingof/.homebridge/
            updateDev: updateDev,
            updateChannel: updateChannel,
            updateState: updateState,
            setState: setState
        });
    }
    else {
        adapter.log.error('Non Global Mode not supported till now!!');
        process.exit();
    }

    homebridgeHandler.start();

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');
}
