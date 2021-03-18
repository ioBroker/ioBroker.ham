import Utils from '@iobroker/adapter-react/Components/Utils';
import theme from '@iobroker/adapter-react/Theme';
import { MuiThemeProvider } from '@material-ui/core/styles';
import * as Sentry from '@sentry/browser';
import * as SentryIntegrations from '@sentry/integrations';
import React from 'react';
import ReactDOM from 'react-dom';
import { version } from '../../package.json';
import TabApp from './tab-app';

let themeName = Utils.getThemeName();

function build() {
    ReactDOM.render(
        <MuiThemeProvider theme={theme(themeName)}>
            <TabApp
                adapterName="ham"
                onThemeChange={(_theme) => {
                    themeName = _theme;
                    build();
                }}
            />
        </MuiThemeProvider>,
        document.getElementById('root'),
    );
}

// if not local development
if (window.location.host !== 'localhost:3000') {
    Sentry.init({
        dsn: 'https://09f8c0939fd04546aa835b96b5ad426a@sentry.iobroker.net/121',
        release: 'iobroker.ham@' + version,
        integrations: [
            new SentryIntegrations.Dedupe()
        ],
        
        // We recommend adjusting this value in production, or using tracesSampler
        // for finer control
        tracesSampleRate: 1.0
    });
}

build();
