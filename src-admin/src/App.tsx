import React from 'react';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import { Box, CssBaseline } from '@mui/material';

import {
    AdminConnection,
    GenericApp,
    Loader,
    ScrollbarStyles,
    type GenericAppProps,
    type GenericAppState,
} from '@iobroker/gui-components';

import PluginsTable from './Components/PluginsTable';
import type { HamNative } from './types';
import { parseNative, serializeChanges } from './wrapperConfig';

import enLang from './i18n/en.json';
import deLang from './i18n/de.json';
import ruLang from './i18n/ru.json';
import ptLang from './i18n/pt.json';
import nlLang from './i18n/nl.json';
import frLang from './i18n/fr.json';
import itLang from './i18n/it.json';
import esLang from './i18n/es.json';
import plLang from './i18n/pl.json';
import zhCnLang from './i18n/zh-cn.json';

export default class App extends GenericApp<GenericAppProps, GenericAppState> {
    private parsedNative: { source: Record<string, any>; config: HamNative } | null = null;

    public constructor(props: GenericAppProps) {
        const extendedProps: GenericAppProps = {
            ...props,
            bottomButtons: false,
            encryptedFields: [],
            translations: {
                en: enLang,
                de: deLang,
                ru: ruLang,
                pt: ptLang,
                nl: nlLang,
                fr: frLang,
                it: itLang,
                es: esLang,
                pl: plLang,
                'zh-cn': zhCnLang,
            },
            // @ts-expect-error AdminConnection is accepted by GenericApp
            Connection: AdminConnection,
            sentryDSN: window.sentryDSN,
        };
        super(props, extendedProps);
    }

    /**
     * The JsonConfig editor stores `wrapperConfig` as JSON string, older versions as object.
     * This tab always works with an object.
     */
    private getAdapterConfig(): HamNative {
        const native = this.state.native;
        // parse only once per native object: the tab keeps its cache in the returned object
        if (this.parsedNative?.source !== native) {
            this.parsedNative = { source: native, config: parseNative(native) };
        }
        return this.parsedNative.config;
    }

    private handleChange(changes: Partial<HamNative>): void {
        // keeps the format of the JsonConfig editor
        const newChanges = serializeChanges(this.state.native, changes);
        this.setState({ native: { ...this.state.native, ...newChanges } }, () => this.onSave(false));
    }

    public render(): React.JSX.Element {
        if (!this.state.loaded) {
            return (
                <StyledEngineProvider injectFirst>
                    <ThemeProvider theme={this.state.theme}>
                        <CssBaseline />
                        <Loader
                            themeType={this.state.themeType}
                            backgroundColor={this.state.theme.palette.background.default}
                        />
                    </ThemeProvider>
                </StyledEngineProvider>
            );
        }

        return (
            <StyledEngineProvider injectFirst>
                <ThemeProvider theme={this.state.theme}>
                    <CssBaseline />
                    <ScrollbarStyles theme={this.state.theme} />
                    <Box
                        sx={{
                            height: '100%',
                            p: 1,
                            bgcolor: 'background.default',
                            color: 'text.primary',
                        }}
                    >
                        <PluginsTable
                            themeType={this.state.themeType}
                            adapterConfig={this.getAdapterConfig()}
                            socket={this.socket}
                            instanceId={this.instanceId}
                            onChange={changes => this.handleChange(changes)}
                            showToast={toast => this.showToast(toast)}
                        />
                        {this.renderError()}
                        {this.renderToast()}
                    </Box>
                </ThemeProvider>
            </StyledEngineProvider>
        );
    }
}
