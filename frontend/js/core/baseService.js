import { eventBus } from './eventBus.js';
import { showMessage } from './utils.js';

export class BaseService {
    constructor() {
        this.eventBus = eventBus;
        this.setupBaseListeners();
    }

    setupBaseListeners() {
        this.eventBus.on('auth:expired', () => {
            this.onAuthExpired();
        });
    }

    onAuthExpired() {
        // Override in child classes if needed
        console.log('Auth expired in base service');
    }

    showSuccess(message) {
        showMessage(message, false);
    }

    showError(message) {
        showMessage(message, true);
    }
}