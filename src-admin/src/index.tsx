import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import pkg from '../package.json';

declare global {
    interface Window {
        sentryDSN: string;
        adapterName: string | undefined;
    }
}

window.adapterName = 'ham';
window.sentryDSN = 'https://09f8c0939fd04546aa835b96b5ad426a@sentry.iobroker.net/121';

console.log(`iobroker.${window.adapterName}@${pkg.version}`);

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(<App adapterName="ham" />);
}
