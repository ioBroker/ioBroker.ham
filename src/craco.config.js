const CracoEsbuildPlugin = require('craco-esbuild');
const { ProvidePlugin } = require('webpack');
const path = require('path');

module.exports = {
    plugins: [
        { plugin: CracoEsbuildPlugin },
    ],
    devServer: {
        proxy: {
            '/files': 'http://localhost:8081',
            '/adapter': 'http://localhost:8081',
        }
    },
    webpack: {
        output: {
            publicPath: './',
        },
        plugins: [
            new ProvidePlugin({
                React: 'react',
            }),
        ],
    },
};
