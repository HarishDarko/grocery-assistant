// export function showMessage(message, isError = false, duration = 3000) {
//     const messageArea = document.getElementById('message-area');
//     if (!messageArea) return;
    
//     messageArea.textContent = message;
//     messageArea.className = isError ? 'error' : 'success';

//     if (duration) {
//         setTimeout(() => {
//             messageArea.textContent = '';
//             messageArea.className = '';
//         }, duration);
//     }
// }

// export async function fetchWithAuth(url, options = {}) {
//     const token = localStorage.getItem('authToken');
//     const headers = {
//         'Content-Type': 'application/json',
//         ...(token && { 'Authorization': `Bearer ${token}` }),
//         ...options.headers
//     };

//     try {
//         const response = await fetch(url, { ...options, headers });
//         if (response.status === 401) {
//             // Token expired or invalid
//             localStorage.removeItem('authToken');
//             window.dispatchEvent(new CustomEvent('auth:expired'));
//             throw new Error('Authentication expired');
//         }
//         return response;
//     } catch (error) {
//         console.error('API request failed:', error);
//         throw error;
//     }
// }