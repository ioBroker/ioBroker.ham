import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    UNKNOWN_VERSION,
    buildRows,
    cleanModuleName,
    filterKeywords,
    findInstalled,
    getInstalledPackages,
    getInstalledVersions,
    matchesSearch,
    npmPage,
    searchPlugins,
    splitLibraries,
    splitModule,
} from './npm';
import type { NpmPackage } from './types';

function pkg(name: string, extra: Partial<NpmPackage> = {}): NpmPackage {
    return { name, version: '1.0.0', description: '', keywords: [], links: {}, ...extra };
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('module names', () => {
    it('shortens the plugin names for the table', () => {
        expect(cleanModuleName('homebridge-http-webhooks')).toBe('http-webhooks');
        expect(cleanModuleName('nuki-homebridge')).toBe('nuki');
        expect(cleanModuleName('@homebridge-plugins/homebridge-tado')).toBe('tado');
    });

    it('splits name and version, also of scoped packages', () => {
        expect(splitModule('homebridge-x@1.2.3')).toEqual(['homebridge-x', '1.2.3']);
        expect(splitModule('homebridge-x')).toEqual(['homebridge-x', undefined]);
        expect(splitModule('@scope/homebridge-x@2.0.0')).toEqual(['@scope/homebridge-x', '2.0.0']);
        expect(splitModule('@scope/homebridge-x')).toEqual(['@scope/homebridge-x', undefined]);
    });

    it('builds the npm page link', () => {
        expect(npmPage('@scope/x')).toBe('https://www.npmjs.com/package/@scope/x');
    });

    it('hides the keywords every plugin has', () => {
        expect(['homebridge-plugin', 'homekit', 'mqtt', 'light'].filter(filterKeywords)).toEqual(['mqtt', 'light']);
    });
});

describe('installed modules', () => {
    it('splits native.libraries like the backend', () => {
        expect(splitLibraries('a  b,c; d')).toEqual(['a', 'b', 'c', 'd']);
        expect(splitLibraries('')).toEqual([]);
        expect(splitLibraries(undefined)).toEqual([]);
        expect(splitLibraries(' a ')).toEqual(['a']);
    });

    it('collects the pinned versions', () => {
        expect(getInstalledVersions(['a@1.0.0', 'b', '@s/c@2'])).toEqual({ a: '1.0.0', b: undefined, '@s/c': '2' });
    });

    it('finds a module with or without version', () => {
        const installed = ['homebridge-a@1.0.0', 'homebridge-ab', 'homebridge-b'];
        expect(findInstalled(installed, 'homebridge-a')).toBe(0);
        expect(findInstalled(installed, 'homebridge-ab')).toBe(1);
        expect(findInstalled(installed, 'homebridge-c')).toBe(-1);
    });
});

describe('matchesSearch', () => {
    const plugin = pkg('homebridge-shelly', { description: 'Shelly devices', keywords: ['MQTT', 'relay'] });

    it('finds words in name, description and keywords (case insensitive)', () => {
        expect(matchesSearch(plugin, 'shelly')).toBe(true);
        expect(matchesSearch(plugin, 'DEVICES')).toBe(true);
        expect(matchesSearch(plugin, 'mqtt')).toBe(true);
    });

    it('needs all words', () => {
        expect(matchesSearch(plugin, 'shelly relay')).toBe(true);
        expect(matchesSearch(plugin, 'shelly zigbee')).toBe(false);
    });

    it('matches everything with an empty search', () => {
        expect(matchesSearch(plugin, '  ')).toBe(true);
    });
});

describe('buildRows', () => {
    const results = [pkg('homebridge-a'), pkg('homebridge-b'), pkg('homebridge-config-ui-x')];

    it('removes the config UIs from the search results', () => {
        expect(buildRows(results, null, {}, '').map(r => r.package.name)).toEqual(['homebridge-a', 'homebridge-b']);
    });

    it('shows the installed modules first and not twice', () => {
        const rows = buildRows(results, [pkg('homebridge-b', { version: '2.0.0' })], { 'homebridge-b': '1.5.0' }, '');
        expect(rows.map(r => [r.package.name, r.installed])).toEqual([
            ['homebridge-b', '1.5.0'],
            ['homebridge-a', undefined],
        ]);
    });

    it('marks installed modules without pinned version', () => {
        const rows = buildRows([], [pkg('homebridge-b')], { 'homebridge-b': undefined }, '');
        expect(rows[0].installed).toBe(UNKNOWN_VERSION);
    });

    it('filters the installed modules by the search', () => {
        const installed = [pkg('homebridge-b', { description: 'lights' }), pkg('homebridge-c')];
        const rows = buildRows([], installed, { 'homebridge-b': '1', 'homebridge-c': '1' }, 'light');
        expect(rows.map(r => r.package.name)).toEqual(['homebridge-b']);
    });

    it('does not show installed modules on other pages', () => {
        const rows = buildRows(results, null, { 'homebridge-a': '1' }, '');
        expect(rows.map(r => r.package.name)).toEqual(['homebridge-b']);
    });
});

describe('npm registry', () => {
    it('searches the plugins with the keyword and the search text', async () => {
        const fetchMock = vi.fn((_url: string) =>
            Promise.resolve(jsonResponse({ total: 1, objects: [{ package: pkg('homebridge-a') }] })),
        );
        vi.stubGlobal('fetch', fetchMock);
        const result = await searchPlugins('sun position', 50, 25);
        expect(result.total).toBe(1);
        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.origin + url.pathname).toBe('https://registry.npmjs.org/-/v1/search');
        expect(url.searchParams.get('text')).toBe('keywords:homebridge-plugin sun position');
        expect(url.searchParams.get('from')).toBe('50');
        expect(url.searchParams.get('size')).toBe('25');
    });

    it('throws if the search fails', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve(jsonResponse({}, 503))),
        );
        await expect(searchPlugins('', 0, 25)).rejects.toThrow(/503/);
    });

    it('reads the installed modules from the registry', async () => {
        const fetchMock = vi.fn((url: string): Promise<Response> => {
            if (url.endsWith('/@scope%2Fhomebridge-x/latest')) {
                return Promise.resolve(
                    jsonResponse({ name: '@scope/homebridge-x', version: '3.0.0', description: 'X', keywords: ['k'] }),
                );
            }
            return Promise.resolve(
                jsonResponse({ name: 'homebridge-y', version: '1.0.0', homepage: 'https://y.example' }),
            );
        });
        vi.stubGlobal('fetch', fetchMock);
        const packages = await getInstalledPackages(['@scope/homebridge-x', 'homebridge-y']);
        expect(packages).toEqual([
            {
                name: '@scope/homebridge-x',
                version: '3.0.0',
                description: 'X',
                keywords: ['k'],
                links: {
                    homepage: 'https://www.npmjs.com/package/@scope/homebridge-x',
                    npm: 'https://www.npmjs.com/package/@scope/homebridge-x',
                },
            },
            {
                name: 'homebridge-y',
                version: '1.0.0',
                description: undefined,
                keywords: undefined,
                links: { homepage: 'https://y.example', npm: 'https://www.npmjs.com/package/homebridge-y' },
            },
        ]);
    });

    it('keeps modules that are not in the registry (e.g. installed from a URL)', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve(jsonResponse({}, 404))),
        );
        expect(await getInstalledPackages(['homebridge-z'])).toEqual([
            {
                name: 'homebridge-z',
                version: UNKNOWN_VERSION,
                links: { homepage: 'https://www.npmjs.com/package/homebridge-z' },
            },
        ]);
    });
});
