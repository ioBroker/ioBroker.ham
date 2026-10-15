import { describe, expect, it, vi } from 'vitest';
import { parseNative, serializeChanges } from './wrapperConfig';

describe('parseNative', () => {
    it('returns the native object if wrapperConfig is an object', () => {
        const native = { libraries: '', wrapperConfig: { platforms: [], accessories: [] } };
        expect(parseNative(native)).toBe(native);
    });

    it('parses the JSON string of the JsonConfig editor without changing the original', () => {
        const native = { libraries: 'a', wrapperConfig: '{ "platforms": [{ "platform": "P" }], "accessories": [] }' };
        const parsed = parseNative(native);
        expect(parsed).toEqual({ libraries: 'a', wrapperConfig: { platforms: [{ platform: 'P' }], accessories: [] } });
        expect(typeof native.wrapperConfig).toBe('string');
    });

    it('uses an empty config for an empty string', () => {
        expect(parseNative({ wrapperConfig: '' }).wrapperConfig).toEqual({});
    });

    it('uses empty lists for invalid JSON', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(parseNative({ wrapperConfig: '{ broken' }).wrapperConfig).toEqual({ platforms: [], accessories: [] });
    });
});

describe('serializeChanges', () => {
    const config = { platforms: [{ platform: 'P' }], accessories: [] };

    it('writes the config as indented string if it was stored as string', () => {
        const changes = serializeChanges({ wrapperConfig: '{}' }, { wrapperConfig: config, libraries: 'a' });
        expect(changes).toEqual({ wrapperConfig: JSON.stringify(config, null, 2), libraries: 'a' });
    });

    it('keeps objects if it was stored as object', () => {
        const changes = serializeChanges({ wrapperConfig: {} }, { wrapperConfig: config });
        expect(changes.wrapperConfig).toBe(config);
    });

    it('leaves other changes alone', () => {
        expect(serializeChanges({ wrapperConfig: '{}' }, { libraries: 'b' })).toEqual({ libraries: 'b' });
    });
});
