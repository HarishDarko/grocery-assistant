import { eventBus, Events } from './eventBus.js';

export function showMessage(message, isError = false, duration = 3000) {
    const messageArea = document.getElementById('message-area');
    if (!messageArea) {
        eventBus.emit(Events.SYSTEM.ERROR, { 
            error: 'Message area not found' 
        });
        return;
    }
    
    messageArea.textContent = message;
    messageArea.className = isError ? 'error' : 'success';
    messageArea.style.display = 'block';

    if (duration) {
        setTimeout(() => {
            messageArea.style.display = 'none';
            messageArea.textContent = '';
            messageArea.className = '';
        }, duration);
    }
}

export async function fetchWithAuth(url, options = {}) {
    if (!url) {
        console.error('fetchWithAuth called with empty URL');
        throw new Error('Invalid URL provided to fetchWithAuth');
    }
    
    // Get auth token from localStorage
    const token = localStorage ? localStorage.getItem('authToken') : null;
    
    // Debug authentication state
    if (!token) {
        console.warn('No authentication token found in localStorage');
    } else {
        console.log('Using authentication token from localStorage');
    }
    
    // Create a properly formatted auth header with Bearer prefix
    const authHeader = token ? `Bearer ${token}` : '';
    
    // Ensure we have a method specified
    const method = options.method || 'GET'; // Default to GET only if method is not specified
    
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': authHeader }),
        ...options.headers
    };

    try {
        console.log(`Making authenticated request to ${url}`);
        console.log('Request method:', method);
        console.log('Token present:', !!token);
        console.log('Auth header:', authHeader);
        console.log('Request headers:', headers);
        console.log('Request body:', options.body);
        
        // Ensure we're using the method from options and not overriding it
        const response = await fetch(url, { 
            ...options,
            method, // Explicitly set method
            headers 
        });
        
        if (response.status === 401) {
            console.error('Authentication failed:', await response.text());
            
            // Only clear the token if it was actually provided - otherwise we get stuck in a loop
            if (token && localStorage) {
                console.warn('Clearing invalid authentication token');
                localStorage.removeItem('authToken');
                // Use EventBus instead of window.dispatchEvent
                eventBus.emit(Events.AUTH.EXPIRED);
            }
            
            throw new Error('Authentication expired');
        }
        
        if (!response.ok) {
            let errorMessage = `Server returned ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData && errorData.message) {
                    errorMessage = errorData.message;
                }
            } catch (e) {
                console.error('Error parsing error response:', e);
            }
            throw new Error(errorMessage);
        }
        
        return response;
    } catch (error) {
        console.error('API request failed:', error);
        eventBus.emit(Events.SYSTEM.ERROR, { error: error.message });
        throw error;
    }
}