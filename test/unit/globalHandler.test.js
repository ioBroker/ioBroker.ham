'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    requireBuild,
    createLamp,
    createHandlerConfig,
    createManualTimers,
    useGetValueCallback,
    waitFor,
    flush,
} = require('./helpers');

const { GlobalHandler } = requireBuild('lib/global-handler.js');
const { Mapper } = requireBuild('lib/mapper.js');
const { MiniQueue } = requireBuild('lib/miniqueue.js');
const { HapTypes } = require('./helpers').installFakeWrapper();

/** Stand-in for the HAP-NodeJS Bridge of the loaded Homebridge */
class FakeBridge {
    constructor(displayName, serialNumber) {
        this.displayName = displayName;
        this.serialNumber = serialNumber;
        this.published = [];
        this.bridged = [];
    }
    publish(info, allowInsecureRequest) {
        this.published.push({ info, allowInsecureRequest });
        return 'published';
    }
    addBridgedAccessory(accessory, deferUpdate) {
        this.bridged.push({ accessory, deferUpdate });
        return accessory;
    }
    on() {}
}

function writeFiles(baseDir, files) {
    for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(baseDir, file)), { recursive: true });
        fs.writeFileSync(path.join(baseDir, file), typeof content === 'string' ? content : JSON.stringify(content));
    }
}

/** HAP-NodeJS stand-in (CommonJS). The test state is in globalThis.__hamTest. */
function hapIndex(withHapStorage) {
    return `'use strict';
class Bridge {
    constructor(displayName, serialNumber) {
        this.displayName = displayName;
        this.serialNumber = serialNumber;
    }
    on() {}
    addBridgedAccessory(accessory) {
        return accessory;
    }
    publish() {}
}
exports.Bridge = Bridge;
exports.uuid = { generate: data => 'uuid-' + data };
${withHapStorage ? 'exports.HAPStorage = require("./lib/model/HAPStorage").HAPStorage;' : ''}
`;
}

const HAP_STORAGE = `'use strict';
exports.HAPStorage = { setCustomStoragePath: p => { globalThis.__hamTest.hapStoragePath = p; } };
`;

/** Server stand-in, `hapImport` is the import of HAP-NodeJS of the respective module format */
function serverClass(hapImport) {
    return `class Server {
    constructor(options) {
        globalThis.__hamTest.serverOptions = options;
        globalThis.__hamTest.hap = hap;
        this.config = { bridge: { name: 'HB2 Bridge' } };
        this.serverStatus = 'pending';
        this.bridgeService = {
            bridge: new hap.Bridge('original', 'original'),
            api: { on() {} },
            handlePublishExternalAccessories: async () => {},
            saveCachedPlatformAccessoriesOnDisk: () => {
                globalThis.__hamTest.saved = true;
            },
        };
    }
    setServerStatus() {}
    async start() {
        if (globalThis.__hamTest.failStart) {
            throw new Error('start failed');
        }
        globalThis.__hamTest.startedWith = this.bridgeService.bridge;
    }
    teardown() {
        globalThis.__hamTest.teardown = true;
    }
}
${hapImport}`;
}

const USER_CLASS = `class User {
    static setStoragePath(...segments) {
        globalThis.__hamTest.storagePath = segments.join('/');
        User.path = segments.join('/');
    }
    static persistPath() {
        return User.path + '/persist';
    }
}`;

/** Homebridge 2 installed into node_modules (like the local mode): ESM in dist/, @homebridge/hap-nodejs next to it */
function createHomebridge2(dir) {
    writeFiles(path.join(dir, 'node_modules'), {
        'homebridge/package.json': { name: 'homebridge', version: '2.4.0', type: 'module' },
        'homebridge/dist/user.js': `export ${USER_CLASS}
`,
        'homebridge/dist/logger.js': `export class Logger {
    static setDebugEnabled(enabled = true) {
        globalThis.__hamTest.debug = enabled;
    }
}
`,
        'homebridge/dist/server.js': `import hap from '@homebridge/hap-nodejs';
export ${serverClass('')}`,
        '@homebridge/hap-nodejs/package.json': { name: '@homebridge/hap-nodejs', version: '2.2.2', main: 'dist/index.js' },
        '@homebridge/hap-nodejs/dist/index.js': hapIndex(true),
        '@homebridge/hap-nodejs/dist/lib/model/HAPStorage.js': HAP_STORAGE,
    });
}

/** Homebridge 1 (global installation): CommonJS in lib/, hap-nodejs in its own node_modules */
function createHomebridge1(dir, withHap = true) {
    const files = {
        'homebridge/package.json': { name: 'homebridge', version: '1.5.0' },
        'homebridge/lib/user.js': `'use strict';
${USER_CLASS}
exports.User = User;
`,
        'homebridge/lib/logger.js': `'use strict';
exports.setDebugEnabled = enabled => {
    globalThis.__hamTest.debug = enabled;
};
`,
        'homebridge/lib/server.js': `'use strict';
${serverClass("const hap = require('hap-nodejs');")}
exports.Server = Server;
`,
    };
    if (withHap) {
        Object.assign(files, {
            'homebridge/node_modules/hap-nodejs/package.json': { name: 'hap-nodejs', version: '0.10.2', main: 'dist/index.js' },
            'homebridge/node_modules/hap-nodejs/dist/index.js': hapIndex(false),
            'homebridge/node_modules/hap-nodejs/dist/lib/model/HAPStorage.js': HAP_STORAGE,
        });
    }
    writeFiles(dir, files);
}

/**
 * Prepares a GlobalHandler like init() does, but without loading Homebridge from disk,
 * and returns an instance of its intercepted bridge.
 */
function createHandler(overrides = {}) {
    const { config, calls } = createHandlerConfig(overrides);
    const handler = new GlobalHandler();
    handler.config = config;
    handler.logger = config.logger;
    handler.mapper = new Mapper(config.forbiddenCharacters);
    handler.miniQueue = new MiniQueue(config.timers);
    const Bridge = handler.createInterceptedBridge(FakeBridge);
    const bridge = new Bridge('Test-Bridge', 'serial');
    handler.server = { bridgeService: { bridge } };
    return { handler, bridge, calls, config };
}

async function addLamp(bridge, calls, lamp = createLamp(HapTypes)) {
    const count = calls.updateDev.length;
    bridge.addBridgedAccessory(lamp);
    await waitFor(() => calls.updateDev.length > count && calls.setState.length >= 3);
    await flush();
    return lamp;
}

function setValue(handler, id, value) {
    return new Promise(resolve => {
        void handler.setValueForCharId(id, value, (err, val) => resolve({ err, val }));
    });
}

describe('GlobalHandler', () => {
    describe('intercepted bridge', () => {
        it('is a subclass of the bridge of the loaded Homebridge', () => {
            const { bridge } = createHandler();
            assert.ok(bridge instanceof FakeBridge);
            assert.strictEqual(bridge.displayName, 'Test-Bridge');
            assert.strictEqual(bridge.serialNumber, 'serial');
        });

        it('calls the original publish() and returns its result', () => {
            const { bridge } = createHandler();
            assert.strictEqual(bridge.publish({ username: 'AA' }, true), 'published', 'Homebridge 2 needs the promise');
            assert.deepStrictEqual(bridge.published, [{ info: { username: 'AA' }, allowInsecureRequest: true }]);
        });

        it('calls the original addBridgedAccessory() and returns its result', () => {
            const { bridge } = createHandler();
            const lamp = createLamp(HapTypes);
            assert.strictEqual(bridge.addBridgedAccessory(lamp, true), lamp);
            assert.deepStrictEqual(bridge.bridged, [{ accessory: lamp, deferUpdate: true }]);
        });
    });

    it('creates device, channels and states and reads the current values', async () => {
        const { bridge, calls } = createHandler();
        await addLamp(bridge, calls);
        assert.deepStrictEqual(calls.updateDev, [['Lamp', 'Lamp', 5, 'lamp-uuid']]);
        assert.deepStrictEqual(
            calls.updateChannel.map(c => c[1]),
            ['Accessory-Information', 'Lamp'],
        );
        assert.deepStrictEqual(
            calls.updateState.map(s => `${s[0]}.${s[1]}.${s[2]}`),
            ['Lamp.Accessory-Information.Manufacturer', 'Lamp.Accessory-Information.Identify', 'Lamp.Lamp.On', 'Lamp.Lamp.Brightness'],
        );
        // the current values are read with handleGetRequest() after the state objects were created
        assert.deepStrictEqual(calls.setState, [
            ['Lamp', 'Accessory-Information', 'Manufacturer', 'ACME'],
            ['Lamp', 'Lamp', 'On', false],
            ['Lamp', 'Lamp', 'Brightness', 50],
        ]);
    });

    it('skips the Accessory-Information service if configured', async () => {
        const { bridge, calls } = createHandler({ ignoreInfoAccessoryServices: true });
        bridge.addBridgedAccessory(createLamp(HapTypes));
        await waitFor(() => calls.setState.length >= 2);
        await flush();
        assert.deepStrictEqual(
            calls.updateChannel.map(c => c[1]),
            ['Lamp'],
        );
        assert.strictEqual(calls.setState.length, 2);
    });

    it('logs and skips values that cannot be read', async () => {
        const { bridge, calls } = createHandler();
        const lamp = createLamp(HapTypes);
        lamp.services[1].characteristics[1].getValueError = new Error('device offline');
        bridge.addBridgedAccessory(lamp);
        await waitFor(() => calls.setState.length >= 2);
        await flush();
        assert.ok(!calls.setState.some(s => s[2] === 'Brightness'));
        assert.ok(calls.log.some(l => l.level === 'warn' && /device offline/.test(l.message)));
    });

    describe('HAP-NodeJS < 0.9 (getValue with callback)', () => {
        it('reads the current values', async () => {
            const { bridge, calls } = createHandler();
            await addLamp(bridge, calls, useGetValueCallback(createLamp(HapTypes)));
            assert.deepStrictEqual(
                calls.setState.map(s => s[3]),
                ['ACME', false, 50],
            );
        });

        it('logs and skips values that cannot be read', async () => {
            const { bridge, calls } = createHandler();
            const lamp = useGetValueCallback(createLamp(HapTypes));
            lamp.services[1].characteristics[1].getValueError = 'device offline';
            bridge.addBridgedAccessory(lamp);
            await waitFor(() => calls.setState.length >= 2);
            await flush();
            assert.ok(!calls.setState.some(s => s[2] === 'Brightness'));
            assert.ok(calls.log.some(l => l.level === 'warn' && /device offline/.test(l.message)));
        });

        it('polls the values', async () => {
            const { bridge, calls } = createHandler();
            const lamp = await addLamp(bridge, calls, useGetValueCallback(createLamp(HapTypes)));
            lamp.services[1].characteristics[1].currentValue = 70;
            assert.strictEqual(await bridge.___pollAccessoryServiceCharacteristic(lamp, 'Lamp', 'Brightness'), 70);
            assert.deepStrictEqual(calls.setState.at(-1), ['Lamp', 'Lamp', 'Brightness', 70]);
        });
    });

    describe('characteristic change events', () => {
        it('writes changed values', async () => {
            const { bridge, calls } = createHandler();
            const lamp = await addLamp(bridge, calls);
            calls.setState.length = 0;
            const service = lamp.services[1];
            lamp.emit('service-characteristic-change', {
                service,
                characteristic: service.characteristics[0],
                oldValue: false,
                newValue: true,
            });
            await flush();
            assert.deepStrictEqual(calls.setState, [['Lamp', 'Lamp', 'On', true]]);
        });

        it('ignores the same value within 2 seconds', async () => {
            const { bridge, calls } = createHandler();
            const lamp = await addLamp(bridge, calls);
            calls.setState.length = 0;
            const service = lamp.services[1];
            const event = { service, characteristic: service.characteristics[0], oldValue: false, newValue: true };
            lamp.emit('service-characteristic-change', event);
            lamp.emit('service-characteristic-change', event);
            lamp.emit('service-characteristic-change', { ...event, oldValue: true, newValue: false });
            await flush();
            assert.deepStrictEqual(
                calls.setState.map(s => s[3]),
                [true, false],
            );
        });

        it('writes null if a known value disappears', async () => {
            const { bridge, calls } = createHandler();
            const lamp = await addLamp(bridge, calls);
            const service = lamp.services[1];
            const characteristic = service.characteristics[0];
            lamp.emit('service-characteristic-change', { service, characteristic, oldValue: false, newValue: true });
            await flush();
            calls.setState.length = 0;
            lamp.emit('service-characteristic-change', { service, characteristic, oldValue: true, newValue: undefined });
            await flush();
            assert.deepStrictEqual(calls.setState, [['Lamp', 'Lamp', 'On', null]]);
        });

        it('registers the event listener only once per accessory', async () => {
            const { bridge, calls } = createHandler();
            const lamp = await addLamp(bridge, calls);
            await bridge.___wrapperAccessoryLogic(lamp, false, true);
            await bridge.___wrapperAccessoryLogic(lamp);
            assert.strictEqual(lamp.listenerCount(), 1);
        });
    });

    describe('polling', () => {
        async function startPolling() {
            const timers = createManualTimers();
            const ctx = createHandler({ timers, characteristicPollingInterval: 30000 });
            const lamp = createLamp(HapTypes);
            ctx.bridge.addBridgedAccessory(lamp);
            // 1 s start delay of the queue
            timers.tick();
            await waitFor(() => ctx.calls.setState.length >= 3);
            await flush();
            ctx.calls.setState.length = 0;
            return { ...ctx, timers, lamp };
        }

        it('polls every readable characteristic with the configured interval', async () => {
            const { timers } = await startPolling();
            assert.strictEqual(timers.pending.length, 3); // not the write-only Identify
            assert.ok(timers.pending.every(t => t.ms === 30000));
        });

        it('writes only changed values and schedules the next poll', async () => {
            const { timers, lamp, calls } = await startPolling();
            // first poll: no value known from polling yet -> all are written
            timers.tick();
            await flush();
            assert.strictEqual(calls.setState.length, 3);
            assert.strictEqual(timers.pending.length, 3);

            calls.setState.length = 0;
            lamp.services[1].characteristics[1].currentValue = 80;
            timers.tick();
            await flush();
            assert.deepStrictEqual(calls.setState, [['Lamp', 'Lamp', 'Brightness', 80]]);
        });

        it('does not poll without interval', async () => {
            const { bridge, calls, config } = createHandler();
            await addLamp(bridge, calls);
            assert.strictEqual(config.characteristicPollingInterval, 0);
        });

        it('restarts the polling of an accessory that is added again', async () => {
            const { timers, bridge, lamp } = await startPolling();
            await bridge.___wrapperAccessoryLogic(lamp);
            assert.strictEqual(timers.cleared.length, 3);
            assert.strictEqual(timers.pending.length, 3);
        });

        it('stops the polling of a removed accessory', async () => {
            const { timers, bridge, lamp } = await startPolling();
            bridge.___wrapperAccessoryRemoveLogic(lamp);
            assert.strictEqual(timers.pending.length, 0);
        });
    });

    describe('setValueForCharId', () => {
        it('sets the value and polls the service', async () => {
            const { handler, bridge, calls } = createHandler();
            const lamp = await addLamp(bridge, calls);
            const brightness = lamp.services[1].characteristics[1];
            const getValueCalls = brightness.getValueCalls;
            const result = await setValue(handler, 'Lamp.Lamp.Brightness', 70);
            assert.deepStrictEqual(result, { err: null, val: 70 });
            assert.deepStrictEqual(brightness.setValues, [70]);
            await flush();
            assert.ok(brightness.getValueCalls > getValueCalls, 'the service is polled after setting');
        });

        it('does not set read-only characteristics', async () => {
            const { handler, bridge, calls } = createHandler();
            await addLamp(bridge, calls);
            const result = await setValue(handler, 'Lamp.Accessory-Information.Manufacturer', 'X');
            assert.match(String(result.err), /not available for setValue/);
        });

        it('cannot set values of a removed accessory', async () => {
            const { handler, bridge, calls } = createHandler();
            const lamp = await addLamp(bridge, calls);
            bridge.___wrapperAccessoryRemoveLogic(lamp);
            const result = await setValue(handler, 'Lamp.Lamp.On', true);
            assert.match(String(result.err), /not available for setValue/);
        });

        it('reports a service that does not exist anymore', async () => {
            const { handler, bridge, calls } = createHandler();
            const lamp = await addLamp(bridge, calls);
            lamp.services = [lamp.services[0]];
            const result = await setValue(handler, 'Lamp.Lamp.On', true);
            assert.match(String(result.err), /Service to set id .* not existing anymore/);
        });
    });

    describe('poll helpers of the bridge', () => {
        it('finds services and characteristics by name or UUID', async () => {
            const { bridge, calls } = createHandler();
            const lamp = await addLamp(bridge, calls);
            assert.strictEqual(await bridge.___pollAccessoryServiceCharacteristic(lamp, 'Lamp', 'Brightness'), 50);
            assert.strictEqual(
                await bridge.___pollAccessoryServiceCharacteristic(lamp, HapTypes.LIGHTBULB_STYPE, HapTypes.POWER_STATE_CTYPE),
                false,
            );
            assert.strictEqual(await bridge.___pollAccessoryServiceCharacteristic(lamp, 'Unknown', 'On'), undefined);
            assert.strictEqual(await bridge.___pollAccessoryServiceCharacteristic(lamp, 'Lamp', 'Unknown'), undefined);
        });

        it('polls all services of an accessory', async () => {
            const { bridge, calls } = createHandler();
            const lamp = await addLamp(bridge, calls);
            const before = lamp.services.flatMap(s => s.characteristics).map(c => c.getValueCalls);
            await bridge.___pollAccessory(lamp);
            const after = lamp.services.flatMap(s => s.characteristics).map(c => c.getValueCalls);
            // all except the write-only Identify (index 1)
            assert.deepStrictEqual(
                after,
                before.map((n, i) => (i === 1 ? n : n + 1)),
            );
        });

        it('does not read write-only characteristics (HAP-NodeJS >= 1.0 rejects that)', async () => {
            const { bridge, calls } = createHandler();
            const lamp = await addLamp(bridge, calls);
            const identify = lamp.services[0].characteristics[1];
            identify.getValueError = new Error('-70405');
            assert.strictEqual(
                await bridge.___pollAccessoryServiceCharacteristic(lamp, 'Accessory Information', 'Identify'),
                undefined,
            );
            assert.strictEqual(identify.getValueCalls, 0);
            assert.ok(!calls.log.some(l => l.level === 'warn'));
        });
    });

    describe('init() and start() with a Homebridge installation', () => {
        let tmpDir;

        before(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-hb-'));
            createHomebridge2(path.join(tmpDir, 'hb2'));
            createHomebridge1(path.join(tmpDir, 'hb1'));
            createHomebridge1(path.join(tmpDir, 'nohap'), false);
        });

        after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

        beforeEach(() => {
            globalThis.__hamTest = {};
        });

        afterEach(() => {
            delete globalThis.__hamTest;
        });

        it('loads Homebridge 2 (ES module) and its @homebridge/hap-nodejs', async () => {
            const { config } = createHandlerConfig({ debugModeEnabled: true, insecureAccess: true });
            const handler = new GlobalHandler();
            await handler.init({
                ...config,
                homebridgeBasePath: path.join(tmpDir, 'hb2', 'node_modules', 'homebridge'),
                homebridgeConfigPath: path.join(tmpDir, 'config2'),
            });
            const state = globalThis.__hamTest;
            assert.strictEqual(state.storagePath, path.join(tmpDir, 'config2'));
            assert.strictEqual(state.debug, true, 'the static Logger.setDebugEnabled() is used');

            handler.start();
            await flush();
            assert.deepStrictEqual(state.serverOptions, { insecureAccess: true });
            assert.strictEqual(state.hapStoragePath, `${path.join(tmpDir, 'config2')}/persist`);
            assert.strictEqual(state.hap, handler.hap, 'Homebridge and the adapter use the same HAP-NodeJS');
            const bridge = state.startedWith;
            assert.ok(bridge instanceof state.hap.Bridge);
            assert.strictEqual(typeof bridge.___wrapperAccessoryLogic, 'function', 'the bridge is intercepted');
            assert.strictEqual(bridge.displayName, 'HB2 Bridge');
            assert.strictEqual(bridge.serialNumber, 'uuid-HomeBridge');
            handler.end();
            assert.strictEqual(state.teardown, true);
            assert.strictEqual(state.saved, true);
        });

        it('loads Homebridge 1 (CommonJS) and its hap-nodejs', async () => {
            const { config } = createHandlerConfig({ debugModeEnabled: true });
            const handler = new GlobalHandler();
            await handler.init({
                ...config,
                homebridgeBasePath: path.join(tmpDir, 'hb1', 'homebridge'),
                homebridgeConfigPath: path.join(tmpDir, 'config1'),
            });
            const state = globalThis.__hamTest;
            assert.strictEqual(state.debug, true, 'the exported setDebugEnabled() is used');

            handler.start();
            await flush();
            assert.deepStrictEqual(state.serverOptions, { insecureAccess: false });
            assert.strictEqual(state.hapStoragePath, `${path.join(tmpDir, 'config1')}/persist`, 'HAPStorage from lib/model');
            assert.strictEqual(state.hap, handler.hap);
            assert.strictEqual(typeof state.startedWith.___wrapperAccessoryLogic, 'function');
        });

        it('logs an error of the asynchronous start', async () => {
            const { config, calls } = createHandlerConfig();
            const handler = new GlobalHandler();
            await handler.init({
                ...config,
                homebridgeBasePath: path.join(tmpDir, 'hb2', 'node_modules', 'homebridge'),
                homebridgeConfigPath: path.join(tmpDir, 'config2'),
            });
            globalThis.__hamTest.failStart = true;
            handler.start();
            await flush();
            assert.ok(calls.log.some(l => l.level === 'warn' && /Cannot start Homebridge: .*start failed/.test(l.message)));
        });

        it('cannot start without HAP-NodeJS', async () => {
            const { config, calls } = createHandlerConfig();
            const handler = new GlobalHandler();
            await handler.init({
                ...config,
                homebridgeBasePath: path.join(tmpDir, 'nohap', 'homebridge'),
                homebridgeConfigPath: path.join(tmpDir, 'config3'),
            });
            assert.ok(calls.log.some(l => l.level === 'warn' && /HAP-NodeJS not found/.test(l.message)));
            assert.throws(() => handler.start(), /could not be loaded/);
        });
    });

    it('start() fails if Homebridge was not loaded', () => {
        assert.throws(() => new GlobalHandler().start(), /could not be loaded/);
    });

    it('end() without start does not throw', () => {
        const { handler } = createHandler();
        handler.server = null;
        assert.doesNotThrow(() => handler.end());
    });
});
