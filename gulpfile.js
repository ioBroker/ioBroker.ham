'use strict';

const fs      = require('fs');
const cp      = require('child_process');
const gulp    = require('gulp');
const del     = require('del');
const replace = require('gulp-replace');
const rename  = require('gulp-rename');

const srcRx = 'src/';
const src = __dirname + '/' + srcRx;
const dest = 'admin/';

function npmInstall() {
    return new Promise((resolve, reject) => {
        // Install node modules
        const cwd = src.replace(/\\/g, '/');

        const cmd = `npm install -f`;
        console.log(`"${cmd} in ${cwd}`);

        // System call used for update of js-controller itself,
        // because during installation npm packet will be deleted too, but some files must be loaded even during the install process.
        const child = cp.exec(cmd, { cwd });

        child.stderr.pipe(process.stderr);
        child.stdout.pipe(process.stdout);

        child.on('exit', (code /* , signal */) => {
            // code 1 is strange error that cannot be explained. Everything is installed but error :(
            if (code && code !== 1) {
                reject('Cannot install: ' + code);
            } else {
                console.log(`"${cmd} in ${cwd} finished.`);
                // command succeeded
                resolve();
            }
        });
    });
}

function build() {
    const version = JSON.parse(fs.readFileSync(__dirname + '/package.json').toString('utf8')).version;
    const data    = JSON.parse(fs.readFileSync(src + 'package.json').toString('utf8'));

    data.version = version;

    fs.writeFileSync(src + 'package.json', JSON.stringify(data, null, 4));

    return new Promise((resolve, reject) => {
        const options = {
            stdio: 'pipe',
            cwd:   src
        };

        console.log(options.cwd);

        let script = src + 'node_modules/@craco/craco/bin/craco.js';
        if (!fs.existsSync(script)) {
            script = __dirname + '/node_modules/@craco/craco/bin/craco.js';
        }

        if (!fs.existsSync(script)) {
            console.error('Cannot find execution file: ' + script);
            reject('Cannot find execution file: ' + script);
        } else {
            const cmd = `node --max-old-space-size=8192 ${script} build`;
            const child = cp.exec(cmd, { cwd: src });

            child.stderr.pipe(process.stderr);
            child.stdout.pipe(process.stdout);

            child.on('exit', (code /* , signal */) => {
                // code 1 is strange error that cannot be explained. Everything is installed but error :(
                if (code && code !== 1) {
                    reject('Cannot install: ' + code);
                } else {
                    console.log(`"${cmd} in ${src} finished.`);
                    // command succeeded
                    resolve();
                }
            });
            // const child = cp.fork(script, ['--max-old-space-size=8192', 'build'], options);
            /*
            child.stdout.on('data', data => console.log(data.toString()));
            child.stderr.on('data', data => console.log(data.toString()));
            child.on('close', code => {
                console.log(`child process exited with code ${code}`);
                code ? reject('Exit code: ' + code) : resolve();
            });
            */
        }
    });
}

function copyFiles() {
    return del([
        dest + '**/*',
        '!admin/admin.d.ts',
        '!admin/ham.png',
        '!admin/index_m.html',
        '!admin/tsconfig.json',
        '!admin/words.js',
    ])
        .then(() => Promise.all([
            gulp.src([
                srcRx + 'build/**/*',
                `!${srcRx}build/index.html`,
                `!${srcRx}build/static/js/*.js`,
                `!${srcRx}build/i18n/**/*`,
                `!${srcRx}build/i18n`
            ])
                .pipe(gulp.dest(dest)),

            gulp.src([
                `${srcRx}build/index.html`,
            ])
                .pipe(replace('href="/', 'href="'))
                .pipe(replace('src="/', 'src="'))
                .pipe(rename('tab_m.html'))
                .pipe(gulp.dest(dest)),

            gulp.src([
                `${srcRx}build/static/js/*.js`,
            ])
                .pipe(replace('s.p+"static/media', '"./static/media'))
                .pipe(gulp.dest(dest + 'static/js/')),
        ]));
}

function patchIndex() {
    return new Promise(resolve => {
        if (fs.existsSync(dest + '/tab_m.html')) {
            let code = fs.readFileSync(dest + '/tab_m.html').toString('utf8');
            // replace code
            code = code.replace(/<script>const script=document[^<]+<\/script>/, `<script type="text/javascript" onerror="setTimeout(function(){window.location.reload()}, 5000)" src="../../lib/js/socket.io.js"></script>`);
            code = code.replace(/<script>var script=document[^<]+<\/script>/, `<script type="text/javascript" onerror="setTimeout(function(){window.location.reload()}, 5000)" src="../../lib/js/socket.io.js"></script>`);
            fs.writeFileSync(dest + '/tab_m.html', code);
            resolve();
        } else {
            // wait till finished
            setTimeout(() => {
                if (fs.existsSync(dest + '/tab_m.html')) {
                    let code = fs.readFileSync(dest + '/tab_m.html').toString('utf8');
                    // replace code
                    code = code.replace(/<script>const script=document[^<]+<\/script>/, `<script type="text/javascript" onerror="setTimeout(function(){window.location.reload()}, 5000)" src="../../lib/js/socket.io.js"></script>`);
                    code = code.replace(/<script>var script=document[^<]+<\/script>/, `<script type="text/javascript" onerror="setTimeout(function(){window.location.reload()}, 5000)" src="../../lib/js/socket.io.js"></script>`);
                    fs.writeFileSync(dest + '/tab_m.html', code);
                }
                resolve();
            }, 2000);
        }
    });
}

gulp.task('react-1-clean', () => {
    return del([
        dest + '**/*',
        dest + '/*',
        '!admin/admin.d.ts',
        '!admin/ham.png',
        '!admin/index_m.html',
        '!admin/tsconfig.json',
        '!admin/words.js',
        srcRx + 'build/**/*'
    ])
        .then(del([
            'src/build',
        ]));
});

gulp.task('react-2-npm', () => {
    if (fs.existsSync(src + 'node_modules')) {
        return Promise.resolve();
    } else {
        return npmInstall();
    }
});

gulp.task('react-2-npm-dep', gulp.series('react-1-clean', 'react-2-npm'));

gulp.task('react-3-build', () => build());

gulp.task('react-3-build-dep', gulp.series('react-2-npm-dep', 'react-3-build'));

gulp.task('react-5-copy', () => copyFiles());

gulp.task('react-5-copy-dep', gulp.series('react-3-build-dep', 'react-5-copy'));

gulp.task('react-6-patch', () => patchIndex());

gulp.task('react-6-patch-dep', gulp.series('react-5-copy-dep', 'react-6-patch'));

gulp.task('react-build', gulp.series('react-6-patch-dep'));

gulp.task('default', gulp.series('react-build'));

