import { eventBus, Events } from './eventBus.js';

export class ErrorBoundary {
    static handle(fn) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                eventBus.emit(Events.SYSTEM.ERROR, { error });
                throw error;
            }
        };
    }
}