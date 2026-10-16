'use strict';

/**
 * Accessory plugin for the integration tests, written with the API of Homebridge >= 1.3 (onGet / onSet),
 * so it runs with Homebridge 1 and 2.
 * - CurrentTemperature: read-only, counts up on every read (polling)
 * - On (Switch): read/write, remembers the written value
 */
class HamTestAccessory {
    constructor(log, config, api) {
        const { Service, Characteristic } = api.hap;
        this.temperature = 20;
        this.on = false;

        this.information = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, 'ioBroker')
            .setCharacteristic(Characteristic.Model, 'Ham Test');

        this.sensor = new Service.TemperatureSensor(`${config.name} Temperature`);
        this.sensor.getCharacteristic(Characteristic.CurrentTemperature).onGet(() => this.temperature++);

        this.switch = new Service.Switch(`${config.name} Switch`);
        this.switch
            .getCharacteristic(Characteristic.On)
            .onGet(() => this.on)
            .onSet(value => {
                log.info(`set On to ${value}`);
                this.on = value;
            });
    }

    getServices() {
        return [this.information, this.sensor, this.switch];
    }
}

module.exports = api => {
    api.registerAccessory('HamTest', HamTestAccessory);
};
