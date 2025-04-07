import { authService } from './services/auth/auth.js';
import { inventoryService } from './services/inventory/inventory.js';
import { recipeService } from './services/recipe/recipe.js';
import { eventBus, Events } from './core/eventBus.js';

// Initialize theme based on user preference or system preference
function initializeTheme() {
    const savedTheme = localStorage.getItem('preferredTheme');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    } else if (prefersDarkScheme.matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
        updateThemeIcon('dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        updateThemeIcon('light');
    }
}

// Update the theme toggle icon based on current theme
function updateThemeIcon(theme) {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            if (theme === 'dark') {
                icon.className = 'fas fa-sun';
            } else {
                icon.className = 'fas fa-moon';
            }
        }
    }
}

// Toggle between light and dark themes
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('preferredTheme', newTheme);
    
    updateThemeIcon(newTheme);
}

// Initialize event listeners once DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('App initializing...');

    // Initialize theme
    initializeTheme();
    
    // Setup theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Check if service workers are supported
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/serviceWorker.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.error('Service Worker registration failed', err));
    }
});

// Initialize services
// These will set up their own event listeners in their constructors

// Listen for global events
eventBus.on(Events.SYSTEM.ERROR, (error) => {
    console.error('System Error:', error);
    showErrorMessage(error.message || 'An unexpected error occurred');
});

function showErrorMessage(message) {
    const messageArea = document.getElementById('messageArea');
    
    if (!messageArea) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message message-error';
    messageElement.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <span>${message}</span>
    `;
    
    messageArea.appendChild(messageElement);
    
    // Remove message after delay
    setTimeout(() => {
        messageElement.classList.add('fade-out');
        setTimeout(() => messageElement.remove(), 300);
    }, 5000);
} 