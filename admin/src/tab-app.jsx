import GenericApp from '@iobroker/adapter-react/GenericApp';
import { withStyles } from '@material-ui/core/styles';
import React from 'react';
import PluginsTable from './plugins-table';

/**
 * @type {(_theme: Theme) => import("@material-ui/styles").StyleRules}
 */
const styles = (_theme) => ({
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
        };
        super(props, extendedProps);
    }

    onConnectionReady() {
        // executed when connection is ready
    }

    handleChange(changes) {
        //console.log('save this:', { ...this.state.native, ...changes });
        this.setState({ native: { ...this.state.native, ...changes } }, () => this.onSave(false));
    }

    render() {
        if (!this.state.loaded) {
            return super.render();
        }

        return (
            <div className="App">
                <PluginsTable
                    adapterConfig={this.state.native}
                    onChange={(changes) => this.handleChange(changes)}
                    showToast={(toast) => this.showToast(toast)}
                />
                {this.renderError()}
                {this.renderToast()}
            </div>
        );
    }
}

export default withStyles(styles)(TabApp);
