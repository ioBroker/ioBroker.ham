import type { NpmPackage, PluginRow } from './types';

const SEARCH_URL = 'https://registry.npmjs.org/-/v1/search';
const PACKAGE_URL = 'https://registry.npmjs.org';
export const UNKNOWN_VERSION = '?';

export interface NpmSearchResult {
    total: number;
    objects: { package: NpmPackage }[];
}

/** package.json as returned by the registry for `<name>/latest` */
interface NpmManifest {
    name: string;
    version: string;
    description?: string;
    keywords?: string[];
    homepage?: string;
}

/** Keywords that every plugin has are not shown */
export const filterKeywords = (keyword: string): boolean =>
    !keyword.includes('homebridge') && !keyword.includes('homekit');

/** Short name for the table: without "homebridge-" and without scope */
export const cleanModuleName = (name: string): string =>
    name
        // the scope first: it may contain "homebridge-" too
        .replace(/^@.+?\//, '')
        .replace('homebridge-', '')
        .replace('-homebridge', '');

/** Splits `name@version` - on @, but not when it is at the very beginning (scoped packages) */
export const splitModule = (module: string): [string, string | undefined] => {
    const [name, version] = module.split(/(?<!^)@/);
    return [name, version];
};

export const npmPage = (name: string): string => `https://www.npmjs.com/package/${name}`;

/** The modules of `native.libraries` (separated by spaces, commas or semicolons) */
export const splitLibraries = (libraries: string | undefined): string[] =>
    (libraries || '').split(/[,;\s]+/).filter(p => !!p);

/** Installed module names with their pinned version (undefined if not pinned) */
export function getInstalledVersions(installed: string[]): Record<string, string | undefined> {
    const versions: Record<string, string | undefined> = {};
    installed.forEach(m => {
        const [name, version] = splitModule(m);
        versions[name] = version;
    });
    return versions;
}

/** Index of a module in the list of installed modules (with or without version) */
export const findInstalled = (installed: string[], name: string): number =>
    installed.findIndex(m => m.startsWith(`${name}@`) || m === name);

/** Checks if all words of the search are in the name, the description or the keywords */
export function matchesSearch(pkg: NpmPackage, search: string): boolean {
    const terms = search
        .split(/\s+/)
        .filter(t => !!t)
        .map(t => t.toLowerCase());
    return terms.every(
        t =>
            pkg.name.toLowerCase().includes(t) ||
            (pkg.description || '').toLowerCase().includes(t) ||
            (pkg.keywords || []).some(k => k.toLowerCase().includes(t)),
    );
}

/**
 * Rows of the table: the installed modules (only on the first page, filtered by the search) followed by the search
 * results without the installed modules and without the config UIs.
 */
export function buildRows(
    searchResults: NpmPackage[],
    installedPackages: NpmPackage[] | null,
    versions: Record<string, string | undefined>,
    search: string,
): PluginRow[] {
    const installedNames = Object.keys(versions);
    const rows: PluginRow[] = searchResults
        .filter(p => !installedNames.includes(p.name) && !p.name.includes('config-ui-'))
        .map(p => ({ package: p }));

    if (!installedPackages) {
        return rows;
    }
    const installedRows = installedPackages
        .filter(p => !search || matchesSearch(p, search))
        .map(p => ({ package: p, installed: versions[p.name] || UNKNOWN_VERSION }));
    return [...installedRows, ...rows];
}

/** Searches the Homebridge plugins in the npm registry */
export async function searchPlugins(search: string, from: number, size: number): Promise<NpmSearchResult> {
    const text = `keywords:homebridge-plugin${search ? ` ${search}` : ''}`;
    const response = await fetch(`${SEARCH_URL}?text=${encodeURIComponent(text)}&from=${from}&size=${size}`);
    if (!response.ok) {
        throw new Error(`npm search failed: ${response.status}`);
    }
    return (await response.json()) as NpmSearchResult;
}

/** Reads the latest metadata of the installed modules from npm */
export async function getInstalledPackages(names: string[]): Promise<NpmPackage[]> {
    return Promise.all(
        names.map(async (name): Promise<NpmPackage> => {
            try {
                const response = await fetch(`${PACKAGE_URL}/${name.replace('/', '%2F')}/latest`);
                if (!response.ok) {
                    throw new Error(`${response.status}`);
                }
                const manifest = (await response.json()) as NpmManifest;
                return {
                    name,
                    version: manifest.version,
                    description: manifest.description,
                    keywords: manifest.keywords,
                    links: { homepage: manifest.homepage || npmPage(name), npm: npmPage(name) },
                };
            } catch (e) {
                console.warn(`Cannot read ${name} from npm: ${e}`);
                // e.g. installed from a URL
                return { name, version: UNKNOWN_VERSION, links: { homepage: npmPage(name) } };
            }
        }),
    );
}
