import type { AdapterTimers } from './types';

interface QueueEntry {
    id: string;
    func: () => Promise<void> | void;
    started: boolean;
    invalidated: boolean;
}

/**
 * Serializes the processing of accessories. A newer job for the same accessory invalidates
 * the not yet started older ones. The first job of a run is preceded by a 1 s wait.
 */
export class MiniQueue {
    private readonly queueEntries: QueueEntry[] = [];

    public constructor(private readonly timers: AdapterTimers) {}

    public addToQueue(id: string, func: () => Promise<void> | void): void {
        this.invalidIdFromQueue(id);
        this.queueEntries.push({
            id,
            func,
            started: false,
            invalidated: false,
        });
        if (this.queueEntries.length === 1) {
            this.queueEntries.unshift({
                id: 'wait',
                func: () => new Promise<void>(resolve => this.timers.setTimeout(resolve, 1000)),
                started: false,
                invalidated: false,
            });
            void this.queueProcessor();
        }
    }

    public invalidIdFromQueue(id: string): void {
        const entriesToInvalidate = this.queueEntries.filter(e => e.id === id && !e.invalidated && !e.started);
        entriesToInvalidate.forEach(e => (e.invalidated = true));
    }

    public invalidAllInQueue(): void {
        this.queueEntries.forEach(e => (e.invalidated = true));
    }

    private async queueProcessor(): Promise<void> {
        if (!this.queueEntries.length) {
            return;
        }
        const queueEntry = this.queueEntries[0];
        if (queueEntry.started) {
            return;
        }
        if (queueEntry.invalidated) {
            this.queueEntries.shift();
            return this.queueProcessor();
        }
        queueEntry.started = true;
        await queueEntry.func();
        this.queueEntries.shift();
        return this.queueProcessor();
    }
}
