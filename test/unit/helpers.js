'use strict';

// Helpers for the unit tests. The tests run against the compiled code in build/, so `npm run build-backend` first.

const path = require('node:path');
const { EventEmitter } = require('node:events');

const BUILD = path.join(__dirname, '..', '..', 'build');
const HAP_BASE_UUID = '-0000-1000-8000-0026BB765291';

/** Fake of the Wrapper class of homebridge-plugin-wrapper; the last created instance is in `FakeWrapper.last` */
class FakeWrapper extends EventEmitter {
    constructor(options) {
        super();
        this.options = options;
        this.initialized = false;
        this.finished = false;
        this.polled = [];
        FakeWrapper.last = this;
    }
    init() {
        this.initialized = true;
    }
    finish() {
        this.finished = true;
    }
    async pollAccessoryService(accessory, service) {
        this.polled.push({ accessory, service });
    }
}

let realHapTypes;

/**
 * Replaces homebridge-plugin-wrapper in the require cache by a fake (with the real HAP types),
 * so that the handlers can be tested without starting Homebridge. Must be called before requiring build/.
 */
function installFakeWrapper() {
    const modulePath = require.resolve('homebridge-plugin-wrapper');
    if (!realHapTypes) {
        realHapTypes = require(modulePath).HapTypes;
    }
    require.cache[modulePath].exports = { Wrapper: FakeWrapper, HapTypes: realHapTypes };
    return { FakeWrapper, HapTypes: realHapTypes };
}

function requireBuild(file) {
    installFakeWrapper();
    return require(path.join(BUILD, file));
}

/** Timers that run all callbacks on the next tick (for the 1 s start delay of the queue) */
const immediateTimers = {
    setTimeout: cb => setTimeout(cb, 0),
    clearTimeout: t => clearTimeout(t),
};

/** Timers that only run when `tick()` is called; for the polling tests */
function createManualTimers() {
    let id = 0;
    const pending = new Map();
    return {
        cleared: [],
        setTimeout(cb, ms) {
            id++;
            pending.set(id, { cb, ms });
            return id;
        },
        clearTimeout(t) {
            this.cleared.push(t);
            pending.delete(t);
        },
        get pending() {
            return [...pending.values()];
        },
        /** runs all currently scheduled timers */
        tick() {
            const list = [...pending.entries()];
            pending.clear();
            list.forEach(([, t]) => t.cb());
        },
    };
}

function createCharacteristic(options) {
    const char = {
        UUID: options.UUID,
        displayName: options.displayName,
        value: options.value,
        props: { format: 'bool', perms: ['pr', 'pw'], ...options.props },
        currentValue: options.currentValue !== undefined ? options.currentValue : options.value,
        getValueError: null,
        setValues: [],
        getValueCalls: 0,
        listeners: {},
        on(event, listener) {
            (this.listeners[event] ||= []).push(listener);
        },
        // HAP-NodeJS >= 0.9 (the only way to read a value since HAP-NodeJS 1.0)
        async handleGetRequest() {
            this.getValueCalls++;
            if (this.getValueError) {
                throw this.getValueError;
            }
            return this.currentValue;
        },
        setValue(value, callback) {
            this.setValues.push(value);
            this.currentValue = value;
            callback && callback(null, value);
            return this;
        },
    };
    if (options.validValues) {
        char.props.validValues = options.validValues;
    }
    return char;
}

/** Turns the characteristics of an accessory into ones of HAP-NodeJS < 0.9, which have only getValue(callback) */
function useGetValueCallback(accessory) {
    for (const service of accessory.services) {
        for (const char of service.characteristics) {
            delete char.handleGetRequest;
            char.getValue = function (callback) {
                this.getValueCalls++;
                callback(this.getValueError, this.getValueError ? undefined : this.currentValue);
            };
        }
    }
    return accessory;
}

function createService(UUID, displayName, characteristics, subtype) {
    return { UUID, displayName, subtype, characteristics };
}

function createAccessory(UUID, displayName, services, category = 1) {
    const listeners = {};
    return {
        UUID,
        displayName,
        category,
        services,
        listenerCount: () => (listeners['service-characteristic-change'] || []).length,
        on(event, listener) {
            (listeners[event] ||= []).push(listener);
        },
        emit(event, data) {
            (listeners[event] || []).forEach(l => l(data));
        },
    };
}

/** A lamp with Accessory-Information (Manufacturer, Identify) and a Lightbulb service (On, Brightness) */
function createLamp(HapTypes, uuid = 'lamp-uuid', name = 'Lamp') {
    const info = createService(HapTypes.ACCESSORY_INFORMATION_STYPE, 'Accessory Information', [
        createCharacteristic({
            UUID: HapTypes.MANUFACTURER_CTYPE,
            displayName: 'Manufacturer',
            value: 'ACME',
            props: { format: 'string', perms: ['pr'] },
        }),
        createCharacteristic({
            UUID: HapTypes.IDENTIFY_CTYPE,
            displayName: 'Identify',
            value: false,
            props: { format: 'bool', perms: ['pw'] },
        }),
    ]);
    const bulb = createService(HapTypes.LIGHTBULB_STYPE, name, [
        createCharacteristic({
            UUID: HapTypes.POWER_STATE_CTYPE,
            displayName: 'On',
            value: false,
            props: { format: 'bool', perms: ['pr', 'pw', 'ev'] },
        }),
        createCharacteristic({
            UUID: HapTypes.BRIGHTNESS_CTYPE,
            displayName: 'Brightness',
            value: 50,
            props: { format: 'int', perms: ['pr', 'pw'], unit: 'percentage', minValue: 0, maxValue: 100 },
        }),
    ]);
    return createAccessory(uuid, name, [info, bulb], 5);
}

/** Handler config that records every call */
function createHandlerConfig(overrides = {}) {
    const calls = { updateDev: [], updateChannel: [], updateState: [], setState: [], log: [] };
    const log = level => message => calls.log.push({ level, message });
    const config = {
        logger: { info: log('info'), warn: log('warn'), debug: log('debug'), silly: log('silly') },
        timers: immediateTimers,
        homebridgeConfigPath: path.join(__dirname, 'tmp'),
        updateDev: async (...args) => {
            calls.updateDev.push(args);
        },
        updateChannel: async (...args) => {
            calls.updateChannel.push(args);
        },
        updateState: async (...args) => {
            calls.updateState.push(args);
        },
        setState: async (...args) => {
            calls.setState.push(args);
        },
        ignoreInfoAccessoryServices: false,
        characteristicPollingInterval: 0,
        insecureAccess: false,
        debugModeEnabled: false,
        forbiddenCharacters: /[^._\-/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]+/gu,
        ...overrides,
    };
    return { config, calls };
}

/** Waits until `check()` returns true (max. `timeout` ms) */
async function waitFor(check, timeout = 2000) {
    const end = Date.now() + timeout;
    while (!check()) {
        if (Date.now() > end) {
            throw new Error('Timeout in waitFor');
        }
        await new Promise(resolve => setTimeout(resolve, 5));
    }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 20));

module.exports = {
    HAP_BASE_UUID,
    FakeWrapper,
    installFakeWrapper,
    requireBuild,
    immediateTimers,
    createManualTimers,
    createCharacteristic,
    createService,
    createAccessory,
    useGetValueCallback,
    createLamp,
    createHandlerConfig,
    waitFor,
    flush,
};
