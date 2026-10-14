import { HapTypes } from 'homebridge-plugin-wrapper';
import type { HapCharacteristic } from './types';

interface CharacteristicType {
    name: string;
    roleDetail: string;
}

const NAME_REPLACE_REGEX = /[\][.*,;'"`<>\\\s?]/g;

const characteristicFormats: Record<string, ioBroker.CommonType> = {
    bool: 'boolean',
    int: 'number',
    float: 'number',
    string: 'string',
    uint8: 'number',
    uint16: 'number',
    uint32: 'number',
    uint64: 'number',
    data: 'string',
    tlv8: 'string',
    array: 'string', // Not in HAP Spec
    dict: 'string', // Not in HAP Spec
};

// Known HomeKit unit types
const characteristicUnits: Record<string, string> = {
    // HomeKit only defines Celsius, for Fahrenheit, it requires iOS app to do the conversion.
    celsius: '°C',
    percentage: '%',
    arcdegrees: '°',
    lux: 'lx',
    seconds: 's',
};

/**
 * Maps HomeKit accessories, services and characteristics to ioBroker IDs and state definitions.
 *
 * The original JS version also contained a branch that loaded the HAP types from a global Homebridge
 * installation (`config.useGlobalHomebridge`), but that flag was never part of the config handed to the mapper,
 * so the types bundled with homebridge-plugin-wrapper were always used. This is kept.
 */
export class Mapper {
    private readonly accessoryNameMap: Record<string, string> = {};
    private readonly serviceTypeMap: Record<string, string> = {};
    private readonly characteristicTypeMap: Record<string, CharacteristicType> = {};

    public constructor(private readonly forbiddenCharacters: RegExp) {
        const accTypes = HapTypes;

        this.serviceTypeMap[accTypes.LIGHTBULB_STYPE] = 'Lightbulb';
        this.serviceTypeMap[accTypes.SWITCH_STYPE] = 'Switch';
        this.serviceTypeMap[accTypes.THERMOSTAT_STYPE] = 'Thermostat';
        this.serviceTypeMap[accTypes.GARAGE_DOOR_OPENER_STYPE] = 'Garage-Door-Opener';
        this.serviceTypeMap[accTypes.ACCESSORY_INFORMATION_STYPE] = 'Accessory-Information';
        this.serviceTypeMap[accTypes.FAN_STYPE] = 'Fan';
        this.serviceTypeMap[accTypes.OUTLET_STYPE] = 'Outlet';
        this.serviceTypeMap[accTypes.LOCK_MECHANISM_STYPE] = 'Lock-Mechanism';
        this.serviceTypeMap[accTypes.LOCK_MANAGEMENT_STYPE] = 'Lock-Management';
        this.serviceTypeMap[accTypes.ALARM_STYPE] = 'Alarm';
        this.serviceTypeMap[accTypes.WINDOW_COVERING_STYPE] = 'Window-Covering';
        this.serviceTypeMap[accTypes.OCCUPANCY_SENSOR_STYPE] = 'Occupancy-Sensor';
        this.serviceTypeMap[accTypes.CONTACT_SENSOR_STYPE] = 'Contact-Sensor';
        this.serviceTypeMap[accTypes.MOTION_SENSOR_STYPE] = 'Motion-Sensor';
        this.serviceTypeMap[accTypes.HUMIDITY_SENSOR_STYPE] = 'Humidity-Sensor';
        this.serviceTypeMap[accTypes.TEMPERATURE_SENSOR_STYPE] = 'Temperature-Sensor';

        const c = this.characteristicTypeMap;
        c[accTypes.ALARM_CURRENT_STATE_CTYPE] = { name: 'Current-Alarm-State', roleDetail: '.alarm' };
        c[accTypes.ALARM_TARGET_STATE_CTYPE] = { name: 'Target-Alarm-State', roleDetail: '' };
        c[accTypes.ADMIN_ONLY_ACCESS_CTYPE] = { name: 'Admin-Only-Access', roleDetail: '' };
        c[accTypes.AUDIO_FEEDBACK_CTYPE] = { name: 'Audio-Feedback', roleDetail: '' };
        c[accTypes.BRIGHTNESS_CTYPE] = { name: 'Brightness', roleDetail: '.brightness' };
        c[accTypes.BATTERY_LEVEL_CTYPE] = { name: 'Battery-Level', roleDetail: '.battery' };
        c[accTypes.COOLING_THRESHOLD_CTYPE] = { name: 'Cooling-Threshold', roleDetail: '.temperature' };
        c[accTypes.CONTACT_SENSOR_STATE_CTYPE] = { name: 'Contact-Sensor-State', roleDetail: '.window' }; //??
        c[accTypes.CURRENT_DOOR_STATE_CTYPE] = { name: 'Current-Door-State', roleDetail: '.door' };
        c[accTypes.CURRENT_LOCK_MECHANISM_STATE_CTYPE] = { name: 'Current-Lock-Mechanism-State', roleDetail: '.lock' };
        c[accTypes.CURRENT_RELATIVE_HUMIDITY_CTYPE] = { name: 'Current-Relative-Humidity', roleDetail: '.humidity' };
        c[accTypes.CURRENT_TEMPERATURE_CTYPE] = { name: 'Current-Temperature', roleDetail: '.temperature' };
        c[accTypes.HEATING_THRESHOLD_CTYPE] = { name: 'Heating-Threshold', roleDetail: '.temperature' };
        c[accTypes.HUE_CTYPE] = { name: 'Hue', roleDetail: '' };
        c[accTypes.IDENTIFY_CTYPE] = { name: 'Identify', roleDetail: '' };
        c[accTypes.LOCK_MANAGEMENT_AUTO_SECURE_TIMEOUT_CTYPE] = { name: 'Auto-Secure-Timeout', roleDetail: '' };
        c[accTypes.LOCK_MANAGEMENT_CONTROL_POINT_CTYPE] = { name: 'Control-Point', roleDetail: '' };
        c[accTypes.LOCK_MECHANISM_LAST_KNOWN_ACTION_CTYPE] = { name: 'Last-Known-Action', roleDetail: '' };
        c[accTypes.LOGS_CTYPE] = { name: 'Logs', roleDetail: '' };
        c[accTypes.MANUFACTURER_CTYPE] = { name: 'Manufacturer', roleDetail: '' };
        c[accTypes.MODEL_CTYPE] = { name: 'Model', roleDetail: '' };
        c[accTypes.MOTION_DETECTED_CTYPE] = { name: 'Motion-Detected', roleDetail: '.motion' };
        c[accTypes.NAME_CTYPE] = { name: 'Name', roleDetail: '' };
        c[accTypes.OBSTRUCTION_DETECTED_CTYPE] = { name: 'Obstruction-Detected', roleDetail: '' };
        c[accTypes.OUTLET_IN_USE_CTYPE] = { name: 'Outlet-In-Use', roleDetail: 'indicator.working' };
        c[accTypes.OCCUPANCY_DETECTED_CTYPE] = { name: 'Occupancy-Detected', roleDetail: '' };
        c[accTypes.POWER_STATE_CTYPE] = { name: 'Power-State', roleDetail: '' };
        c[accTypes.PROGRAMMABLE_SWITCH_SWITCH_EVENT_CTYPE] = {
            name: 'Switch-Event-Programmable-Switch',
            roleDetail: '',
        };
        c[accTypes.PROGRAMMABLE_SWITCH_OUTPUT_STATE_CTYPE] = {
            name: 'Output-State-Programmable-Switch',
            roleDetail: '',
        };
        c[accTypes.ROTATION_DIRECTION_CTYPE] = { name: 'Rotation-Direction', roleDetail: '.direction' };
        c[accTypes.ROTATION_SPEED_CTYPE] = { name: 'Rotation-Speed', roleDetail: '' };
        c[accTypes.SATURATION_CTYPE] = { name: 'Saturation', roleDetail: '.color.saturation' };
        c[accTypes.SERIAL_NUMBER_CTYPE] = { name: 'Serial-Number', roleDetail: '' };
        c[accTypes.STATUS_LOW_BATTERY_CTYPE] = { name: 'Low-Battery', roleDetail: '.lowbat' };
        c[accTypes.STATUS_FAULT_CTYPE] = { name: 'Fault', roleDetail: '' };
        c[accTypes.TARGET_DOORSTATE_CTYPE] = { name: 'Target-Doorstate', roleDetail: '.door' };
        c[accTypes.TARGET_LOCK_MECHANISM_STATE_CTYPE] = { name: 'Target-Lock-Mechanism-State', roleDetail: '.lock' };
        c[accTypes.TARGET_RELATIVE_HUMIDITY_CTYPE] = { name: 'Target-Relative-Humidity', roleDetail: '.humidity' };
        c[accTypes.TARGET_TEMPERATURE_CTYPE] = { name: 'Target-Temperature', roleDetail: '.temperature' };
        c[accTypes.TEMPERATURE_UNITS_CTYPE] = { name: 'Temperature-Units', roleDetail: '' };
        c[accTypes.VERSION_CTYPE] = { name: 'Version', roleDetail: '' };
        c[accTypes.WINDOW_COVERING_TARGET_POSITION_CTYPE] = {
            name: 'Target-Position-Window-Covering',
            roleDetail: '.blind',
        };
        c[accTypes.WINDOW_COVERING_CURRENT_POSITION_CTYPE] = {
            name: 'Current-Position-Window-Covering',
            roleDetail: '.blind',
        };
        c[accTypes.WINDOW_COVERING_OPERATION_STATE_CTYPE] = {
            name: 'Operation-State-Window-Covering',
            roleDetail: '.working',
        };
        c[accTypes.CURRENTHEATINGCOOLING_CTYPE] = { name: 'Current-Heating-Cooling', roleDetail: '' };
        c[accTypes.TARGETHEATINGCOOLING_CTYPE] = { name: 'Target-Heating-Cooling', roleDetail: '' };
    }

    private sanitize(name: string): string {
        return name.replace(this.forbiddenCharacters, '-').replace(NAME_REPLACE_REGEX, '-');
    }

    public mapAccessoryUUID(accessoryUUID: string, displayName?: string): string {
        if (this.accessoryNameMap[accessoryUUID]) {
            return this.accessoryNameMap[accessoryUUID];
        }
        let name = displayName ? this.sanitize(displayName) : accessoryUUID;

        const found = Object.values(this.accessoryNameMap).includes(name);
        if (found) {
            name = `${name}-${accessoryUUID}`;
        }

        this.accessoryNameMap[accessoryUUID] = name;
        return name;
    }

    public mapServiceType(serviceUUID: string, displayName?: string): string {
        if (displayName) {
            return this.sanitize(displayName);
        }
        if (this.serviceTypeMap[serviceUUID]) {
            return this.serviceTypeMap[serviceUUID];
        }

        const pos = serviceUUID.indexOf('-0000-1000-8000-0026BB765291');
        if (pos !== -1) {
            return serviceUUID.substring(0, pos);
        }

        return serviceUUID;
    }

    public mapCharacteristicType(_serviceUUID: string, charUUID: string, displayName?: string): string {
        if (displayName) {
            return this.sanitize(displayName);
        }
        if (this.characteristicTypeMap[charUUID]) {
            return this.characteristicTypeMap[charUUID].name;
        }

        const pos = charUUID.indexOf('-0000-1000-8000-0026BB765291');
        if (pos !== -1) {
            return charUUID.substring(0, pos);
        }

        return charUUID;
    }

    public mapCharacteristicProperties(char: HapCharacteristic): Partial<ioBroker.StateCommon> {
        const common: Partial<ioBroker.StateCommon> = {};
        common.type = characteristicFormats[char.props.format] || 'string';

        if (char.props.unit && characteristicUnits[char.props.unit]) {
            common.unit = characteristicUnits[char.props.unit];
        } else if (char.props.unit) {
            common.unit = char.props.unit;
        }

        if (char.props.minValue !== null && char.props.minValue !== undefined) {
            common.min = char.props.minValue;
        }
        if (char.props.maxValue !== null && char.props.maxValue !== undefined) {
            common.max = char.props.maxValue;
        }
        if (common.min === undefined || common.max === undefined) {
            switch (char.props.format) {
                case 'int':
                    common.min ??= -2147483648;
                    common.max ??= 2147483647;
                    break;
                case 'uint8':
                    common.min ??= 0;
                    common.max ??= 255;
                    break;
                case 'uint16':
                    common.min ??= 0;
                    common.max ??= 65535;
                    break;
                case 'uint32':
                    common.min ??= 0;
                    common.max ??= 4294967295;
                    break;
                case 'uint64':
                    common.min ??= 0;
                    // not exactly representable as JS number, kept as in the original code
                    // eslint-disable-next-line no-loss-of-precision
                    common.max ??= 18446744073709551615;
                    break;
            }
        }

        if (char.validValues && char.validValues.length > 0 && common.type !== 'boolean') {
            const states: Record<string, string> = {};
            common.states = states;
            // BUG (kept from the original code): the loop compares with the array itself instead of its length,
            // so it only runs for arrays with exactly one numeric entry. Number() reproduces the JS coercion of `i < array`.
            for (let i = 0; i < Number(char.validValues); i++) {
                states[String(char.validValues[i])] = String(char.validValues[i]);
            }
        }

        common.read = char.props.perms.includes('pr');
        common.write = char.props.perms.includes('pw');
        if (!common.read && !common.write) {
            common.read = true;
        }

        let roleDetail: string | null = null;
        if (this.characteristicTypeMap[char.UUID]) {
            roleDetail = this.characteristicTypeMap[char.UUID].roleDetail;
        }

        // Try to set roles
        let role = '';
        if (common.type === 'boolean') {
            if (common.read && !common.write) {
                // Boolean, read-only --> Sensor OR Indicator!
                role = 'sensor';
            } else if (common.write && !common.read) {
                // Boolean, write-only --> Button
                role = 'button';
            } else if (common.read && common.write) {
                // Boolean, read-write --> Switch
                role = 'switch';
            }
        } else if (common.type === 'number') {
            if (common.read && !common.write) {
                // Number, read-only --> Value
                role = 'value';
            } else if (common.write && !common.read) {
                // Number, write-only --> ?? Level?
                role = 'level';
            } else if (common.read && common.write) {
                // Number, read-write --> Level
                role = 'level';
            }
        } else if (common.type === 'string') {
            role = 'text';
        }

        if (roleDetail && roleDetail.startsWith('.') && role) {
            role += roleDetail;
        } else if (roleDetail && !roleDetail.includes('.')) {
            role = roleDetail;
        }

        if (role) {
            common.role = role;
        }

        common.role = common.role || 'state';

        return common;
    }
}
