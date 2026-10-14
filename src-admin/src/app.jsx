import React from 'react';
import { withStyles } from '@mui/styles';

import GenericApp from '@iobroker/adapter-react-v5/GenericApp';

import PluginsTable from './components/plugins-table';

/**
 * @type {(_theme: Theme) => import("@material-ui/styles").StyleRules}
 */
const styles = _theme => ({
    root: {},
});

class TabApp extends GenericApp {
    constructor(props) {
        const extendedProps = {
            ...props,
            bottomButtons: false,
            encryptedFields: [],
            translations: {
                en: require('./i18n/en.json'),
                de: require('./i18n/de.json'),
                ru: require('./i18n/ru.json'),
                pt: require('./i18n/pt.json'),
                nl: require('./i18n/nl.json'),
                fr: require('./i18n/fr.json'),
                it: require('./i18n/it.json'),
                es: require('./i18n/es.json'),
                pl: require('./i18n/pl.json'),
                'zh-cn': require('./i18n/zh-cn.json'),
            },
            sentryDSN: window.sentryDSN,
        };
        super(props, extendedProps);
    }

    onConnectionReady() {
        // executed when connection is ready
    }

    /**
     * The JsonConfig editor stores `wrapperConfig` as JSON string, older versions as object.
     * This tab always works with an object.
     */
    getAdapterConfig() {
        const native = this.state.native;
        if (typeof native.wrapperConfig !== 'string') {
            return native;
        }
        if (!this.parsedNative || this.parsedNative.source !== native) {
            let wrapperConfig;
            try {
                wrapperConfig = JSON.parse(native.wrapperConfig || '{}');
            } catch (e) {
                console.error(`Cannot parse wrapperConfig: ${e}`);
                wrapperConfig = {};
            }
            this.parsedNative = { source: native, config: { ...native, wrapperConfig } };
        }
        return this.parsedNative.config;
    }

    handleChange(changes) {
        if (changes.wrapperConfig && typeof this.state.native.wrapperConfig === 'string') {
            // keep the format of the JsonConfig editor
            changes = { ...changes, wrapperConfig: JSON.stringify(changes.wrapperConfig, null, 2) };
        }
        //console.log('save this:', { ...this.state.native, ...changes });
        this.setState({ native: { ...this.state.native, ...changes } }, () =>
            this.onSave(false));
    }

    render() {
        if (!this.state.loaded) {
            return super.render();
        }

        return <div className="App">
            <PluginsTable
                themeType={this.state.themeType}
                adapterConfig={this.getAdapterConfig()}
                socket={this.socket}
                instanceId={this.instanceId}
                onChange={(changes) => this.handleChange(changes)}
                showToast={(toast) => this.showToast(toast)}
            />
            {this.renderError()}
            {this.renderToast()}
        </div>;
    }
}

export default withStyles(styles)(TabApp);
