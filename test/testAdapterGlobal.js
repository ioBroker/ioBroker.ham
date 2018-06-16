/* jshint -W097 */// jshint strict:false
/*jslint node: true */
var expect = require('chai').expect;
var setup  = require(__dirname + '/lib/setup');
var request = require('request');
var http = require('http');

var objects = null;
var states  = null;
var onStateChanged = null;
var onObjectChanged = null;
var sendToID = 1;

var adapterShortName = setup.adapterName.substring(setup.adapterName.indexOf('.')+1);

var httpServer;
var lastHTTPRequest = null;

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

    states.getState('system.adapter.' + adapterShortName + '.0.alive', function (err, state) {
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

    states.getState(id, function (err, state) {
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
    onStateChanged = function (id, state) {
        if (id === 'messagebox.system.adapter.test.0') {
            callback(state.message);
        }
    };

    states.pushMessage('system.adapter.' + target, {
        command:    command,
        message:    message,
        from:       'system.adapter.test.0',
        callback: {
            message: message,
            id:      sendToID++,
            ack:     false,
            time:    (new Date()).getTime()
        }
    });
}

describe('Test ' + adapterShortName + ' Global adapter', function() {
    before('Test ' + adapterShortName + ' Global adapter: Start js-controller', function (_done) {
        this.timeout(600000); // because of first install from npm

        setup.setupController(function () {
            var config = setup.getAdapterConfig();
            // enable adapter
            config.common.enabled  = true;
            config.common.loglevel = 'debug';

            config.native.useGlobalHomebridge = true;
            config.native.globalHomebridgeBasePath = process.env.NODE_GLOBAL_DIR + "/homebridge/";
            config.native.globalHomebridgeConfigPath = __dirname + "/homebridge/";

            setup.setAdapterConfig(config.common, config.native);

            setupHTTPServer(9080, function() {
                setup.startController(true, function(id, obj) {}, function (id, state) {
                        if (onStateChanged) onStateChanged(id, state);
                    },
                    function (_objects, _states) {
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
    it('Test ' + adapterShortName + ' Global adapter: Check if adapter started', function (done) {
        this.timeout(60000);
        checkConnectionOfAdapter(function (res) {
            if (res) console.log(res);
            expect(res).not.to.be.equal('Cannot check connection');
            objects.setObject('system.adapter.test.0', {
                    common: {

                    },
                    type: 'instance'
                },
                function () {
                    states.subscribeMessage('system.adapter.test.0');
                    done();
                });
        });
    });

    it('Test ' + adapterShortName + ' Wrapper adapter: Wait for init', function (done) {
        this.timeout(60000);

        setTimeout(function() {
            done();
        }, 15000);
    });

    it('Test ' + adapterShortName + ' Wrapper: Verify Init', function (done) {
        this.timeout(10000); // because of first install from npm

        states.getState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', function (err, state) {
            expect(err).to.not.exist;
            expect(state.val).to.be.false;
            done();
        });
    });

    it('Test ' + adapterShortName + ' Wrapper: Test Change from inside', function (done) {
        this.timeout(10000); // because of first install from npm

        request('http://localhost:61828/?accessoryId=switch1&state=true', function (error, response, body) {
            expect(error).to.be.null;
            expect(response && response.statusCode).to.be.equal(200);

            setTimeout(function() {
                expect(lastHTTPRequest).to.be.null;
                states.getState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', function (err, state) {
                    expect(err).to.not.exist;
                    expect(state.val).to.be.true;
                    done();
                });
            }, 3000);
        });

    });

    it('Test ' + adapterShortName + ' Wrapper: Test change via characteristic', function (done) {
        this.timeout(10000); // because of first install from npm

        states.setState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', {val: false, ack:false}, function (err) {
            expect(err).to.not.exist;

            setTimeout(function() {
                expect(lastHTTPRequest).to.be.equal('/switch1?off');
                states.getState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', function (err, state) {
                    expect(err).to.not.exist;
                    expect(state.val).to.be.false;
                    done();
                });
            }, 3000);
        });
    });

    it('Test ' + adapterShortName + ' Wrapper: Test change via characteristic 2', function (done) {
        this.timeout(10000); // because of first install from npm

        states.setState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', {val: true, ack:false}, function (err) {
            expect(err).to.not.exist;

            setTimeout(function() {
                expect(lastHTTPRequest).to.be.equal('/switch1?on');
                states.getState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', function (err, state) {
                    expect(err).to.not.exist;
                    expect(state.val).to.be.true;
                    done();
                });
            }, 3000);
        });
    });

    it('Test ' + adapterShortName + ' Wrapper: Test Change from inside 2', function (done) {
        this.timeout(10000); // because of first install from npm

        lastHTTPRequest = null;
        request('http://localhost:61828/?accessoryId=switch1&state=false', function (error, response, body) {
            expect(error).to.be.null;
            expect(response && response.statusCode).to.be.equal(200);

            setTimeout(function() {
                expect(lastHTTPRequest).to.be.null;
                states.getState(adapterShortName + '.0.Switch-name-1.Switch-name-1.On', function (err, state) {
                    expect(err).to.not.exist;
                    expect(state.val).to.be.false;
                    done();
                });
            }, 3000);
        });

    });

    after('Test ' + adapterShortName + ' Global adapter: Stop js-controller', function (done) {
        this.timeout(10000);

        setup.stopController(function (normalTerminated) {
            console.log('Adapter normal terminated: ' + normalTerminated);
            httpServer.close();
            done();
        });
    });
});
