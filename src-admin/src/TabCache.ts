import type { PluginConfig, PluginKind, PluginType, TabCacheData, WrapperConfig } from './types';

/** Maps npm modules to their section in the wrapper config (platform/accessory + alias) */
export class TabCache {
    public constructor(private readonly cache: TabCacheData) {}

    /** Set the cache values for the given module. */
    public set(moduleName: string, alias: string, type: PluginType): void {
        this.cache[moduleName] = { pluginAlias: alias, pluginType: type };
    }

    /** Checks if the cache contains the given module. */
    public exists(moduleName: string): boolean {
        return !!this.cache[moduleName];
    }

    /** Locate the list and index of a given module in the wrapperConfig using this cache. */
    public locateConfig(
        moduleName: string,
        wrapperConfig: WrapperConfig,
    ): { configList: PluginConfig[]; configIndex: number } {
        const cacheItem = this.cache[moduleName];
        if (!cacheItem) {
            throw new Error(`Couldn't find ${moduleName} in cache`);
        }
        const type = cacheItem.pluginType;
        const alias = cacheItem.pluginAlias;
        const configList = TabCache.getList(wrapperConfig, type);
        const configIndex = configList.findIndex(c => c[type] === alias);
        if (configIndex < 0) {
            throw new Error(`Couldn't find ${type} ${alias}`);
        }
        return { configList, configIndex };
    }

    /** Find the module in the wrapperConfig using this cache. */
    public findConfig(moduleName: string, wrapperConfig: WrapperConfig): PluginConfig {
        const { configList, configIndex } = this.locateConfig(moduleName, wrapperConfig);
        return configList[configIndex];
    }

    /** All config sections of the given type that no known module claims */
    public findUnassigned(type: PluginType, wrapperConfig: WrapperConfig): PluginConfig[] {
        return TabCache.getList(wrapperConfig, type).filter(
            c => !Object.keys(this.cache).some(k => c[type] === this.cache[k].pluginAlias),
        );
    }

    /** Gets the plugin type from a config. */
    public static getType(config: PluginConfig): PluginType {
        if (config.platform) {
            return 'platform';
        }
        if (config.accessory) {
            return 'accessory';
        }
        throw new Error(`Unsupported plugin type in: '${JSON.stringify(config)}'`);
    }

    /** Gets the kind (plural) of a given type. */
    public static getKind(type: PluginType): PluginKind {
        switch (type) {
            case 'platform':
                return 'platforms';
            case 'accessory':
                return 'accessories';
            default:
                throw new Error(`Unsupported type ${type as string}`);
        }
    }

    /** The list of the given type in the wrapper config. It is created if it is missing. */
    public static getList(wrapperConfig: WrapperConfig, type: PluginType): PluginConfig[] {
        const kind = TabCache.getKind(type);
        wrapperConfig[kind] ||= [];
        return wrapperConfig[kind];
    }
}
