// frontend/js/config.js

// --- AWS Deployment Configuration ---
// IMPORTANT: Replace this placeholder with your actual API Gateway Invoke URL after deployment!
const API_GATEWAY_INVOKE_URL = "YOUR_API_GATEWAY_INVOKE_URL"; // e.g., https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod

// --- Local Development Configuration ---
const LOCAL_AUTH_URL = 'http://localhost:3000/auth';
const LOCAL_INVENTORY_URL = 'http://localhost:3001/inventory';
const LOCAL_RECIPE_URL = 'http://localhost:3002/recipes';

// --- Environment Detection ---
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// --- Exported Configuration ---
export const CONFIG = {
    // General API Base URL (used for deployed environment)
    API_BASE_URL: isLocal ? null : API_GATEWAY_INVOKE_URL, // Set to null for local as services have different ports

    // Specific Service URLs and Endpoints
    SERVICES: {
        AUTH: {
            URL: isLocal ? LOCAL_AUTH_URL : `${API_GATEWAY_INVOKE_URL}/auth`,
            ENDPOINTS: {
                LOGIN: '/login',
                REGISTER: '/register',
                REFRESH: '/refresh-token', // Added refresh endpoint
                VALIDATE: '/validate-token' // Added validate endpoint
            }
        },
        INVENTORY: {
            URL: isLocal ? LOCAL_INVENTORY_URL : `${API_GATEWAY_INVOKE_URL}/inventory`,
            ENDPOINTS: {
                ITEMS: '/items', // Base endpoint for items
                ITEM_BY_ID: (id) => `/items/${id}` // Function to generate item-specific URL
            }
        },
        RECIPE: {
            URL: isLocal ? LOCAL_RECIPE_URL : `${API_GATEWAY_INVOKE_URL}/recipes`,
            ENDPOINTS: {
                GENERATE: '/generate'
            }
        }
    },

    // Other Frontend Settings (Example)
    AUTH: {
        TOKEN_EXPIRY: 3600 * 1000, // 1 hour in milliseconds
        TOKEN_REFRESH_THRESHOLD: (3600 * 1000) * 0.75 // Refresh when token is 75% expired
    }
};

console.log("Frontend configuration loaded:", CONFIG);
console.log(`Running in ${isLocal ? 'local' : 'deployed'} mode.`);
