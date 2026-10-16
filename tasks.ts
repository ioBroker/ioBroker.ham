import { existsSync, renameSync } from 'node:fs';
import { deleteFoldersRecursive, copyFiles, npmInstall, buildReact, patchHtmlFile } from '@iobroker/build-tools';

// ts-node appends its own bootstrap arguments (including the relative "--project tsconfig.tasks.json")
// to process.execArgv, and child_process.fork() inherits them. The children started by
// @iobroker/build-tools run with cwd=src-admin, where that relative tsconfig does not exist,
// so they would die with "TS5083: Cannot read file .../src-admin/tsconfig.tasks.json".
// The children are plain JS (vite) and do not need ts-node at all.
process.execArgv = [];

// The React admin tab lives in src-admin/ (vite) and is built into admin/tab_m.html + admin/assets/.
// Everything else in admin/ (jsonConfig.json, i18n, icon) is maintained by hand and must survive the clean.
function clean(): void {
    deleteFoldersRecursive(`${__dirname}/admin`, ['ham.png', 'jsonConfig.json', 'i18n']);
}

function copyAllFiles(): void {
    copyFiles(['src-admin/build/**/*'], 'admin/');
    // admin opens the tab as tab_m.html (common.adminUI.tab = "materialize")
    renameSync(`${__dirname}/admin/index.html`, `${__dirname}/admin/tab_m.html`);
}

async function patch(): Promise<void> {
    if (!existsSync(`${__dirname}/admin/tab_m.html`)) {
        throw new Error('admin/tab_m.html not found');
    }
    // tab_m.html is served from /adapter/ham/, socket.io lives in /lib/js/
    await patchHtmlFile(`${__dirname}/admin/tab_m.html`, '../..');
}

function build(): Promise<void> {
    return buildReact(`${__dirname}/src-admin/`, {
        rootDir: __dirname,
        vite: true,
    });
}

if (process.argv.includes('--0-clean')) {
    clean();
} else if (process.argv.includes('--1-npm')) {
    npmInstall(`${__dirname}/src-admin`).catch((e: unknown) => {
        console.error(`Cannot install npm: ${e as string}`);
        process.exit(1);
    });
} else if (process.argv.includes('--2-build')) {
    build().catch((e: unknown) => {
        console.error(`Cannot build react: ${e as string}`);
        process.exit(1);
    });
} else if (process.argv.includes('--3-copy')) {
    copyAllFiles();
} else if (process.argv.includes('--4-patch')) {
    patch().catch((e: unknown) => {
        console.error(`Cannot patch: ${e as string}`);
        process.exit(1);
    });
} else {
    clean();
    npmInstall(`${__dirname}/src-admin`)
        .then(() => build())
        .then(() => copyAllFiles())
        .then(() => patch())
        .catch((e: unknown) => {
            console.error(`Cannot build admin tab: ${e as string}`);
            process.exit(1);
        });
}
