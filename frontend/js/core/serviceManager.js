import { eventBus, Events } from './eventBus.js';

class ServiceManager {
    constructor() {
        this.services = new Map();
        this.circuitBreakers = new Map();
        this.healthChecks = new Map();
    }

    registerService(serviceName, config) {
        this.services.set(serviceName, {
            ...config,
            status: 'disconnected',
            lastCheck: null
        });
        
        this.initCircuitBreaker(serviceName);
        this.startHealthCheck(serviceName);
    }

    initCircuitBreaker(serviceName) {
        const breaker = {
            state: 'closed',
            failures: 0,
            lastFailure: null,
            threshold: 5
        };
        
        this.circuitBreakers.set(serviceName, breaker);
    }

    startHealthCheck(serviceName) {
        const interval = setInterval(() => {
            this.checkServiceHealth(serviceName);
        }, 30000); // Check every 30 seconds
        
        this.healthChecks.set(serviceName, interval);
    }

    async checkServiceHealth(serviceName) {
        try {
            // Implement health check logic here
            eventBus.emit(Events.SERVICE_HEALTH.STATUS_CHANGED, {
                service: serviceName,
                status: 'healthy'
            });
        } catch (error) {
            this.handleServiceFailure(serviceName);
        }
    }

    handleServiceFailure(serviceName) {
        const breaker = this.circuitBreakers.get(serviceName);
        breaker.failures++;
        
        if (breaker.failures >= breaker.threshold) {
            breaker.state = 'open';
            eventBus.emit(Events.MICROSERVICE.CIRCUIT_BREAKER.OPEN, {
                service: serviceName
            });
        }
    }
}

export const serviceManager = new ServiceManager();
