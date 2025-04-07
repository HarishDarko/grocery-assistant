const CACHE_NAME = 'grocery-assistant-v1';
const API_CACHE_NAME = 'grocery-api-v1';

// Static assets to cache
const STATIC_CACHE_URLS = [
    '/',
    '/index.html',
    '/styles/base.css',
    '/styles/auth.css',
    '/styles/inventory.css',
    '/styles/recipe.css',
    '/js/main.js',
    '/js/core/utils.js',
    '/js/core/eventBus.js',
    '/js/core/baseService.js',
    '/js/core/store.js',
    '/js/core/errorBoundary.js',
    '/js/services/auth/auth.js',
    '/js/services/inventory/inventory.js',
    '/js/services/recipe/recipe.js',
    'https://cdnjs.cloudflare.com/ajax/libs/markdown-it/13.0.1/markdown-it.min.js'
];

// API routes that should be cached
const API_ROUTES = [
    '/auth',
    '/inventory',
    '/recipes'
];

self.addEventListener('install', event => {
    event.waitUntil(
        Promise.all([
            caches.open(CACHE_NAME)
                .then(cache => cache.addAll(STATIC_CACHE_URLS)),
            caches.open(API_CACHE_NAME)
        ])
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Skip OPTIONS requests completely - let the browser handle them directly
    if (event.request.method === 'OPTIONS') {
        return;
    }
    
    // Check if request is for API
    if (API_ROUTES.some(route => url.pathname.includes(route))) {
        event.respondWith(handleAPIRequest(event.request));
    } else {
        // Handle static assets
        event.respondWith(handleStaticRequest(event.request));
    }
});

async function handleAPIRequest(request) {
    // Try network first for API requests
    try {
        const response = await fetch(request.clone());
        
        // Cache successful GET requests
        if (response.ok && request.method === 'GET') {
            const cache = await caches.open(API_CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        console.error('Service worker fetch error:', error);
        
        // If offline, try cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Return a meaningful error response
        return new Response(
            JSON.stringify({ 
                success: false, 
                message: 'Network error. Please check your connection.' 
            }),
            { 
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

async function handleStaticRequest(request) {
    // Try cache first for static assets
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        // Return cached response
        return cachedResponse;
    }
    
    // If not in cache, fetch from network
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        // Handle offline fallback
        if (request.headers.get('accept').includes('text/html')) {
            return caches.match('/offline.html');
        }
        throw error;
    }
}

self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            // Clean up static cache
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => 
                            cacheName.startsWith('grocery-') && 
                            cacheName !== CACHE_NAME &&
                            cacheName !== API_CACHE_NAME
                        )
                        .map(cacheName => caches.delete(cacheName))
                );
            }),
            // Claim clients
            self.clients.claim()
        ])
    );
});

// Listen for messages from the client
self.addEventListener('message', event => {
    if (event.data.type === 'CLEAR_AUTH_CACHE') {
        clearAuthCache();
    }
});

async function clearAuthCache() {
    const cache = await caches.open(API_CACHE_NAME);
    const requests = await cache.keys();
    requests
        .filter(request => request.url.includes('/auth'))
        .forEach(request => cache.delete(request));
}