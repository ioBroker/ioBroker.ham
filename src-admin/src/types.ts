export type PluginType = 'platform' | 'accessory';
export type PluginKind = 'platforms' | 'accessories';

/** One entry of `platforms` or `accessories` in the Homebridge config */
export interface PluginConfig {
    platform?: string;
    accessory?: string;
    [key: string]: unknown;
}

export interface WrapperConfig {
    platforms: PluginConfig[];
    accessories: PluginConfig[];
    [key: string]: unknown;
}

/** Remembers which config section belongs to which npm module (stored in native._tabCache) */
export type TabCacheData = Record<string, { pluginType: PluginType; pluginAlias: string }>;

/** The part of the instance config this tab works with (wrapperConfig already parsed) */
export interface HamNative {
    libraries: string;
    wrapperConfig: WrapperConfig;
    useGlobalHomebridge: boolean;
    _tabCache?: TabCacheData;
    [key: string]: unknown;
}

export interface NpmPackage {
    name: string;
    version: string;
    description?: string;
    keywords?: string[];
    links: {
        homepage?: string;
        npm?: string;
        repository?: string;
    };
}

export interface PluginRow {
    package: NpmPackage;
    /** installed version, '?' if the version is not pinned in `libraries` */
    installed?: string;
}

/** Schema file of a Homebridge plugin (config.schema.json) */
export interface PluginConfigSchema {
    pluginAlias: string;
    pluginType: PluginType;
    schema: Record<string, unknown>;
    headerDisplay?: string;
    footerDisplay?: string;
}
