import { describe, expect, it } from 'vitest';
import { TabCache } from './TabCache';
import type { TabCacheData, WrapperConfig } from './types';

function createConfig(): WrapperConfig {
    return {
        platforms: [{ platform: 'HttpWebHooks', sensors: [] }, { platform: 'Other' }],
        accessories: [{ accessory: 'SunPosition', name: 'Sun' }],
    };
}

describe('TabCache', () => {
    it('stores module name, alias and type in the given object', () => {
        const data: TabCacheData = {};
        new TabCache(data).set('homebridge-sun-position@0.2.2', 'SunPosition', 'accessory');
        expect(data).toEqual({
            'homebridge-sun-position@0.2.2': { pluginAlias: 'SunPosition', pluginType: 'accessory' },
        });
    });

    it('knows if a module exists', () => {
        const cache = new TabCache({ a: { pluginAlias: 'A', pluginType: 'platform' } });
        expect(cache.exists('a')).toBe(true);
        expect(cache.exists('b')).toBe(false);
    });

    it('locates and finds the config of a module', () => {
        const config = createConfig();
        const cache = new TabCache({
            webhooks: { pluginAlias: 'HttpWebHooks', pluginType: 'platform' },
            sun: { pluginAlias: 'SunPosition', pluginType: 'accessory' },
        });
        const { configList, configIndex } = cache.locateConfig('webhooks', config);
        expect(configList).toBe(config.platforms);
        expect(configIndex).toBe(0);
        expect(cache.findConfig('sun', config)).toBe(config.accessories[0]);
    });

    it('throws for unknown modules and missing config sections', () => {
        const cache = new TabCache({ gone: { pluginAlias: 'Gone', pluginType: 'platform' } });
        expect(() => cache.locateConfig('unknown', createConfig())).toThrow(/Couldn't find unknown in cache/);
        expect(() => cache.locateConfig('gone', createConfig())).toThrow(/Couldn't find platform Gone/);
    });

    it('creates missing lists in the wrapper config', () => {
        const config = { platforms: [] } as unknown as WrapperConfig;
        expect(TabCache.getList(config, 'accessory')).toEqual([]);
        expect(config.accessories).toEqual([]);
    });

    it('finds the config sections that no module claims', () => {
        const cache = new TabCache({ webhooks: { pluginAlias: 'HttpWebHooks', pluginType: 'platform' } });
        expect(cache.findUnassigned('platform', createConfig())).toEqual([{ platform: 'Other' }]);
        expect(cache.findUnassigned('accessory', createConfig())).toEqual([{ accessory: 'SunPosition', name: 'Sun' }]);
    });

    it('detects the type of a config section', () => {
        expect(TabCache.getType({ platform: 'X' })).toBe('platform');
        expect(TabCache.getType({ accessory: 'X' })).toBe('accessory');
        expect(() => TabCache.getType({ name: 'X' })).toThrow(/Unsupported plugin type/);
    });

    it('maps the type to the list name', () => {
        expect(TabCache.getKind('platform')).toBe('platforms');
        expect(TabCache.getKind('accessory')).toBe('accessories');
    });
});
