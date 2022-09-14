/* jshint strict: false */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const queueEntries = [];
function addToQueue(id, func) {
    invalidIdFromQueue(id);
    queueEntries.push({
        id,
        func,
        started: false,
        invalidated: false
    });
    if (queueEntries.length === 1) {
        queueEntries.unshift({
            id: 'wait',
            func: () => new Promise(resolve => setTimeout(resolve, 1000)),
            started: false,
            invalidated: false
        });
        queueProcessor();
    }
}

function invalidIdFromQueue(id) {
    const entriesToInvalidate = queueEntries.filter(e => e.id === id && !e.invalidated && !e.started);
    entriesToInvalidate.forEach(e => e.invalidated = true);
}

function invalidAllInQueue() {
    queueEntries.forEach(e => e.invalidated = true);
}

async function queueProcessor() {
    if (!queueEntries.length) {
        //console.log('queue empty');
        return;
    }
    const queueEntry = queueEntries[0];
    if (queueEntry.started) {
        return;
    }
    //console.log(`Process queue entry ${queueEntry.id} (invalidated: ${queueEntry.invalidated})`);
    if (queueEntry.invalidated) {
        queueEntries.shift();
        return queueProcessor();
    }
    queueEntry.started = true;
    await queueEntry.func();
    queueEntries.shift();
    return queueProcessor();
}

exports.queueProcessor = queueProcessor;
exports.addToQueue = addToQueue;
exports.invalidIdFromQueue = invalidIdFromQueue;
exports.invalidAllInQueue = invalidAllInQueue;
