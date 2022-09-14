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
const nodePath = require('path');
const stringArgv = require('string-argv');

const initializedStateObjects = {};
const lastRealStateValue = {};

// it is not an object.
function createHam(options) {
    const dataDir = utils.getAbsoluteDefaultDataDir();

    // you have to call the adapter function and pass an options object
    // name has to be set and has to be equal to adapters folder name and main file name excluding extension
    // adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
    const adapter = new utils.Adapter(options);

    let homebridgeHandler;
    const npmLibrariesToInstall = [];
    const installLocalHomebridgeVersion = '1.5.0';

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
            adapter.log.warn(`Exception: ${err}`);
        }
        homebridgeHandler && homebridgeHandler.end();
    });

    // is called if a subscribed state changes
    adapter.on('stateChange', (id, state) => {
        // Warning, state can be null if it was deleted
        adapter.log.info(`stateChange ${id} ${JSON.stringify(state)}`);

        if (state && !state.ack) {
            id = id.substr(adapter.namespace.length+1);
            adapter.log.debug(`Set value ${JSON.stringify(state.val)} for lookup id ${id}`);
            homebridgeHandler.setValueForCharId(id, state.val, (err, val) => {
                if (err) {
                    adapter.log.info(`Error setting value ${JSON.stringify(state.val)} for ${id}: ${err}`);
                } else {
                    if (val === undefined) {
                        val = state.val
                    }
                    adapter.log.debug(`Set value ${JSON.stringify(val)} for ${id} successful`);
                }
            });
        }
    });

    async function updateDev(dev_id, dev_name, dev_type, dev_uuid) {
        adapter.log.info(`updateDev ${dev_id}: name = ${dev_name} /type= ${dev_type}`);
        // create dev
        await adapter.extendObjectAsync(dev_id, {
            type: 'device',
            common: {name: dev_name},
            native: {
                UUID: dev_uuid,
                displayName: dev_name,
                category: dev_type
            }
        });
    }

    async function updateChannel(dev_id, ch_id, name, ch_uuid) {
        const id = `${dev_id}.${ch_id}`;
        // create channel for dev
        adapter.log.info(`updateChannel ${id}: name = ${name}`);

        await adapter.extendObjectAsync(id, {
            type: 'channel',
            common: {name: name},
            native: {
                UUID: ch_uuid,
                displayName: name
            }
        });
    }

    async function updateState(dev_id, ch_id, st_id, name, value, common, st_uuid) {
        const id = `${dev_id}.${ch_id}.${st_id}`;
        if (!common) common = {};
        if (common.name === undefined) common.name = name;
        if (common.role === undefined) common.role = 'state';
        if (common.read === undefined && common.write === undefined) common.read = true;
        if (common.type === undefined) common.type = 'string';
        if (common.unit === undefined) common.unit = '';

        adapter.log.info(`updateState ${id}: value = ${value} /common= ${JSON.stringify(common)}`);

        await adapter.extendObjectAsync(id, {
            type: 'state',
            common: common,
            native: {
                UUID: st_uuid,
                displayName: name
            }
        });

        initializedStateObjects[id] = true;

        if (lastRealStateValue[id] && !lastRealStateValue[id].alreadySet) {
            // When a setState came before objects were initialized set the postponed value now
            adapter.log.debug(`updateState ${id}: set postponed value = ${lastRealStateValue[id].val}`);
            lastRealStateValue[id].alreadySet = true;
            await adapter.setStateAsync(id, {
                val: lastRealStateValue[id].val,
                ts: lastRealStateValue[id].ts,
                ack: true
            });
        } else if (value !== undefined && !lastRealStateValue[id]) {
            // Only set values from object definition if no real queried value exists
            adapter.log.debug(`updateState ${id}: set value = ${value}`);
            await adapter.setStateAsync(id, {val: value, ack: true});
        }
    }

    async function setState(dev_id, ch_id, st_id, value) {
        const id = `${dev_id}.${ch_id}.${st_id}`;
        adapter.log.debug(`setState ${id}: set value = ${value}`);
        if (!initializedStateObjects[id]) {
            lastRealStateValue[id] = {
                val: value,
                ts: Date.now(),
                alreadySet: false
            };
            return;
        }
        lastRealStateValue[id] = {
            val: value,
            ts: Date.now(),
            alreadySet: true
        };
        await adapter.setStateAsync(id, value, true);
    }

    // is called when databases are connected and adapter received configuration.
    // start here!
    adapter.on('ready', main);

    function loadExistingAccessories(callback) {
        adapter.getDevices((err, res) => {
            if (err || !res) {
                adapter.log.error(`Can not get all existing devices: ${err}`);
                return;
            }
            for (let i = 0; i < res.length; i++) {
                if (res[i].native && res[i].native.UUID) {
                    adapter.log.debug(`Remember existing Accessory ${res[i].native.displayName} with UUID ${res[i].native.UUID}`);
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
            process.stdout.write(`${logs}
`);
        };
    }

    function main() {
        const usedLogger = {
            info: adapter.log.debug.bind(adapter),
            warn: adapter.log.warn.bind(adapter),
            debug: adapter.log.debug.bind(adapter),
            silly: adapter.log.silly.bind(adapter)
        };
        if (adapter.config.virtualCommandLine) {
            stringArgv.parseArgsStringToArgv(adapter.config.virtualCommandLine).forEach(e => process.argv.push(e));
        }

        checkLocalMode(() => {
            installAllLibraries(() => {
                const configDir = nodePath.join(dataDir, adapter.namespace.replace('.', '_'));
                if (adapter.config.useGlobalHomebridge) {
                    adapter.log.info('Adapter uses Global mode')
                    adapter.log.debug(`Use Global Homebridge Path: ${adapter.config.globalHomebridgeBasePath}`);
                    let nodePathEnv = process.env.NODE_PATH;
                    if (!nodePathEnv) {
                        nodePathEnv = adapter.config.globalHomebridgeBasePath;
                    }
                    else {
                        nodePathEnv = `${adapter.config.globalHomebridgeBasePath}${process.platform === 'win32' ? ';' : ':'}${nodePathEnv}`;
                    }
                    nodePathEnv = `${nodePath.join(adapter.config.globalHomebridgeBasePath, '..')}${process.platform === 'win32' ? ';' : ':'}${nodePathEnv}`;
                    process.env.NODE_PATH = nodePathEnv;
                    homebridgeHandler = require('./lib/global-handler');
                    homebridgeHandler.init({
                        logger: usedLogger,
                        homebridgeBasePath: adapter.config.globalHomebridgeBasePath,
                        homebridgeConfigPath: adapter.config.globalHomebridgeConfigPath,
                        updateDev,
                        updateChannel,
                        updateState,
                        setState,
                        ignoreInfoAccessoryServices: adapter.config.ignoreInfoAccessoryServices,
                        characteristicPollingInterval: adapter.config.characteristicPollingInterval * 1000,
                        insecureAccess: adapter.config.insecureAccess || false,
                        forbiddenCharacters: adapter.FORBIDDEN_CHARS
                    });
                }
                else if (adapter.config.useLocalHomebridge) {
                    adapter.log.info('Adapter uses Local mode')
                    try {
                        if (!nodeFS.existsSync(configDir)) {
                            nodeFS.mkdirSync(configDir);
                        }
                        // some Plugins want to have config file
                        nodeFS.writeFileSync(nodePath.join(configDir, 'config.json'), JSON.stringify(adapter.config.wrapperConfig));
                    }
                    catch (err) {
                        adapter.log.error(`Error writing config file at ${nodePath.join(configDir, 'config.json')}, but needed for local Mode to work! Exiting: ${err}`);
                        return;
                    }
                    homebridgeHandler = require('./lib/global-handler');
                    homebridgeHandler.init({
                        logger: usedLogger,
                        homebridgeBasePath: nodePath.join(__dirname, 'node_modules', 'homebridge'),
                        homebridgeConfigPath: configDir,
                        updateDev,
                        updateChannel,
                        updateState,
                        setState,
                        ignoreInfoAccessoryServices: adapter.config.ignoreInfoAccessoryServices,
                        characteristicPollingInterval: adapter.config.characteristicPollingInterval * 1000,
                        insecureAccess: adapter.config.insecureAccess || false,
                        forbiddenCharacters: adapter.FORBIDDEN_CHARS
                    });
                }
                else {
                    adapter.log.info('Adapter uses Wrapper mode')
                    homebridgeHandler = require('./lib/wrapper-handler');
                    homebridgeHandler.init({
                        logger: usedLogger,
                        homebridgeConfigPath: configDir,
                        updateDev,
                        updateChannel,
                        updateState,
                        setState,
                        wrapperConfig: adapter.config.wrapperConfig,
                        ignoreInfoAccessoryServices: adapter.config.ignoreInfoAccessoryServices,
                        characteristicPollingInterval: adapter.config.characteristicPollingInterval * 1000,
                        insecureAccess: adapter.config.insecureAccess || false,
                        forbiddenCharacters: adapter.FORBIDDEN_CHARS
                    });
                }

                loadExistingAccessories(() => {
                    // in this template all states changes inside the adapters namespace are subscribed
                    adapter.subscribeStates('*');

                    homebridgeHandler.start();

                    options.exitAfter && setTimeout(() =>
                        // @ts-ignore
                        adapter && adapter.stop(), 10000);
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

        if (!nodeFS.existsSync(nodePath.join(localPath, 'node_modules'))) {
            nodeFS.mkdirSync(nodePath.join(localPath, 'node_modules'));
        }

        const cmd = `npm install ${npmLib} --production  --loglevel error`;
        adapter.log.info(`${cmd} (System call)`);
        // Install node modules as system call

        // System call used for update of js-controller itself,
        // because during installation npm packet will be deleted too, but some files must be loaded even during the install process.
        const child = child_process.exec(cmd, {
            cwd: localPath,
            windowsHide: true
        });

        child.stdout && child.stdout.on('data', buf => adapter.log.info(buf.toString('utf8')));
        child.stderr && child.stderr.on('data', buf => adapter.log.info(buf.toString('utf8')));

        child.on('exit', (code /* , signal */) => {
            if (code && code !== 1) {
                adapter.log.error(`Cannot install ${npmLib}: ${code}`);
                typeof callback === 'function' && callback(new Error(`Installation failed with code ${code}`), npmLib);
                return;
            }
            // command succeeded
            typeof callback === 'function' && callback(null, npmLib);
        });
    }

    function installNpmLibraryWithRetries(npmLib, callback, counter) {
        if (counter === undefined) counter = 3;
        if (counter === 0) {
            callback && callback(new Error(`Library ${npmLib} not installed after 3 attempts`), npmLib);
            return;
        }
        const libraryDir = npmLib.split(/(?<!^)@/)[0];
        if ((npmLib.includes('://') && counter === 3) || (!npmLib.includes('://') && !nodeFS.existsSync(`${__dirname}/node_modules/${libraryDir}/package.json`)) || (adapter.config.updateLibraries && counter === 3)) {

            installNpm(npmLib, () =>
                installNpmLibraryWithRetries(npmLib, callback, --counter));
        } else {
            callback && callback(null, npmLib);
        }
    }

    function installLibraries(callback) {
        if (! npmLibrariesToInstall.length) {
            callback && callback();
            return;
        }

        const lib = npmLibrariesToInstall[0];
        adapter.log.info(`Install/Update ${lib}`);

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
            adapter.log.info(`Install/Update the following Libraries: ${npmLibrariesToInstall.join(', ')}`);
            installLibraries(() => {
                if (adapter.config.updateLibraries) {
                    adapter.log.info('All NPM Modules got reinstalled/updated ... restarting ...');
                    adapter.extendForeignObject(`system.adapter.${adapter.namespace}`, {
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
        if (nodeFS.existsSync(path)) {
            nodeFS.readdirSync(path).forEach(file => {
                const curPath = nodePath.join(path, file);
                if (nodeFS.lstatSync(curPath).isDirectory()) { // recurse
                    deleteFolderRecursive(curPath);
                } else { // delete file
                    nodeFS.unlinkSync(curPath);
                }
            });
            nodeFS.rmdirSync(path);
        }
    }

    function checkLocalMode(callback) {
        if (!adapter.config.useLocalHomebridge) {
            callback && callback();
            return;
        }
        if (nodeFS.existsSync(nodePath.join(dataDir, adapter.namespace.replace('.', '_'), 'config.json'))) {
            try {
                const formerConfig = require(nodePath.join(dataDir, adapter.namespace.replace('.', '_'), 'config.json'));
                if (formerConfig &&
                    formerConfig.bridge &&
                    formerConfig.bridge.username &&
                    adapter.config.wrapperConfig &&
                    // @ts-ignore
                    adapter.config.wrapperConfig.bridge &&
                    // @ts-ignore
                    adapter.config.wrapperConfig.bridge.username &&
                    // @ts-ignore
                    adapter.config.wrapperConfig.bridge.username !== formerConfig.bridge.username
                ) {
                    adapter.log.info('remove homebridge cache directory because Bridge username changed!');
                    deleteFolderRecursive(nodePath.join(dataDir, adapter.namespace.replace('.', '_')));
                }
            }
            catch (err) {
                adapter.log.error(`Error while checking former homebridge config: ${err}`);
            }
        }

        let installHomebridge = false;

        if (nodeFS.existsSync(`${__dirname}/node_modules/homebridge/package.json`)) {
            let localHomebridgeVersion;
            try {
                localHomebridgeVersion = JSON.parse(nodeFS.readFileSync(`${__dirname}/node_modules/homebridge/package.json`, 'utf-8'));
            } catch (err) {
                localHomebridgeVersion = '0';
            }
            if (localHomebridgeVersion !== installLocalHomebridgeVersion) {
                installHomebridge = true;
            }
        } else {
            installHomebridge = true;
        }

        if (installHomebridge || adapter.config.updateLibraries) {
            adapter.log.info(`Need to install/update homebridge@${installLocalHomebridgeVersion}`);
            installNpmLibraryWithRetries(`homebridge@${installLocalHomebridgeVersion}`, (err) => {
                if (err) {
                    adapter.log.error(`Can not start in local Mode because Homebridge is not installed: ${err}`);
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

// @ts-ignore
if (!module || !module.parent) {
    createHam('ham');
} else {
    module.exports = createHam;
}
