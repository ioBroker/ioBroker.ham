'use strict';

const assert = require('node:assert');
const { requireBuild } = require('./helpers');

const {
    customStringify,
    parseWrapperConfig,
    splitLibraries,
    getLibraryDir,
    isHomebridgeInstallNeeded,
    isEmptyValue,
    completeStateCommon,
} = requireBuild('lib/utils.js');

describe('utils', () => {
    describe('customStringify', () => {
        it('drops circular references', () => {
            const accessory = { name: 'Lamp', services: [] };
            accessory.services.push({ name: 'Bulb', accessory });
            assert.strictEqual(customStringify(accessory), '{"name":"Lamp","services":[{"name":"Bulb"}]}');
        });

        it('indents if requested', () => {
            assert.strictEqual(customStringify({ a: 1 }, null, 2), '{\n  "a": 1\n}');
        });
    });

    describe('parseWrapperConfig', () => {
        it('returns objects as they are', () => {
            const config = { platforms: [] };
            assert.strictEqual(parseWrapperConfig(config), config);
        });

        it('parses the JSON string of the JsonConfig editor', () => {
            assert.deepStrictEqual(parseWrapperConfig('{\n  "platforms": [{ "platform": "X" }]\n}'), {
                platforms: [{ platform: 'X' }],
            });
        });

        it('treats an empty string as empty config', () => {
            assert.deepStrictEqual(parseWrapperConfig(''), {});
        });

        it('throws on invalid JSON', () => {
            assert.throws(() => parseWrapperConfig('{ "platforms": '));
        });
    });

    describe('splitLibraries', () => {
        it('splits on spaces, commas and semicolons', () => {
            assert.deepStrictEqual(splitLibraries('a b,c;d'), ['a', 'b', 'c', 'd']);
        });

        it('treats several separators as one (the JsonConfig chips use two spaces)', () => {
            assert.deepStrictEqual(splitLibraries('homebridge-a  homebridge-b ,; homebridge-c'), [
                'homebridge-a',
                'homebridge-b',
                'homebridge-c',
            ]);
        });

        it('ignores leading and trailing separators', () => {
            assert.deepStrictEqual(splitLibraries(' homebridge-a, '), ['homebridge-a']);
            assert.deepStrictEqual(splitLibraries(' '), []);
        });

        it('keeps versions, scopes and URLs', () => {
            assert.deepStrictEqual(splitLibraries('a@1.2.3 @scope/b@2 https://host/c.tgz'), [
                'a@1.2.3',
                '@scope/b@2',
                'https://host/c.tgz',
            ]);
        });
    });

    describe('getLibraryDir', () => {
        it('removes the version', () => {
            assert.strictEqual(getLibraryDir('homebridge@1.5.0'), 'homebridge');
            assert.strictEqual(getLibraryDir('homebridge'), 'homebridge');
        });

        it('keeps the scope of scoped packages', () => {
            assert.strictEqual(getLibraryDir('@scope/plugin@2.0.0'), '@scope/plugin');
            assert.strictEqual(getLibraryDir('@scope/plugin'), '@scope/plugin');
        });
    });

    describe('isHomebridgeInstallNeeded', () => {
        it('installs if Homebridge is missing', () => {
            assert.strictEqual(isHomebridgeInstallNeeded(null, '1.5.0'), true);
        });

        it('does not install the same version again', () => {
            assert.strictEqual(isHomebridgeInstallNeeded('{"name":"homebridge","version":"1.5.0"}', '1.5.0'), false);
        });

        it('installs if another version is installed', () => {
            assert.strictEqual(isHomebridgeInstallNeeded('{"name":"homebridge","version":"1.4.1"}', '1.5.0'), true);
            assert.strictEqual(isHomebridgeInstallNeeded('{"name":"homebridge","version":"2.0.0"}', '1.5.0'), true);
        });

        it('installs if the package.json is broken', () => {
            assert.strictEqual(isHomebridgeInstallNeeded('', '1.5.0'), true);
            assert.strictEqual(isHomebridgeInstallNeeded('{"name":"homebridge"}', '1.5.0'), true);
        });
    });

    describe('isEmptyValue', () => {
        it('detects the values that are not stored before the object exists', () => {
            for (const value of [null, undefined, 0, false, '']) {
                assert.strictEqual(isEmptyValue(value), true, `${JSON.stringify(value)}`);
            }
        });

        it('accepts real values', () => {
            for (const value of [1, -1, true, 'on', 0.5]) {
                assert.strictEqual(isEmptyValue(value), false, `${JSON.stringify(value)}`);
            }
        });
    });

    describe('completeStateCommon', () => {
        it('fills all defaults', () => {
            assert.deepStrictEqual(completeStateCommon(undefined, 'On'), {
                name: 'On',
                role: 'state',
                read: true,
                type: 'string',
                unit: '',
            });
        });

        it('keeps the values of the mapper', () => {
            const common = { name: 'X', role: 'switch', read: false, write: true, type: 'boolean', unit: '%' };
            assert.deepStrictEqual(completeStateCommon({ ...common }, 'On'), common);
        });

        it('does not make write-only states readable', () => {
            const common = completeStateCommon({ write: true }, 'Identify');
            assert.strictEqual(common.read, undefined);
            assert.strictEqual(common.write, true);
        });
    });
});
