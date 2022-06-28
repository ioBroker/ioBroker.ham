import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';

import Utils from '@iobroker/adapter-react-v5/Components/Utils';
import theme from '@iobroker/adapter-react-v5/Theme';

import TabApp from './tab-app';

window.adapterName = 'ham';
window.sentryDSN = 'https://09f8c0939fd04546aa835b96b5ad426a@sentry.iobroker.net/121';

let themeName = Utils.getThemeName();

function build() {
    const container = document.getElementById('root');
    const root = createRoot(container);

    root.render(<StyledEngineProvider injectFirst>
        <ThemeProvider theme={theme(themeName)}>
            {<TabApp
                adapterName="ham"
                onThemeChange={(_theme) => {
                    themeName = _theme;
                    build();
                }}
            />}
        </ThemeProvider>
    </StyledEngineProvider>);
}

build();
