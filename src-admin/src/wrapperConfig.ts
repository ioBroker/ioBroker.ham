import type { HamNative, WrapperConfig } from './types';

/**
 * The JsonConfig editor stores `wrapperConfig` as JSON string, older versions and this tab as object.
 * Returns the native config with `wrapperConfig` as object (the original object if it is one already).
 */
export function parseNative(native: Record<string, any>): HamNative {
    if (typeof native.wrapperConfig !== 'string') {
        return native as HamNative;
    }
    let wrapperConfig: WrapperConfig;
    try {
        wrapperConfig = JSON.parse(native.wrapperConfig || '{}') as WrapperConfig;
    } catch (e) {
        console.error(`Cannot parse wrapperConfig: ${e}`);
        wrapperConfig = { platforms: [], accessories: [] };
    }
    return { ...(native as HamNative), wrapperConfig };
}

/**
 * Prepares the changes of the tab for saving: if the stored `wrapperConfig` is a string (JsonConfig editor),
 * the changed one is written as indented JSON string again.
 */
export function serializeChanges(native: Record<string, any>, changes: Partial<HamNative>): Record<string, unknown> {
    const newChanges: Record<string, unknown> = { ...changes };
    if (changes.wrapperConfig && typeof native.wrapperConfig === 'string') {
        newChanges.wrapperConfig = JSON.stringify(changes.wrapperConfig, null, 2);
    }
    return newChanges;
}
