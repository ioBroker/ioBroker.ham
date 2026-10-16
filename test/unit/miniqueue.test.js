'use strict';

const assert = require('node:assert');
const { requireBuild, createManualTimers, immediateTimers, flush, waitFor } = require('./helpers');

const { MiniQueue } = requireBuild('lib/miniqueue.js');

describe('MiniQueue', () => {
    it('waits 1 s before the first job', async () => {
        const timers = createManualTimers();
        const queue = new MiniQueue(timers);
        const done = [];
        queue.addToQueue('a', () => done.push('a'));
        await flush();
        assert.deepStrictEqual(done, []);
        assert.strictEqual(timers.pending.length, 1);
        assert.strictEqual(timers.pending[0].ms, 1000);
        timers.tick();
        await flush();
        assert.deepStrictEqual(done, ['a']);
    });

    it('runs the jobs one after another in the order they were added', async () => {
        const queue = new MiniQueue(immediateTimers);
        const done = [];
        let running = 0;
        const job = name => async () => {
            running++;
            assert.strictEqual(running, 1, 'jobs must not run in parallel');
            await new Promise(resolve => setTimeout(resolve, 5));
            done.push(name);
            running--;
        };
        queue.addToQueue('a', job('a'));
        queue.addToQueue('b', job('b'));
        queue.addToQueue('c', job('c'));
        await waitFor(() => done.length === 3);
        assert.deepStrictEqual(done, ['a', 'b', 'c']);
    });

    it('replaces a not started job of the same ID by the newer one', async () => {
        const timers = createManualTimers();
        const queue = new MiniQueue(timers);
        const done = [];
        queue.addToQueue('a', () => done.push('a-old'));
        queue.addToQueue('b', () => done.push('b'));
        queue.addToQueue('a', () => done.push('a-new'));
        timers.tick();
        await flush();
        assert.deepStrictEqual(done, ['b', 'a-new']);
    });

    it('does not invalidate the running job', async () => {
        const queue = new MiniQueue(immediateTimers);
        const done = [];
        let release;
        queue.addToQueue('a', () => new Promise(resolve => (release = resolve)).then(() => done.push('a-1')));
        await waitFor(() => !!release);
        queue.addToQueue('a', () => done.push('a-2'));
        release();
        await waitFor(() => done.length === 2);
        assert.deepStrictEqual(done, ['a-1', 'a-2']);
    });

    it('drops the jobs of an ID with invalidIdFromQueue', async () => {
        const timers = createManualTimers();
        const queue = new MiniQueue(timers);
        const done = [];
        queue.addToQueue('a', () => done.push('a'));
        queue.addToQueue('b', () => done.push('b'));
        queue.invalidIdFromQueue('a');
        timers.tick();
        await flush();
        assert.deepStrictEqual(done, ['b']);
    });

    it('drops all jobs with invalidAllInQueue (unload)', async () => {
        const timers = createManualTimers();
        const queue = new MiniQueue(timers);
        const done = [];
        queue.addToQueue('a', () => done.push('a'));
        queue.addToQueue('b', () => done.push('b'));
        queue.invalidAllInQueue();
        timers.tick();
        await flush();
        assert.deepStrictEqual(done, []);
    });

    it('starts again with a wait after the queue was empty', async () => {
        const timers = createManualTimers();
        const queue = new MiniQueue(timers);
        const done = [];
        queue.addToQueue('a', () => done.push('a'));
        timers.tick();
        await flush();
        queue.addToQueue('b', () => done.push('b'));
        await flush();
        assert.deepStrictEqual(done, ['a']);
        timers.tick();
        await flush();
        assert.deepStrictEqual(done, ['a', 'b']);
    });
});
