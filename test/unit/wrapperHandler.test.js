'use strict';

const assert = require('node:assert');
const { requireBuild, createLamp, createHandlerConfig, waitFor, flush, FakeWrapper } = require('./helpers');

const { WrapperHandler } = requireBuild('lib/wrapper-handler.js');
const { HapTypes } = require('./helpers').installFakeWrapper();

/** Starts a handler with a lamp and waits until its objects are created */
async function startWithLamp(overrides) {
    const { config, calls } = createHandlerConfig(overrides);
    const handler = new WrapperHandler();
    handler.init(config);
    handler.start();
    const wrapper = FakeWrapper.last;
    const lamp = createLamp(HapTypes);
    wrapper.emit('addAccessory', lamp);
    await waitFor(() => calls.updateState.length >= (config.ignoreInfoAccessoryServices ? 2 : 4));
    await flush();
    return { handler, wrapper, lamp, calls, config };
}

function setValue(handler, id, value) {
    return new Promise(resolve => {
        void handler.setValueForCharId(id, value, (err, val) => resolve({ err, val }));
    });
}

describe('WrapperHandler', () => {
    it('passes the options to the wrapper without the timers', () => {
        const { config } = createHandlerConfig({ wrapperConfig: { platforms: [] }, customPluginPath: '/opt/iobroker/node_modules/iobroker.ham/node_modules' });
        const handler = new WrapperHandler();
        handler.init(config);
        const options = FakeWrapper.last.options;
        assert.strictEqual(options.timers, undefined);
        assert.deepStrictEqual(options.wrapperConfig, { platforms: [] });
        assert.strictEqual(options.homebridgeConfigPath, config.homebridgeConfigPath);
        assert.strictEqual(options.customPluginPath, '/opt/iobroker/node_modules/iobroker.ham/node_modules');
        assert.strictEqual(FakeWrapper.last.initialized, false);
        handler.start();
        assert.strictEqual(FakeWrapper.last.initialized, true);
    });

    it('passes an empty config to the wrapper if there is none', () => {
        const { config } = createHandlerConfig();
        new WrapperHandler().init(config);
        assert.deepStrictEqual(FakeWrapper.last.options.wrapperConfig, {});
    });

    it('creates device, channels and states for a new accessory', async () => {
        const { calls } = await startWithLamp();
        assert.deepStrictEqual(calls.updateDev, [['Lamp', 'Lamp', 5, 'lamp-uuid']]);
        assert.deepStrictEqual(
            calls.updateChannel.map(c => c.slice(0, 3)),
            [
                ['Lamp', 'Accessory-Information', 'Accessory Information'],
                ['Lamp', 'Lamp', 'Lamp'],
            ],
        );
        const states = calls.updateState.map(([dev, ch, st, name, value, common]) => ({
            id: `${dev}.${ch}.${st}`,
            name,
            value,
            role: common.role,
            type: common.type,
        }));
        assert.deepStrictEqual(states, [
            { id: 'Lamp.Accessory-Information.Manufacturer', name: 'Manufacturer', value: 'ACME', role: 'text', type: 'string' },
            { id: 'Lamp.Accessory-Information.Identify', name: 'Identify', value: false, role: 'button', type: 'boolean' },
            { id: 'Lamp.Lamp.On', name: 'On', value: false, role: 'switch', type: 'boolean' },
            { id: 'Lamp.Lamp.Brightness', name: 'Brightness', value: 50, role: 'level.brightness', type: 'number' },
        ]);
    });

    it('skips the Accessory-Information service if configured', async () => {
        const { calls, wrapper, lamp } = await startWithLamp({ ignoreInfoAccessoryServices: true });
        assert.deepStrictEqual(
            calls.updateChannel.map(c => c[1]),
            ['Lamp'],
        );
        wrapper.emit('characteristic-value-change', {
            accessory: lamp,
            service: lamp.services[0],
            characteristic: lamp.services[0].characteristics[0],
            oldValue: 'ACME',
            newValue: 'Other',
        });
        await flush();
        assert.deepStrictEqual(calls.setState, []);
    });

    it('treats an updated accessory like a new one', async () => {
        const { calls, wrapper, lamp } = await startWithLamp();
        wrapper.emit('updateAccessory', lamp);
        await waitFor(() => calls.updateDev.length === 2);
        assert.deepStrictEqual(calls.updateDev[1], ['Lamp', 'Lamp', 5, 'lamp-uuid']);
    });

    it('handles external accessories', async () => {
        const { calls, wrapper } = await startWithLamp();
        wrapper.emit('addExternalAccessory', createLamp(HapTypes, 'cam-uuid', 'Camera'));
        await waitFor(() => calls.updateDev.length === 2);
        assert.deepStrictEqual(calls.updateDev[1], ['Camera', 'Camera', 5, 'cam-uuid']);
    });

    it('gives two accessories with the same name different IDs', async () => {
        const { calls, wrapper } = await startWithLamp();
        wrapper.emit('addAccessory', createLamp(HapTypes, 'lamp-2', 'Lamp'));
        await waitFor(() => calls.updateDev.length === 2);
        assert.strictEqual(calls.updateDev[1][0], 'Lamp-lamp-2');
    });

    it('keeps the ID of a known accessory registered at start', async () => {
        const { config, calls } = createHandlerConfig();
        const handler = new WrapperHandler();
        handler.init(config);
        handler.registerExistingAccessory('lamp-2', 'Lamp');
        FakeWrapper.last.emit('addAccessory', createLamp(HapTypes, 'lamp-1', 'Lamp'));
        FakeWrapper.last.emit('addAccessory', createLamp(HapTypes, 'lamp-2', 'Lamp'));
        await waitFor(() => calls.updateDev.length === 2);
        assert.deepStrictEqual(
            calls.updateDev.map(d => d[0]),
            ['Lamp-lamp-1', 'Lamp'],
        );
    });

    it('writes changed values', async () => {
        const { calls, wrapper, lamp } = await startWithLamp();
        const service = lamp.services[1];
        wrapper.emit('characteristic-value-change', {
            accessory: lamp,
            service,
            characteristic: service.characteristics[0],
            oldValue: false,
            newValue: true,
        });
        await flush();
        assert.deepStrictEqual(calls.setState, [['Lamp', 'Lamp', 'On', true]]);
    });

    it('writes null if a value disappears and ignores undefined values', async () => {
        const { calls, wrapper, lamp } = await startWithLamp();
        const service = lamp.services[1];
        const characteristic = service.characteristics[1];
        wrapper.emit('characteristic-value-change', { accessory: lamp, service, characteristic, oldValue: 50, newValue: undefined });
        wrapper.emit('characteristic-value-change', { accessory: lamp, service, characteristic, oldValue: undefined, newValue: undefined });
        await flush();
        assert.deepStrictEqual(calls.setState, [['Lamp', 'Lamp', 'Brightness', null]]);
    });

    it('sets the value of a writable characteristic and polls the service', async () => {
        const { handler, wrapper, lamp } = await startWithLamp();
        const result = await setValue(handler, 'Lamp.Lamp.On', true);
        assert.deepStrictEqual(result, { err: null, val: true });
        assert.deepStrictEqual(lamp.services[1].characteristics[0].setValues, [true]);
        await flush();
        assert.strictEqual(wrapper.polled.length, 1);
        assert.strictEqual(wrapper.polled[0].service, lamp.services[1]);
    });

    it('does not set read-only characteristics', async () => {
        const { handler, lamp } = await startWithLamp();
        const result = await setValue(handler, 'Lamp.Accessory-Information.Manufacturer', 'X');
        assert.match(String(result.err), /not available for setValue \(Accessory exists: unknown\)/);
        assert.deepStrictEqual(lamp.services[0].characteristics[0].setValues, []);
    });

    it('reports a service or characteristic that does not exist anymore', async () => {
        const { handler, lamp } = await startWithLamp();
        const bulb = lamp.services[1];
        bulb.characteristics = bulb.characteristics.filter(c => c.displayName !== 'Brightness');
        assert.match(String((await setValue(handler, 'Lamp.Lamp.Brightness', 10)).err), /Characteristic to set id .* not existing anymore/);
        lamp.services = [lamp.services[0]];
        assert.match(String((await setValue(handler, 'Lamp.Lamp.On', true)).err), /Service to set id .* not existing anymore/);
    });

    it('cannot set values of a removed accessory', async () => {
        const { handler, wrapper, lamp } = await startWithLamp();
        wrapper.emit('removeAccessory', lamp);
        const result = await setValue(handler, 'Lamp.Lamp.On', true);
        assert.match(String(result.err), /Accessory exists: false/);
    });

    it('stops processing on end()', async () => {
        const { config, calls } = createHandlerConfig();
        const handler = new WrapperHandler();
        handler.init(config);
        FakeWrapper.last.emit('addAccessory', createLamp(HapTypes));
        handler.end();
        await flush();
        assert.strictEqual(FakeWrapper.last.finished, true);
        assert.deepStrictEqual(calls.updateDev, []);
    });

    it('end() without init does not throw (unload before ready)', () => {
        assert.doesNotThrow(() => new WrapperHandler().end());
    });
});
