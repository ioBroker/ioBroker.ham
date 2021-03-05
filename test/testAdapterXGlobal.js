/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';
const expect = require('chai').expect;
const setup  = require(__dirname + '/lib/setup');
const request = require('request');
const http = require('http');
const path = require('path');

let objects = null;
let states  = null;
let onStateChanged = null;
let onObjectChanged = null;
let sendToID = 1;

const adapterShortName = setup.adapterName.substring(setup.adapterName.indexOf('.')+1);

let httpServer;
let lastHTTPRequest = null;

function setupHTTPServer(port, callback) {
    httpServer = http.createServer(function (req, res) {
        lastHTTPRequest = req.url;
        console.log('HTTP Received: ' + lastHTTPRequest);
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('OK');
    }).listen(port);
    setTimeout(function() {
        callback();
    }, 5000);
}

function checkConnectionOfAdapter(cb, counter) {
    counter = counter || 0;
    console.log('Try check #' + counter);
    if (counter > 30) {
        if (cb) cb('Cannot check connection');
        return;
    }

    states.getState('system.adapter.' + adapterShortName + '.0.alive', (err, state) => {
        if (err) console.error(err);
        if (state && state.val) {
            if (cb) cb();
        } else {
            setTimeout(function () {
                checkConnectionOfAdapter(cb, counter + 1);
            }, 1000);
        }
    });
}

function checkValueOfState(id, value, cb, counter) {
    counter = counter || 0;
    if (counter > 20) {
        if (cb) cb('Cannot check value Of State ' + id);
        return;
    }

    states.getState(id, (err, state) => {
        if (err) console.error(err);
        if (value === null && !state) {
            if (cb) cb();
        } else
        if (state && (value === undefined || state.val === value)) {
            if (cb) cb();
        } else {
            setTimeout(function () {
                checkValueOfState(id, value, cb, counter + 1);
            }, 500);
        }
    });
}

function sendTo(target, command, message, callback) {
    onStateChanged =  (id, state) => (id === 'messagebox.system.adapter.test.0') && callback(state.message);

    states.pushMessage('system.adapter.' + target, {
        command:    command,
        message:    message,
        from:       'system.adapter.test.0',
        callback: {
            message: message,
            id:      sendToID++,
            ack:     false,
            time:    Date.now()
        }
    });
}

describe('Test ' + adapterShortName + ' Global adapter', () => {
    before('Test ' + adapterShortName + ' Global adapter: Start js-controller', function (_done) {
        this.timeout(600000); // because of first install from npm

        setup.setupController(() => {
            const config = setup.getAdapterConfig();
            // enable adapter
            config.common.enabled  = true;
            config.common.loglevel = ((process.env.TRAVIS && process.env.TRAVIS === 'true') || (process.env.APPVEYOR && process.env.APPVEYOR === 'True')) ? 'info' : 'debug';

            config.native.useGlobalHomebridge = true;
            config.native.globalHomebridgeBasePath = path.join(process.env.NODE_GLOBAL_DIR, 'homebridge');
            config.native.globalHomebridgeConfigPath = path.join(__dirname, '/homebridge/');
            config.native.characteristicPollingInterval = 30;

            setup.setAdapterConfig(config.common, config.native);

            setupHTTPServer(9080, () => {
                setup.startController(true,
                    (id, obj) => {},
                    (id, state) => onStateChanged && onStateChanged(id, state),
                    (_objects, _states) => {
                        objects = _objects;
                        states  = _states;
                        _done();
                    });
            });
        });
    });

/*
    ENABLE THIS WHEN ADAPTER RUNS IN DEAMON MODE TO CHECK THAT IT HAS STARTED SUCCESSFULLY
*/
    it('Test ' + adapterShortName + ' Global adapter: Check if adapter started', done => {
        checkConnectionOfAdapter(res => {
            if (res) console.log(res);
            expect(res).not.to.be.equal('Cannot check connection');
            objects.setObject('system.adapter.test.0', {
                    common: {

                    },
                    type: 'instance'
                },
                () => {
                    states.subscribeMessage('system.adapter.test.0');
                    done();
                });
        });
    }).timeout(60000);

    it('Test ' + adapterShortName + ' Wrapper adapter: Wait for init', done => {
        setTimeout(() => done(), 59000);
    }).timeout(60000);

    it('Test ' + adapterShortName + ' Wrapper: Verify Init', done => {
        states.getState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', (err, state) => {
            expect(err).to.not.exist;
            expect(state.val).to.be.false;

            states.getState(adapterShortName + '.0.Sun.Accessory-Information.Model', (err, state) => {
                expect(err).to.not.exist;
                expect(state.val).to.be.equal('Sun Position');

                states.getState(adapterShortName + '.0.Sun.Sun.Altitude', (err, state) => {
                    expect(err).to.not.exist;
                    expect(state.val).to.exist;
                    done();
                });
            });
        });
    });

    it('Test ' + adapterShortName + ' Wrapper: Test Change from inside', done => {
        request('http://localhost:61828/?accessoryId=switch1&state=true', (error, response, body) => {
            expect(error).to.be.null;
            expect(response && response.statusCode).to.be.equal(200);

            setTimeout(function() {
                expect(lastHTTPRequest).to.be.null;
                states.getState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', (err, state) => {
                    expect(err).to.not.exist;
                    expect(state.val).to.be.true;
                    done();
                });
            }, 3000);
        });
    }).timeout(10000);

    it('Test ' + adapterShortName + ' Wrapper: Test change via characteristic', done => {
        states.setState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', {val: false, ack: false}, err => {
            expect(err).to.not.exist;

            setTimeout(function() {
                expect(lastHTTPRequest).to.be.equal('/switch1?off');
                states.getState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', (err, state) => {
                    expect(err).to.not.exist;
                    expect(state.val).to.be.false;
                    done();
                });
            }, 3000);
        });
    }).timeout(10000);

    it('Test ' + adapterShortName + ' Wrapper: Test change via characteristic 2', done => {
        states.setState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', {val: true, ack: false}, err => {
            expect(err).to.not.exist;

            setTimeout(function() {
                expect(lastHTTPRequest).to.be.equal('/switch1?on');
                states.getState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', (err, state) => {
                    expect(err).to.not.exist;
                    expect(state.val).to.be.true;
                    done();
                });
            }, 3000);
        });
    }).timeout(10000);

    it('Test ' + adapterShortName + ' Wrapper: Test Change from inside 2', done => {
        lastHTTPRequest = null;
        request('http://localhost:61828/?accessoryId=switch1&state=false', (error, response, body) => {
            expect(error).to.be.null;
            expect(response && response.statusCode).to.be.equal(200);

            setTimeout(function() {
                expect(lastHTTPRequest).to.be.null;
                states.getState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', (err, state) => {
                    expect(err).to.not.exist;
                    expect(state.val).to.be.false;
                    done();
                });
            }, 3000);
        });
    }).timeout(10000);

    after('Test ' + adapterShortName + ' Global adapter: Stop js-controller', function (done) {
        this.timeout(12000);

        setup.stopController(function (normalTerminated) {
            console.log('Adapter normal terminated: ' + normalTerminated);
            httpServer.close();
            setTimeout(done, 2000);
        });
    });
});
