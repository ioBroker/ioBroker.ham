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
