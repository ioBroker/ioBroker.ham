/* jshint -W097 */
// jshint strict:false
/*jslint node: true */
/*jslint esversion: 6 */

/*
Device:
- Category -> accessory.category (Accessory.Categories), nur Info, nicht Gruppierung
- Reachability -> accessory.reachable

Services: ==> mapServiceType(uuid)
- UUID -> Typ Mapped: accessories.types. *_STYPE als ID nutzen?


Characteristics:
- UUID -> Typ Mapped: accessories.types. *_CTYPE als ID nutzen?, sonst wenn "-0000-1000-8000-0026BB765291" am ENde nur ANfang nehmen sonst ganze UUID
    ==> mapCharacteristicType

- Rolle je nach Typ
- props.format --> Characteristic.Formats
- props.unit --> Characteristic.Units
- props.minValue
- props.maxValue
- props.perms (Array) --> Characteristic.Perms


Name Mapper von verbessertem Namen auf originalen?
*/



module.exports = function (config) {
    var module = {};

    var accTypes = require('./types'); // change??
    var forbiddenCharacters = /[\]\[*,;'"`<>\\\s?]/g;

    var accessoryNameMap = {};
    module.mapAccessoryUUID = function (accessoryUUID, displayName) {
        if (accessoryNameMap[accessoryUUID]) {
            return accessoryNameMap[accessoryUUID];
        }
        if (displayName) {
            displayName = displayName.replace(forbiddenCharacters, '-');
        }
        else {
            displayName = accessoryUUID;
        }

        var found = false;
        for (var uuid in accessoryNameMap) {
            if (accessoryNameMap[uuid] === displayName) {
                found = true;
                break;
            }
        }
        if (found) {
            displayName = displayName + '-' + accessoryUUID;
        }

        accessoryNameMap[accessoryUUID] = displayName;
        return displayName;
    };


    var serviceTypeMap = {};
    serviceTypeMap[accTypes.LIGHTBULB_STYPE] = 'Lightbulb';
    serviceTypeMap[accTypes.SWITCH_STYPE] = 'Switch';
    serviceTypeMap[accTypes.THERMOSTAT_STYPE] = 'Thermostat';
    serviceTypeMap[accTypes.GARAGE_DOOR_OPENER_STYPE] = 'Garage-Door-Opener';
    serviceTypeMap[accTypes.ACCESSORY_INFORMATION_STYPE] = 'Accessory-Information';
    serviceTypeMap[accTypes.FAN_STYPE] = 'Fan';
    serviceTypeMap[accTypes.OUTLET_STYPE] = 'Outlet';
    serviceTypeMap[accTypes.LOCK_MECHANISM_STYPE] = 'Lock-Mechanism';
    serviceTypeMap[accTypes.LOCK_MANAGEMENT_STYPE] = 'Lock-Management';
    serviceTypeMap[accTypes.ALARM_STYPE] = 'Alarm';
    serviceTypeMap[accTypes.WINDOW_COVERING_STYPE] = 'Window-Covering';
    serviceTypeMap[accTypes.OCCUPANCY_SENSOR_STYPE] = 'Occupancy-Sensor';
    serviceTypeMap[accTypes.CONTACT_SENSOR_STYPE] = 'Contact-Sensor';
    serviceTypeMap[accTypes.MOTION_SENSOR_STYPE] = 'Motion-Sensor';
    serviceTypeMap[accTypes.HUMIDITY_SENSOR_STYPE] = 'Humidity-Sensor';
    serviceTypeMap[accTypes.TEMPERATURE_SENSOR_STYPE] = 'Temperature-Sensor';

    module.mapServiceType = function (serviceUUID, displayName) {
        if (displayName) {
            displayName = displayName.replace(forbiddenCharacters, '-');
            return displayName;
        }
        if (serviceTypeMap[serviceUUID]) return serviceTypeMap[serviceUUID];

        var pos = serviceUUID.indexOf("-0000-1000-8000-0026BB765291");
        if (pos !== -1) return serviceUUID.substring(0, pos);

        return serviceUUID;
    };


    var characteristicTypeMap = {};
    characteristicTypeMap[accTypes.ALARM_CURRENT_STATE_CTYPE] = {name:'Current-Alarm-State', roleDetail:'.alarm'};
    characteristicTypeMap[accTypes.ALARM_TARGET_STATE_CTYPE] = {name:'Target-Alarm-State', roleDetail:''};
    characteristicTypeMap[accTypes.ADMIN_ONLY_ACCESS_CTYPE] = {name:'Admin-Only-Access', roleDetail:''};
    characteristicTypeMap[accTypes.AUDIO_FEEDBACK_CTYPE] = {name:'Audio-Feedback', roleDetail:''};
    characteristicTypeMap[accTypes.BRIGHTNESS_CTYPE] = {name:'Brightness', roleDetail:'.brightness'};
    characteristicTypeMap[accTypes.BATTERY_LEVEL_CTYPE] = {name:'Battery-Level', roleDetail:'.battery'};
    characteristicTypeMap[accTypes.COOLING_THRESHOLD_CTYPE] = {name:'Cooling-Threshold', roleDetail:'.temperature'};
    characteristicTypeMap[accTypes.CONTACT_SENSOR_STATE_CTYPE] = {name:'Contact-Sensor-State', roleDetail:'.window'}; //??
    characteristicTypeMap[accTypes.CURRENT_DOOR_STATE_CTYPE] = {name:'Current-Door-State', roleDetail:'.door'};
    characteristicTypeMap[accTypes.CURRENT_LOCK_MECHANISM_STATE_CTYPE] = {name:'Current-Lock-Mechanism-State', roleDetail:'.lock'};
    characteristicTypeMap[accTypes.CURRENT_RELATIVE_HUMIDITY_CTYPE] = {name:'Current-Relative-Humidity', roleDetail:'.humidity'};
    characteristicTypeMap[accTypes.CURRENT_TEMPERATURE_CTYPE] = {name:'Current-Temperature', roleDetail:'.temperature'};
    characteristicTypeMap[accTypes.HEATING_THRESHOLD_CTYPE] = {name:'Heating-Threshold', roleDetail:'.temperature'};
    characteristicTypeMap[accTypes.HUE_CTYPE] = {name:'Hue', roleDetail:''};
    characteristicTypeMap[accTypes.IDENTIFY_CTYPE] = {name:'Identify', roleDetail:''};
    characteristicTypeMap[accTypes.LOCK_MANAGEMENT_AUTO_SECURE_TIMEOUT_CTYPE] = {name:'Auto-Secure-Timeout', roleDetail:''};
    characteristicTypeMap[accTypes.LOCK_MANAGEMENT_CONTROL_POINT_CTYPE] = {name:'Control-Point', roleDetail:''};
    characteristicTypeMap[accTypes.LOCK_MECHANISM_LAST_KNOWN_ACTION_CTYPE] = {name:'Last-Known-Action', roleDetail:''};
    characteristicTypeMap[accTypes.LOGS_CTYPE] = {name:'Logs', roleDetail:''};
    characteristicTypeMap[accTypes.MANUFACTURER_CTYPE] = {name:'Manufacturer', roleDetail:''};
    characteristicTypeMap[accTypes.MODEL_CTYPE] = {name:'Model', roleDetail:''};
    characteristicTypeMap[accTypes.MOTION_DETECTED_CTYPE] = {name:'Motion-Detected', roleDetail:'.motion'};
    characteristicTypeMap[accTypes.NAME_CTYPE] = {name:'Name', roleDetail:''};
    characteristicTypeMap[accTypes.OBSTRUCTION_DETECTED_CTYPE] = {name:'Obstruction-Detected', roleDetail:''};
    characteristicTypeMap[accTypes.OUTLET_IN_USE_CTYPE] = {name:'Outlet-In-Use', roleDetail:'indicator.working'};
    characteristicTypeMap[accTypes.OCCUPANCY_DETECTED_CTYPE] = {name:'Occupancy-Detected', roleDetail:''};
    characteristicTypeMap[accTypes.POWER_STATE_CTYPE] = {name:'Power-State', roleDetail:''};
    characteristicTypeMap[accTypes.PROGRAMMABLE_SWITCH_SWITCH_EVENT_CTYPE] = {name:'Switch-Event-Programmable-Switch', roleDetail:''};
    characteristicTypeMap[accTypes.PROGRAMMABLE_SWITCH_OUTPUT_STATE_CTYPE] = {name:'Output-State-Programmable-Switch', roleDetail:''};
    characteristicTypeMap[accTypes.ROTATION_DIRECTION_CTYPE] = {name:'Rotation-Direction', roleDetail:'.direction'};
    characteristicTypeMap[accTypes.ROTATION_SPEED_CTYPE] = {name:'Rotation-Speed', roleDetail:''};
    characteristicTypeMap[accTypes.SATURATION_CTYPE] = {name:'Saturation', roleDetail:'.color.saturation'};
    characteristicTypeMap[accTypes.SERIAL_NUMBER_CTYPE] = {name:'Serial-Number', roleDetail:''};
    characteristicTypeMap[accTypes.STATUS_LOW_BATTERY_CTYPE] = {name:'Low-Battery', roleDetail:'.lowbat'};
    characteristicTypeMap[accTypes.STATUS_FAULT_CTYPE] = {name:'Fault', roleDetail:''};
    characteristicTypeMap[accTypes.TARGET_DOORSTATE_CTYPE] = {name:'Target-Doorstate', roleDetail:'.door'};
    characteristicTypeMap[accTypes.TARGET_LOCK_MECHANISM_STATE_CTYPE] = {name:'Target-Lock-Mechanism-State', roleDetail:'.lock'};
    characteristicTypeMap[accTypes.TARGET_RELATIVE_HUMIDITY_CTYPE] = {name:'Target-Relative-Humidity', roleDetail:'.humidity'};
    characteristicTypeMap[accTypes.TARGET_TEMPERATURE_CTYPE] = {name:'Target-Temperature', roleDetail:'.temperature'};
    characteristicTypeMap[accTypes.TEMPERATURE_UNITS_CTYPE] = {name:'Temperature-Units', roleDetail:''};
    characteristicTypeMap[accTypes.VERSION_CTYPE] = {name:'Version', roleDetail:''};
    characteristicTypeMap[accTypes.WINDOW_COVERING_TARGET_POSITION_CTYPE] = {name:'Target-Position-Window-Covering', roleDetail:'.blind'};
    characteristicTypeMap[accTypes.WINDOW_COVERING_CURRENT_POSITION_CTYPE] = {name:'Current-Position-Window-Covering', roleDetail:'.blind'};
    characteristicTypeMap[accTypes.WINDOW_COVERING_OPERATION_STATE_CTYPE] = {name:'Operation-State-Window-Covering', roleDetail:'.working'};
    characteristicTypeMap[accTypes.CURRENTHEATINGCOOLING_CTYPE] = {name:'Current-Heating-Cooling', roleDetail:''};
    characteristicTypeMap[accTypes.TARGETHEATINGCOOLING_CTYPE] = {name:'Target-Heating-Cooling', roleDetail:''};

    module.mapCharacteristicType = function (serviceUUID, charUUID, displayName) {
        if (displayName) {
            displayName = displayName.replace(forbiddenCharacters, '-');
            return displayName;
        }
        if (characteristicTypeMap[charUUID]) return characteristicTypeMap[charUUID].name;

        var pos = charUUID.indexOf("-0000-1000-8000-0026BB765291");
        if (pos !== -1) return charUUID.substring(0, pos);

        return charUUID;
    };


    var characteristicFormats = {
        'bool': 'boolean',
        'int': 'number',
        'float': 'number',
        'string': 'string',
        'uint8': 'number',
        'uint16': 'number',
        'uint32': 'number',
        'uint64': 'number',
        'data': 'string',
        'tlv8': 'string',
        'array': 'string', //Not in HAP Spec
        'dict': 'string' //Not in HAP Spec
    };

    // Known HomeKit unit types
    var characteristicUnits = {
        // HomeKit only defines Celsius, for Fahrenheit, it requires iOS app to do the conversion.
        'celsius': '°C',
        'percentage': '%',
        'arcdegrees': '°',
        'lux': 'lx',
        'seconds': 's'
    };

    module.mapCharacteristicProperties = function (char) {
        var common = {};
        if (characteristicFormats[char.props.format]) {
            common.type = characteristicFormats[char.props.format];
        }
        else common.type = 'string';

        if (characteristicUnits[char.props.unit]) {
            common.unit = characteristicUnits[char.props.unit];
        }
        else if (char.props.unit) {
            common.unit = char.props.unit;
        }

        if (char.props.minValue !== null && char.props.minValue !== undefined) {
            common.min = char.props.minValue;
        }
        if (char.props.maxValue !== null && char.props.maxValue !== undefined) {
            common.max = char.props.maxValue;
        }
        if (common.min === undefined || common.max === undefined) {
            switch(char.props.format) {
                case 'int':
                    if (common.min === undefined) common.min = -2147483648;
                    if (common.max === undefined) common.max = 2147483647;
                    break;
                case 'uint8':
                    if (common.min === undefined) common.min = 0;
                    if (common.max === undefined) common.max = 255;
                    break;
                case 'uint16':
                    if (common.min === undefined) common.min = 0;
                    if (common.max === undefined) common.max = 65535;
                    break;
                case 'uint32':
                    if (common.min === undefined) common.min = 0;
                    if (common.max === undefined) common.max = 4294967295;
                    break;
                case 'uint64':
                    if (common.min === undefined) common.min = 0;
                    if (common.max === undefined) common.max = 18446744073709551615;
                    break;
              }
        }

        if (char.validValues && char.validValues.length > 0 && common.type !== 'boolean') {
            common.states = {};
            for (var i = 0; i < char.validValues; i++) {
                common.states[char.validValues[i]] = char.validValues[i];
            }
        }

        if (char.props.perms.indexOf('pr') !== -1) common.read = true;
            else common.read = false;
        if (char.props.perms.indexOf('pw') !== -1) common.write = true;
            else common.write = false;
        if (!common.read && !common.write) common.read = true;

        var roleDetail = null;
        if (characteristicTypeMap[char.UUID]) roleDetail = characteristicTypeMap[char.UUID].roleDetail;

        // Try to set roles
        var role = '';
        if (common.type === 'boolean') {
            if (common.read && !common.write) { // Boolean, read-only --> Sensor OR Indicator!
                role = 'sensor';
            }
            else if (common.write && !common.read) { // Boolean, write-only --> Button
                role = 'button';
            }
            else if (common.read && common.write) { // Boolean, read-write --> Switch
                role = 'switch';
            }
        }
        else if (common.type === 'number') {
            if (common.read && !common.write) { // Number, read-only --> Value
                role = 'value';
            }
            else if (common.write && !common.read) { // Boolean, write-only --> ?? Level?
                role = '';
            }
            else if (common.read && common.write) { // Number, read-write --> Level
                role = 'level';
            }
        }
        if (roleDetail && roleDetail != '' && roleDetail.indexOf('.') === 0 && role !== '') {
            role += roleDetail;
        }
        else if (roleDetail && roleDetail != '' && roleDetail.indexOf('.') === -1) {
            role = roleDetail;
        }
        if (role !== '') common.role = role;

        if (!common.role) common.role = 'state';

        return common;
    };


    return module;
};
