/**
 * @typedef {('platform'|'accessory')} PluginType
 * @typedef {('platforms'|'accessories')} PluginKind
 * @typedef {{ platform: string }} PlatformConfig
 * @typedef {{ accessory: string }} AccessoryConfig
 * @typedef {{ platforms: PlatformConfig[], accessories: AccessoryConfig[]}} WrapperConfig
 */

export class TabCache {
    /**
     * Creates a TabCache from the given cash map.
     * @param {Record<string, { pluginType: PluginType, pluginAlias: string }>} cache 
     */
    constructor(cache) {
        this.cache = cache;
    }

    /**
     * Set the cache values for the given module.
     * @param {string} moduleName 
     * @param {string} alias 
     * @param {PluginType} type 
     * 
     * @returns {void}
     */
    set(moduleName, alias, type) {
        this.cache[moduleName] = this.cache[moduleName] || {};
        this.cache[moduleName].pluginAlias = alias;
        this.cache[moduleName].pluginType = type;
    }

    /**
     * Checks if the cache contains the given module.
     * @param {string} moduleName 
     */
    exists(moduleName) {
        return !!this.cache[moduleName];
    }

    /**
     * Locate the list and index of a given module in the wrapperConfig using this cache.
     * 
     * @param {string} moduleName 
     * @param {WrapperConfig} wrapperConfig 
     * @returns {{ configList: any[], configIndex: number }}
     */
    locateConfig(moduleName, wrapperConfig) {
        const cacheItem = this.cache[moduleName];
        if (!cacheItem) {
            throw new Error(`Couldn't find ${moduleName} in cache`)
        }
        const type = cacheItem.pluginType;
        const alias = cacheItem.pluginAlias;
        const kind = this.getKind(type);
        const configList = wrapperConfig[kind];
        const configIndex = configList.findIndex((c) => c[type] === alias);
        if (configIndex < 0) {
            throw new Error(`Couldn't find ${type} ${alias}`)
        }
        return { configList, configIndex };
    }
    
    /**
     * Find the module in the wrapperConfig using this cache.
     * 
     * @param {string} moduleName 
     * @param {WrapperConfig} wrapperConfig 
     * @returns {*} 
     */
    findConfig(moduleName, wrapperConfig) {
        const { configList, configIndex } = this.locateConfig(moduleName, wrapperConfig);
        return configList[configIndex];
    }
    
    /**
     * 
     * @param {PluginType} type 
     * @param {WrapperConfig} wrapperConfig
     * @returns {(PlatformConfig[] | AccessoryConfig[])}
     */
    findUnassigned(type, wrapperConfig) {
        const kind = this.getKind(type);
        const kindList = wrapperConfig[kind];

        /**
         * @param {(PlatformConfig | AccessoryConfig)} c
         * @returns {boolean}
         */
        const filter = c => !Object.keys(this.cache).some(k => c[type] === this.cache[k].pluginAlias);
        return kindList.filter(filter);
    };

    /**
     * Gets the plugin type from a config.
     * 
     * @param {(PlatformConfig | AccessoryConfig)} config 
     * @returns {PluginType}
     */
    getType(config) {
        if (config['platform']) {
            return 'platform';
        } else if (config['accessory']) {
            return 'accessory';
        } else {
            throw new Error(`Unsupported plugin type in: '${JSON.stringify(config)}'`)
        }
    }

    /**
     * Gets the kind (plural) of a given type.
     * 
     * @param {PluginType} type 
     * @returns {PluginKind}
     */
    getKind(type) {
        switch (type) {
            case 'platform':
                return 'platforms';
            case 'accessory':
                return 'accessories';
            default:
                throw new Error(`Unsupported type ${type}`);
        }
    }
}