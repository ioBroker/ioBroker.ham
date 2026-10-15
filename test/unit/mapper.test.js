'use strict';

const assert = require('node:assert');
const { requireBuild, createCharacteristic, HAP_BASE_UUID } = require('./helpers');

const { Mapper } = requireBuild('lib/mapper.js');
const { HapTypes } = require('./helpers').installFakeWrapper();

const FORBIDDEN_CHARS = /[^._\-/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]+/gu;

function char(props, UUID = 'custom-uuid', extra = {}) {
    return createCharacteristic({ UUID, displayName: 'X', value: null, props, ...extra });
}

describe('Mapper', () => {
    let mapper;
    beforeEach(() => {
        mapper = new Mapper(FORBIDDEN_CHARS);
    });

    describe('mapAccessoryUUID', () => {
        it('uses the sanitized display name', () => {
            // "[" and "]*" are forbidden for ioBroker (a run becomes one "-"), space and dot are replaced afterwards
            assert.strictEqual(mapper.mapAccessoryUUID('uuid-1', 'Living room.Lamp [1]*'), 'Living-room-Lamp--1-');
        });

        it('replaces the characters forbidden by ioBroker', () => {
            assert.strictEqual(mapper.mapAccessoryUUID('uuid-1', 'Lamp°§'), 'Lamp-');
        });

        it('uses the UUID if there is no name', () => {
            assert.strictEqual(mapper.mapAccessoryUUID('uuid-1'), 'uuid-1');
        });

        it('returns the same ID for the same UUID, even with another name', () => {
            const first = mapper.mapAccessoryUUID('uuid-1', 'Lamp');
            assert.strictEqual(mapper.mapAccessoryUUID('uuid-1', 'Renamed'), first);
        });

        it('appends the UUID if two accessories have the same name', () => {
            assert.strictEqual(mapper.mapAccessoryUUID('uuid-1', 'Lamp'), 'Lamp');
            assert.strictEqual(mapper.mapAccessoryUUID('uuid-2', 'Lamp'), 'Lamp-uuid-2');
        });

        it('keeps the IDs of existing accessories (registered at start) before new ones', () => {
            // as registerExistingAccessory() does at start with the stored device objects
            mapper.mapAccessoryUUID('uuid-2', 'Lamp');
            assert.strictEqual(mapper.mapAccessoryUUID('uuid-1', 'Lamp'), 'Lamp-uuid-1');
            assert.strictEqual(mapper.mapAccessoryUUID('uuid-2', 'Lamp'), 'Lamp');
        });
    });

    describe('mapServiceType', () => {
        it('uses the sanitized display name', () => {
            assert.strictEqual(mapper.mapServiceType(HapTypes.LIGHTBULB_STYPE, 'Accessory Information'), 'Accessory-Information');
        });

        it('uses the known service names without display name', () => {
            assert.strictEqual(mapper.mapServiceType(HapTypes.LIGHTBULB_STYPE), 'Lightbulb');
            assert.strictEqual(mapper.mapServiceType(HapTypes.ACCESSORY_INFORMATION_STYPE), 'Accessory-Information');
        });

        it('shortens unknown HAP UUIDs', () => {
            assert.strictEqual(mapper.mapServiceType(`000000FF${HAP_BASE_UUID}`), '000000FF');
        });

        it('keeps other UUIDs', () => {
            assert.strictEqual(mapper.mapServiceType('my-own-service'), 'my-own-service');
        });
    });

    describe('mapCharacteristicType', () => {
        it('uses the sanitized display name', () => {
            assert.strictEqual(mapper.mapCharacteristicType('s', HapTypes.BRIGHTNESS_CTYPE, 'Current Temp.'), 'Current-Temp-');
        });

        it('uses the known characteristic names without display name', () => {
            assert.strictEqual(mapper.mapCharacteristicType('s', HapTypes.BRIGHTNESS_CTYPE), 'Brightness');
            assert.strictEqual(mapper.mapCharacteristicType('s', HapTypes.POWER_STATE_CTYPE), 'Power-State');
        });

        it('shortens unknown HAP UUIDs and keeps other UUIDs', () => {
            assert.strictEqual(mapper.mapCharacteristicType('s', `000000FE${HAP_BASE_UUID}`), '000000FE');
            assert.strictEqual(mapper.mapCharacteristicType('s', 'custom'), 'custom');
        });
    });

    describe('mapCharacteristicProperties', () => {
        it('maps a read/write boolean to a switch', () => {
            const common = mapper.mapCharacteristicProperties(char({ format: 'bool', perms: ['pr', 'pw', 'ev'] }));
            assert.deepStrictEqual(common, { type: 'boolean', read: true, write: true, role: 'switch' });
        });

        it('maps a read-only boolean to a sensor and a write-only boolean to a button', () => {
            assert.strictEqual(mapper.mapCharacteristicProperties(char({ format: 'bool', perms: ['pr'] })).role, 'sensor');
            assert.strictEqual(mapper.mapCharacteristicProperties(char({ format: 'bool', perms: ['pw'] })).role, 'button');
        });

        it('maps numbers to value (read-only) or level (writable)', () => {
            assert.strictEqual(mapper.mapCharacteristicProperties(char({ format: 'float', perms: ['pr'] })).role, 'value');
            assert.strictEqual(mapper.mapCharacteristicProperties(char({ format: 'float', perms: ['pr', 'pw'] })).role, 'level');
            assert.strictEqual(mapper.mapCharacteristicProperties(char({ format: 'float', perms: ['pw'] })).role, 'level');
        });

        it('maps strings and unknown formats to text', () => {
            assert.deepStrictEqual(mapper.mapCharacteristicProperties(char({ format: 'string', perms: ['pr'] })), {
                type: 'string',
                read: true,
                write: false,
                role: 'text',
            });
            assert.strictEqual(mapper.mapCharacteristicProperties(char({ format: 'tlv8', perms: ['pr'] })).type, 'string');
            assert.strictEqual(mapper.mapCharacteristicProperties(char({ format: 'unknown', perms: ['pr'] })).type, 'string');
        });

        it('makes characteristics without read and write permission readable', () => {
            const common = mapper.mapCharacteristicProperties(char({ format: 'bool', perms: ['ev'] }));
            assert.strictEqual(common.read, true);
            assert.strictEqual(common.write, false);
        });

        it('maps the HomeKit units and keeps unknown units', () => {
            assert.strictEqual(mapper.mapCharacteristicProperties(char({ format: 'float', perms: ['pr'], unit: 'celsius' })).unit, '°C');
            assert.strictEqual(mapper.mapCharacteristicProperties(char({ format: 'int', perms: ['pr'], unit: 'percentage' })).unit, '%');
            assert.strictEqual(mapper.mapCharacteristicProperties(char({ format: 'float', perms: ['pr'], unit: 'ppm' })).unit, 'ppm');
            assert.strictEqual(mapper.mapCharacteristicProperties(char({ format: 'float', perms: ['pr'] })).unit, undefined);
        });

        it('takes min and max from the props', () => {
            const common = mapper.mapCharacteristicProperties(char({ format: 'float', perms: ['pr'], minValue: -10, maxValue: 40 }));
            assert.strictEqual(common.min, -10);
            assert.strictEqual(common.max, 40);
        });

        it('fills min and max from the integer formats', () => {
            const int = mapper.mapCharacteristicProperties(char({ format: 'int', perms: ['pr'] }));
            assert.deepStrictEqual([int.min, int.max], [-2147483648, 2147483647]);
            const uint8 = mapper.mapCharacteristicProperties(char({ format: 'uint8', perms: ['pr'] }));
            assert.deepStrictEqual([uint8.min, uint8.max], [0, 255]);
            const uint16 = mapper.mapCharacteristicProperties(char({ format: 'uint16', perms: ['pr'] }));
            assert.deepStrictEqual([uint16.min, uint16.max], [0, 65535]);
            const uint32 = mapper.mapCharacteristicProperties(char({ format: 'uint32', perms: ['pr'], maxValue: 10 }));
            assert.deepStrictEqual([uint32.min, uint32.max], [0, 10]);
            const float = mapper.mapCharacteristicProperties(char({ format: 'float', perms: ['pr'] }));
            assert.deepStrictEqual([float.min, float.max], [undefined, undefined]);
        });

        it('writes the valid values as states', () => {
            const common = mapper.mapCharacteristicProperties(char({ format: 'uint8', perms: ['pr', 'pw'] }, 'c', { validValues: [0, 1, 3] }));
            assert.deepStrictEqual(common.states, { 0: '0', 1: '1', 3: '3' });
        });

        it('ignores valid values of booleans', () => {
            const common = mapper.mapCharacteristicProperties(char({ format: 'bool', perms: ['pr'] }, 'c', { validValues: [0, 1] }));
            assert.strictEqual(common.states, undefined);
        });

        it('adds the role details of known characteristics', () => {
            const brightness = char({ format: 'int', perms: ['pr', 'pw'] }, HapTypes.BRIGHTNESS_CTYPE);
            assert.strictEqual(mapper.mapCharacteristicProperties(brightness).role, 'level.brightness');
            const temperature = char({ format: 'float', perms: ['pr'] }, HapTypes.CURRENT_TEMPERATURE_CTYPE);
            assert.strictEqual(mapper.mapCharacteristicProperties(temperature).role, 'value.temperature');
        });

        it('ignores role details that are full roles (current behaviour)', () => {
            // The table maps Outlet-In-Use to "indicator.working", but only details starting with "." (appended) or
            // without any "." (replacing the role) are used, so the role stays "sensor".
            const outletInUse = char({ format: 'bool', perms: ['pr'] }, HapTypes.OUTLET_IN_USE_CTYPE);
            assert.strictEqual(mapper.mapCharacteristicProperties(outletInUse).role, 'sensor');
        });
    });
});
