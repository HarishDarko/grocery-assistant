import { authService } from './services/auth/auth.js';
import { inventoryService } from './services/inventory/inventory.js';
import { recipeService } from './services/recipe/recipe.js';
import { eventBus, Events } from './core/eventBus.js';
import { CONFIG } from './config.js';
import { serviceHealth } from './core/ServiceHealth.js';

// Initialize services when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Determine environment based on hostname
        const isProduction = 
            window.location.hostname !== 'localhost' && 
            !window.location.hostname.includes('127.0.0.1');
            
        // Enable debug mode in development
        if (!isProduction) {
            eventBus.setDebug(true);
        }

        // Register microservices for health monitoring
        serviceHealth.registerDefaultServices();

        // Check for existing auth token
        const token = localStorage.getItem('authToken');
        const timestamp = localStorage.getItem('tokenTimestamp');
        const now = Date.now();
        
        if (token && timestamp && 
            (now - parseInt(timestamp)) < CONFIG.AUTH.TOKEN_EXPIRY) {
            await authService.updateAuthState(token);
        } else {
            localStorage.removeItem('authToken');
            localStorage.removeItem('tokenTimestamp');
            await authService.updateAuthState(null);
        }

        // Global error handler
        window.addEventListener('unhandledrejection', (event) => {
            eventBus.emit(Events.SYSTEM.ERROR, { 
                error: event.reason?.message || 'An unexpected error occurred' 
            });
        });

        // Signal that system is ready
        eventBus.emit(Events.SYSTEM.READY, { isProduction });

    } catch (error) {
        console.error('Application initialization failed:', error);
        eventBus.emit(Events.SYSTEM.ERROR, { 
            error: 'Failed to initialize application' 
        });
    }
});