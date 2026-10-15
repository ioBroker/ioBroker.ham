import type { CharacteristicValue, WrapperConfig } from './types';

/** JSON.stringify that drops circular references (HAP objects reference their parents) */
export function customStringify(v: unknown, _func?: unknown, intent?: number): string {
    const cache = new Map<object, boolean>();
    return JSON.stringify(
        v,
        (_key: string, value: unknown): unknown => {
            if (typeof value === 'object' && value !== null) {
                if (cache.get(value)) {
                    // Circular reference was found, discard key
                    return;
                }
                // Store value in our map
                cache.set(value, true);
            }
            return value;
        },
        intent,
    );
}

/**
 * The JsonConfig editor stores the wrapper configuration as JSON string, older admin versions and the
 * React tab as object. Returns always an object, throws if the string is no valid JSON.
 */
export function parseWrapperConfig(wrapperConfig: WrapperConfig | string): WrapperConfig {
    if (typeof wrapperConfig !== 'string') {
        return wrapperConfig;
    }
    return JSON.parse(wrapperConfig || '{}') as WrapperConfig;
}

/** Splits `native.libraries` (separated by spaces, commas or semicolons) into the single npm modules */
export function splitLibraries(libraries: string): string[] {
    // empty entries (leading or trailing separators) would run "npm install" without a package
    return libraries
        .split(/[,;\s]+/)
        .map(e => e.trim())
        .filter(e => !!e);
}

/** Directory name of an npm module reference like `name@1.2.3` or `@scope/name@1.2.3` */
export function getLibraryDir(npmLib: string): string {
    // split on @, but not at the very beginning (scoped packages)
    return npmLib.split(/(?<!^)@/)[0];
}

/**
 * Checks if the Homebridge in the adapter directory has to be (re)installed.
 *
 * @param packageJson content of node_modules/homebridge/package.json or null if it does not exist
 * @param wantedVersion version that local mode needs
 */
export function isHomebridgeInstallNeeded(packageJson: string | null, wantedVersion: string): boolean {
    if (packageJson === null) {
        return true;
    }
    let installedVersion: string;
    try {
        installedVersion = (JSON.parse(packageJson) as { version: string }).version;
    } catch {
        installedVersion = '0';
    }
    return installedVersion !== wantedVersion;
}

/** Values that most likely mean "no value available yet" and are not written before the state object exists */
export function isEmptyValue(value: CharacteristicValue | undefined): boolean {
    return value === null || value === 0 || value === false || value === undefined || value === '';
}

/** Fills the defaults of a state common, that the mapper did not set */
export function completeStateCommon(
    common: Partial<ioBroker.StateCommon> | undefined,
    name: string,
): Partial<ioBroker.StateCommon> {
    common ||= {};
    if (common.name === undefined) {
        common.name = name;
    }
    if (common.role === undefined) {
        common.role = 'state';
    }
    if (common.read === undefined && common.write === undefined) {
        common.read = true;
    }
    if (common.type === undefined) {
        common.type = 'string';
    }
    if (common.unit === undefined) {
        common.unit = '';
    }
    return common;
}
