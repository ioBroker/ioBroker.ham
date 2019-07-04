/* jshint -W097 */
/* jshint -W030 */
/* jshint strict: false */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';
const nodeFS  = require('fs');
const child_process = require('child_process');
// you have to require the utils module and call adapter function
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const path = require('path');
const stringArgv = require('string-argv');

// it is not an object.
function createHam(options) {
    const dataDir = path.normalize(path.join(utils.controllerDir, require(path.join(utils.controllerDir, 'lib', 'tools.js')).getDefaultDataDir()));

    // you have to call the adapter function and pass a options object
    // name has to be set and has to be equal to adapters folder name and main file name excluding extension
    // adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
    const adapter = new utils.Adapter(options);

    let homebridgeHandler;
    const npmLibrariesToInstall = [];
    const installLocalHomebridgeVersion = '0.4.50';

    // is called when adapter shuts down - callback has to be called under any circumstances!
    adapter.on('unload', callback => {
        try {
            adapter.log.info('cleaned everything up...');
            homebridgeHandler.end();
            callback();
        } catch (e) {
            callback();
        }
    });

    process.on('SIGINT', () => homebridgeHandler && homebridgeHandler.end());

    process.on('SIGTERM', () => homebridgeHandler && homebridgeHandler.end());

    process.on('uncaughtException', err => {
        if (adapter && adapter.log) {
            adapter.log.warn('Exception: ' + err);
        }
        homebridgeHandler && homebridgeHandler.end();
    });

    // is called if a subscribed state changes
    adapter.on('stateChange', (id, state) => {
        // Warning, state can be null if it was deleted
        adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

        id = id.substr(adapter.namespace.length+1);
        adapter.log.debug('lookup id: ' + id);
        // you can use the ack flag to detect if it is status (true) or command (false)
        if (state && !state.ack) {
            adapter.log.debug('ack is not set!');
            homebridgeHandler.setValueForCharId(id, state.val);
        }
    });

    function updateDev(dev_id, dev_name, dev_type, dev_uuid) {
        adapter.log.info('updateDev ' + dev_id + ': name = ' + dev_name + ' /type= ' + dev_type);
        // create dev
        adapter.getObject(dev_id, (err, obj) => {
            if (!err && obj) {
                adapter.extendObject(dev_id, {
                    type: 'device',
                    common: {name: dev_name},
                    native: {
                        UUID: dev_uuid,
                        displayName: dev_name,
                        category: dev_type
                    }
                });
            }
            else {
                adapter.setObject(dev_id, {
                    type: 'device',
                    common: {name: dev_name},
                    native: {
                        UUID: dev_uuid,
                        displayName: dev_name,
                        category: dev_type
                    }
                }, {});
            }
        });
    }

    function updateChannel(dev_id, ch_id, name, ch_uuid) {
        const id = dev_id + '.' + ch_id;
        // create channel for dev
        adapter.log.info('updateChannel ' + id + ': name = ' + name);
        adapter.getObject(id, (err, obj) => {
            if (!err && obj) {
                adapter.extendObject(id, {
                    type: 'channel',
                    common: {name: name},
                    native: {
                        UUID: ch_uuid,
                        displayName: name
                    }
                });
            }
            else {
                adapter.setObject(id, {
                    type: 'channel',
                    common: {name: name},
                    native: {
                        UUID: ch_uuid,
                        displayName: name
                    }
                }, {});
            }
        });
    }

    function updateState(dev_id, ch_id, st_id, name, value, common, st_uuid, callback) {
        const id = dev_id + '.' + ch_id + '.'+ st_id;
        if (!common) common = {};
        if (common.name === undefined) common.name = name;
        if (common.role === undefined) common.role = 'state';
        if (common.read === undefined && common.write === undefined) common.read = true;
        if (common.type === undefined) common.type = 'string';
        if (common.unit === undefined) common.unit = '';

        adapter.log.info('updateState ' + id + ': value = ' + value + ' /common= ' + JSON.stringify(common));

        adapter.getObject(id, (err, obj) => {
            if (!err && obj) {
                adapter.extendObject(id, {
                    type: 'state',
                    common: common,
                    native: {
                        UUID: st_uuid,
                        displayName: name
                    }
                }, callback);
            }
            else {
                adapter.setObject(id, {
                    type: 'state',
                    common: common,
                    native: {
                        UUID: st_uuid,
                        displayName: name
                    }
                }, callback);
            }
        });
    }

    function setState(dev_id, ch_id, st_id, value) {
        const id = dev_id + '.' + ch_id + '.' + st_id;
        adapter.setState(id, value, true);
    }

    // is called when databases are connected and adapter received configuration.
    // start here!
    adapter.on('ready', main);

    function loadExistingAccessories(callback) {
        adapter.getDevices((err, res) => {
            if (err) {
                adapter.log.error('Can not get all existing devices: ' + err);
                return;
            }
            for (let i = 0; i < res.length; i++) {
                if (res[i].native && res[i].native.UUID) {
                    adapter.log.debug('Remember existing Accessory ' + res[i].native.displayName + ' with UUID ' + res[i].native.UUID);
                    homebridgeHandler.registerExistingAccessory(res[i].native.UUID, res[i].native.displayName);
                }
            }

            if (callback) callback();
        });
    }

    //Catch Homebridge Console Logging
    if (process.argv.indexOf('--logs') === -1 && process.argv.indexOf('-l') === -1) {
        console.log = function (logs) {
            if (adapter && adapter.log && adapter.log.debug) {
                adapter.log.debug(logs);
            }
            process.stdout.write(logs + '\n');
        };
    }

    function main() {
        const usedLogger = {
            info: adapter.log.debug,
            warn: adapter.log.warn,
            debug: adapter.log.silly,
            silly: adapter.log.silly
        };
        if (adapter.config.virtualCommandLine) {
            stringArgv.parseArgsStringToArgv(adapter.config.virtualCommandLine).forEach(e => process.argv.push(e));
        }

        checkLocalMode(() => {
            installAllLibraries(() => {
                const configDir = path.join(dataDir, adapter.namespace.replace('.', '_'));
                if (adapter.config.useGlobalHomebridge) {
                    adapter.log.debug('Use Global Homebridge Path: ' + adapter.config.globalHomebridgeBasePath);
                    let nodePathEnv = process.env.NODE_PATH;
                    if (!nodePathEnv) {
                        nodePathEnv = adapter.config.globalHomebridgeBasePath;
                    }
                    else {
                        nodePathEnv = adapter.config.globalHomebridgeBasePath + (process.platform === 'win32' ? ';' : ':') + nodePathEnv;
                    }
                    nodePathEnv = path.join(adapter.config.globalHomebridgeBasePath, '..') + (process.platform === 'win32' ? ';' : ':') + nodePathEnv;
                    process.env.NODE_PATH = nodePathEnv;
                    homebridgeHandler = require('./lib/global-handler');
                    homebridgeHandler.init({
                        logger: usedLogger,
                        homebridgeBasePath: adapter.config.globalHomebridgeBasePath,
                        homebridgeConfigPath: adapter.config.globalHomebridgeConfigPath,
                        updateDev: updateDev,
                        updateChannel: updateChannel,
                        updateState: updateState,
                        setState: setState,
                        ignoreInfoAccessoryServices: adapter.config.ignoreInfoAccessoryServices,
                        characteristicPollingInterval: adapter.config.characteristicPollingInterval * 1000,
                        insecureAccess: adapter.config.insecureAccess || false
                    });
                }
                else if (adapter.config.useLocalHomebridge) {
                    try {
                        if (!nodeFS.existsSync(configDir)) {
                            nodeFS.mkdirSync(configDir);
                        }
                        // some Plugins want to have config file
                        nodeFS.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(adapter.config.wrapperConfig));
                    }
                    catch (err) {
                        adapter.log.error('Error writing config file at ' + path.join(configDir, 'config.json') + ', but needed for local Mode to work! Exiting: ' + err);
                        return;
                    }
                    homebridgeHandler = require('./lib/global-handler');
                    homebridgeHandler.init({
                        logger: usedLogger,
                        homebridgeBasePath: path.join(__dirname, 'node_modules', 'homebridge'),
                        homebridgeConfigPath: configDir,
                        updateDev: updateDev,
                        updateChannel: updateChannel,
                        updateState: updateState,
                        setState: setState,
                        ignoreInfoAccessoryServices: adapter.config.ignoreInfoAccessoryServices,
                        characteristicPollingInterval: adapter.config.characteristicPollingInterval * 1000,
                        insecureAccess: adapter.config.insecureAccess || false
                    });
                }
                else {
                    homebridgeHandler = require('./lib/wrapper-handler');
                    homebridgeHandler.init({
                        logger: usedLogger,
                        homebridgeConfigPath: configDir,
                        updateDev: updateDev,
                        updateChannel: updateChannel,
                        updateState: updateState,
                        setState: setState,
                        wrapperConfig: adapter.config.wrapperConfig,
                        ignoreInfoAccessoryServices: adapter.config.ignoreInfoAccessoryServices,
                        characteristicPollingInterval: adapter.config.characteristicPollingInterval * 1000,
                        insecureAccess: adapter.config.insecureAccess || false
                    });
                }

                loadExistingAccessories(() => {
                    // in this template all states changes inside the adapters namespace are subscribed
                    adapter.subscribeStates('*');

                    homebridgeHandler.start();

                    options.exitAfter && setTimeout(() => adapter && adapter.stop(), 10000);
                });
            });
        });
    }

    function installNpm(npmLib, callback) {
        const localPath = __dirname;
        if (typeof npmLib === 'function') {
            callback = npmLib;
            npmLib = undefined;
        }

        if (!nodeFS.existsSync(path.join(localPath, 'node_modules'))) {
            nodeFS.mkdirSync(path.join(localPath, 'node_modules'));
        }

        const cmd = 'npm install ' + npmLib + ' --production --prefix "' + localPath + '"';
        adapter.log.info(cmd + ' (System call)');
        // Install node modules as system call

        // System call used for update of js-controller itself,
        // because during installation npm packet will be deleted too, but some files must be loaded even during the install process.
        const child = child_process.exec(cmd);

        child.stdout.on('data', buf => adapter.log.info(buf.toString('utf8')));
        child.stderr.on('data', buf => adapter.log.info(buf.toString('utf8')));

        child.on('exit', (code /* , signal */) => {
            if (code && code !== 1) {
                adapter.log.error('Cannot install ' + npmLib + ': ' + code);
                if (typeof callback === 'function') callback(new Error('Installation failed with code ' + code), npmLib);
                return;
            }
            // command succeeded
            if (typeof callback === 'function') callback(null, npmLib);
        });
    }

    function installNpmLibraryWithRetries(npmLib, callback, counter) {
        if (counter === undefined) counter = 3;
        if (counter === 0) {
            callback && callback(new Error('Library ' + npmLib + ' not installed after 3 attempts'), npmLib);
            return;
        }
        const libraryDir = npmLib.split('@')[0];
        if (!nodeFS.existsSync(__dirname + '/node_modules/' + libraryDir + '/package.json') || (adapter.config.updateLibraries && counter === 3)) {

            installNpm(npmLib, () => {
                installNpmLibraryWithRetries(npmLib, callback, --counter)
            });
        }
        else {
            callback && callback(null, npmLib);
        }
    }

    function installLibraries(callback) {
        if (! npmLibrariesToInstall.length) {
            callback && callback();
            return;
        }

        const lib = npmLibrariesToInstall[0];
        adapter.log.info('Install/Update ' + lib);

        installNpmLibraryWithRetries(lib, (err, npmLib) => {
            if (err) {
                adapter.log.error(err);
            }
            if (lib === npmLib) {
                npmLibrariesToInstall.shift();
                installLibraries(callback);
            }
        });
    }

    function installAllLibraries(callback) {
        if (adapter.config && adapter.config.libraries && !adapter.config.useGlobalHomebridge) {
            adapter.config.libraries.split(/[,;\s]+/).forEach(e => npmLibrariesToInstall.push(e.trim()));
        }

        if (npmLibrariesToInstall.length) {
            adapter.log.info('Install/Update the following Libraries: ' + npmLibrariesToInstall.join(', '));
            installLibraries(() => {
                if (adapter.config.updateLibraries) {
                    adapter.log.info('All NPM Modules got reinstalled/updated ... restarting ...');
                    adapter.extendForeignObject('system.adapter.' + adapter.namespace, {
                        native: {
                            updateLibraries: false
                        }
                    });
                    return;
                }
                adapter.log.info('All Libraries installed/updated');
                callback && callback();
            });
            return;
        }
        adapter.log.info('No additional Libraries to install ...');
        callback && callback();
    }

    function deleteFolderRecursive(path) {
        if (fs.existsSync(path)) {
            fs.readdirSync(path).forEach(function(file){
                const curPath = path.join(path, file);
                if (fs.lstatSync(curPath).isDirectory()) { // recurse
                    deleteFolderRecursive(curPath);
                } else { // delete file
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
        }
    }

    function checkLocalMode(callback) {
        if (!adapter.config.useLocalHomebridge) {
            callback && callback();
            return;
        }
        if (fs.existsSync(path.join(dataDir, adapter.namespace.replace('.', '_'), 'config.json'))) {
            try {
                const formerConfig = require(path.join(dataDir, adapter.namespace.replace('.', '_'), 'config.json'));
                if (formerConfig && formerConfig.bridge && formerConfig.bridge.username && adapter.config.wrapperConfig && adapter.config.wrapperConfig.bridge && adapter.config.wrapperConfig.bridge.username && adapter.config.wrapperConfig.bridge.username !== formerConfig.bridge.username) {
                    adapter.log.info('remove homebridge cache directory because Bridge username changed!');
                    deleteFolderRecursive(path.join(dataDir, adapter.namespace.replace('.', '_')));
                }
            }
            catch (err) {
                adapter.log.error('Error while checking former homebridge config: ' + err);
            }
        }

        let installHomebridge = false;

        if (nodeFS.existsSync(__dirname + '/node_modules/homebridge/package.json')) {
            let localHomebridgeVersion;
            try {
                localHomebridgeVersion = JSON.parse(nodeFS.readFileSync(__dirname + '/node_modules/homebridge/package.json'));
            }
            catch (err) {
                localHomebridgeVersion = '0';
            }
            if (localHomebridgeVersion !== installLocalHomebridgeVersion) {
                installHomebridge = true;
            }
        }
        else {
            installHomebridge = true;
        }

        if (installHomebridge || adapter.config.updateLibraries) {
            adapter.log.info('Need to install/update homebridge@' + installLocalHomebridgeVersion);
            installNpmLibraryWithRetries('homebridge@' + installLocalHomebridgeVersion, (err) => {
                if (err) {
                    adapter.log.error('Can not start in local Mode because Homebridge is not installed: ' + err);
                    return;
                }
                else {
                    adapter.log.debug('Install/Update homebridge done');
                }
                callback && callback();
            });
            return;
        }
        callback && callback();
    }

    return adapter;
}

if (!module || !module.parent) {
    createHam('ham');
} else {
    module.exports = createHam;
}
