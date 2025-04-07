import { eventBus, Events } from './eventBus.js';
import { CONFIG } from '../config.js';

export class ServiceHealth {
    constructor() {
        this.services = new Map();
        this.healthChecks = new Map();
        this.checkInterval = 30000; // 30 seconds
        this.maxRetries = 3;
        this.retryDelays = new Map(); // Track retry attempts
    }

    registerService(serviceId, healthCheckUrl) {
        this.services.set(serviceId, {
            status: 'unknown',
            lastCheck: null,
            url: healthCheckUrl,
            failureCount: 0,
            consecutiveFailures: 0
        });
        this.startHealthCheck(serviceId);
        
        // Emit service registration event
        eventBus.emit(Events.MICROSERVICE.DISCOVERY, {
            serviceId,
            url: healthCheckUrl
        });
    }

    registerDefaultServices() {
        // Determine if running locally
        const isLocal = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1';

        // Only register/run health checks when running locally
        if (!isLocal) {
            console.warn('Running in deployed mode (S3/CloudFront). Skipping default health checks as API Gateway endpoints are not configured.');
            return; 
        }

        // If running locally, register health checks using configured service URLs
        console.log('Running locally. Registering default microservices for health monitoring...');
        
        // Register all microservices with health check endpoints
        this.registerService('auth', `${CONFIG.SERVICES.AUTH.URL}/health`);
        this.registerService('inventory', `${CONFIG.SERVICES.INVENTORY.URL}/health`);
        this.registerService('recipe', `${CONFIG.SERVICES.RECIPE.URL}/health`);
        
        console.log('Registered default microservices for health monitoring');
    }

    async checkHealth(serviceId) {
        const service = this.services.get(serviceId);
        let timeoutId;

        try {
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await this.executeWithRetry(async () => {
                try {
                    return await fetch(service.url, { 
                        signal: controller.signal,
                        headers: { 'Accept': 'application/json' }
                    });
                } catch (error) {
                    // Rethrow to be handled by the retry logic
                    throw error;
                }
            }, serviceId);

            clearTimeout(timeoutId);
            
            // Reset failure counters on success
            service.failureCount = 0;
            service.consecutiveFailures = 0;
            
            const newStatus = response.ok ? 'healthy' : 'unhealthy';
            if (service.status !== newStatus) {
                service.status = newStatus;
                this.emitStatusChange(serviceId, newStatus);
            }

            // Check for degraded performance
            const responseTime = Date.now() - service.lastCheck;
            if (responseTime > 1000) { // 1 second threshold
                eventBus.emit(Events.SERVICE_HEALTH.DEGRADED, {
                    serviceId,
                    responseTime
                });
            }

        } catch (error) {
            clearTimeout(timeoutId);
            this.handleHealthCheckError(service, serviceId, error);
        }

        service.lastCheck = Date.now();
    }

    async executeWithRetry(operation, serviceId, attempt = 1) {
        try {
            return await operation();
        } catch (error) {
            if (attempt < this.maxRetries && this.shouldRetry(error)) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.executeWithRetry(operation, serviceId, attempt + 1);
            }
            throw error;
        }
    }

    shouldRetry(error) {
        return error.name !== 'AbortError' && 
               error.message !== 'Network Error' &&
               error.message !== 'Failed to fetch';
    }

    handleHealthCheckError(service, serviceId, error) {
        service.failureCount++;
        service.consecutiveFailures++;

        if (error.name === 'AbortError') {
            service.status = 'timeout';
            eventBus.emit(Events.SERVICE_HEALTH.TIMEOUT, { 
                serviceId,
                failures: service.failureCount 
            });
        } else {
            service.status = 'unreachable';
            eventBus.emit(Events.SERVICE_HEALTH.DISCONNECTED, { 
                serviceId,
                failures: service.failureCount
            });
        }

        // Check for service degradation
        if (service.consecutiveFailures >= 3) {
            eventBus.emit(Events.SERVICE_HEALTH.DEGRADED, {
                serviceId,
                failures: service.consecutiveFailures
            });
        }
    }

    emitStatusChange(serviceId, status) {
        eventBus.emit(Events.SERVICE_HEALTH.STATUS_CHANGED, {
            serviceId,
            status,
            timestamp: Date.now()
        });

        if (status === 'healthy') {
            eventBus.emit(Events.SERVICE_HEALTH.RECOVERED, { serviceId });
        }
    }

    startHealthCheck(serviceId) {
        if (this.healthChecks.has(serviceId)) {
            this.stopHealthCheck(serviceId);
        }
        const interval = setInterval(() => this.checkHealth(serviceId), this.checkInterval);
        this.healthChecks.set(serviceId, interval);
    }

    stopHealthCheck(serviceId) {
        const interval = this.healthChecks.get(serviceId);
        if (interval) {
            clearInterval(interval);
            this.healthChecks.delete(serviceId);
            this.services.delete(serviceId);
            eventBus.emit(Events.MICROSERVICE.DISCONNECTED, { serviceId });
        }
    }

    getServiceStatus(serviceId) {
        return this.services.get(serviceId)?.status || 'unknown';
    }
}

export const serviceHealth = new ServiceHealth();
