class EventBus {
    constructor() {
        this.listeners = new Map();
        this.middlewares = new Set();
        this.debugMode = false;
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Event handler
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        
        if (this.debugMode) {
            console.debug(`EventBus: Subscribed to "${event}"`);
        }
        
        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Event handler to remove
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
            if (this.debugMode) {
                console.debug(`EventBus: Unsubscribed from "${event}"`);
            }
        }
    }

    /**
     * Emit an event with data
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (this.debugMode) {
            console.debug(`EventBus: Emitting "${event}"`, data);
        }

        // Run middlewares
        let processedData = this.runMiddlewares(event, data);

        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(processedData);
                } catch (error) {
                    console.error(`EventBus: Error in listener for "${event}":`, error);
                }
            });
        }
    }

    /**
     * Add middleware to process events
     * @param {Function} middleware - (event, data) => processedData
     */
    use(middleware) {
        this.middlewares.add(middleware);
        if (this.debugMode) {
            console.debug('EventBus: Added middleware');
        }
    }

    /**
     * Run all middlewares on event data
     * @private
     */
    runMiddlewares(event, data) {
        let processedData = data;
        this.middlewares.forEach(middleware => {
            try {
                processedData = middleware(event, processedData);
            } catch (error) {
                console.error('EventBus: Middleware error:', error);
            }
        });
        return processedData;
    }

    /**
     * Enable/disable debug logging
     * @param {boolean} enabled
     */
    setDebug(enabled) {
        this.debugMode = enabled;
        if (enabled) {
            console.debug('EventBus: Debug mode enabled');
        }
    }

    /**
     * Clear all listeners and middlewares
     */
    reset() {
        this.listeners.clear();
        this.middlewares.clear();
        if (this.debugMode) {
            console.debug('EventBus: Reset complete');
        }
    }
}

// Create and export a singleton instance
export const eventBus = new EventBus();

// Determine environment based on hostname
const isProduction = 
    window.location.hostname !== 'localhost' && 
    !window.location.hostname.includes('127.0.0.1');

// Add debugging middleware in development
if (!isProduction) {
    eventBus.use((event, data) => {
        console.log(`[EventBus] ${event}:`, data);
        return data;
    });
}

// Standard events
export const Events = {
    AUTH: {
        LOGIN: 'auth:login',
        LOGOUT: 'auth:logout',
        EXPIRED: 'auth:expired',
        ERROR: 'auth:error'
    },
    INVENTORY: {
        UPDATED: 'inventory:updated',
        ITEM_ADDED: 'inventory:item_added',
        ITEM_DELETED: 'inventory:item_deleted',
        ERROR: 'inventory:error'
    },
    RECIPE: {
        GENERATED: 'recipe:generated',
        ERROR: 'recipe:error'
    },
    SYSTEM: {
        ERROR: 'system:error',
        READY: 'system:ready'
    },
    MICROSERVICE: {
        CONNECTED: 'microservice:connected:v1',
        DISCONNECTED: 'microservice:disconnected:v1',
        TIMEOUT: 'microservice:timeout:v1',
        RETRY: 'microservice:retry:v1',
        DISCOVERY: 'microservice:discovery:v1',
        HEALTH_CHECK: 'microservice:health_check:v1',
        CIRCUIT_BREAKER: {
            OPEN: 'microservice:circuit_breaker:open:v1',
            CLOSED: 'microservice:circuit_breaker:closed:v1',
            HALF_OPEN: 'microservice:circuit_breaker:half_open:v1'
        }
    },
    SERVICE_HEALTH: {
        AUTH_SERVICE: 'health:auth:v1',
        INVENTORY_SERVICE: 'health:inventory:v1',
        RECIPE_SERVICE: 'health:recipe:v1',
        STATUS_CHANGED: 'health:status_changed:v1',
        DEGRADED: 'health:degraded:v1',
        RECOVERED: 'health:recovered:v1'
    },
    API: {
        VERSION_MISMATCH: 'api:version_mismatch:v1',
        DEPRECATED: 'api:deprecated:v1',
        FALLBACK: 'api:fallback:v1'
    }
};