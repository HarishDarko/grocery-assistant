import { CONFIG } from '../../config.js';
import { eventBus, Events } from '../../core/eventBus.js';
import { BaseService } from '../../core/baseService.js';
import { fetchWithAuth } from '../../core/utils.js';

class AuthService extends BaseService {
    constructor() {
        super();
        this.token = localStorage.getItem('authToken');
        this.refreshTimer = null;
        this.setupListeners();
        this.setupEventHandlers();
        this.initializeAuthState();
        this.setupTokenRefresh();
    }

    setupListeners() {
        console.log('Setting up auth listeners');
        
        // Form submissions
        this.bindFormListener('loginForm', this.handleLogin.bind(this));
        this.bindFormListener('registerForm', this.handleRegister.bind(this));
        
        // Also bind to the login button directly in case the form doesn't catch the event
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            console.log('Setting up direct login button listener');
            loginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Login button clicked directly');
                const form = document.getElementById('loginForm');
                if (form) {
                    this.handleLogin({ 
                        preventDefault: () => {},
                        target: form 
                    });
                }
            });
        }
        
        // Button clicks
        this.bindClickListener('logoutBtn', this.handleLogout.bind(this));
        this.bindClickListener('showRegister', this.showRegistrationForm.bind(this));
        this.bindClickListener('showLogin', this.showLoginForm.bind(this));
    }

    setupEventHandlers() {
        // Auth state changes
        this.eventBus.on(Events.AUTH.LOGIN, (data) => {
            console.log('Auth: User logged in', data);
            this.persistAuthData(data.token);
        });

        this.eventBus.on(Events.AUTH.LOGOUT, () => {
            console.log('Auth: User logged out');
            this.clearAuthData();
        });

        // Error handling
        this.eventBus.on(Events.AUTH.ERROR, (error) => {
            this.showError(error.message);
        });
    }

    initializeAuthState() {
        const timestamp = localStorage.getItem('tokenTimestamp');
        if (this.token && timestamp) {
            const now = Date.now();
            const tokenAge = now - parseInt(timestamp);
            
            if (tokenAge < CONFIG.AUTH.TOKEN_EXPIRY) {
                this.updateAuthState(this.token);
            } else {
                this.handleLogout();
            }
        }
    }

    setupTokenRefresh() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = setInterval(() => {
            if (this.token) this.refreshToken();
        }, CONFIG.AUTH.TOKEN_REFRESH_THRESHOLD);
    }

    async refreshToken() {
        try {
            const response = await fetchWithAuth(
                `${CONFIG.SERVICES.AUTH.URL}/refresh-token`
            );
            const data = await response.json();
            if (data.token) {
                this.updateAuthState(data.token);
            }
        } catch (error) {
            this.handleLogout();
        }
    }

    // Private helper methods
    bindFormListener(formId, handler) {
        const form = document.getElementById(formId);
        if (!form) {
            console.warn(`Form with ID ${formId} not found`);
            return;
        }

        console.log(`Setting up listener for form: ${formId}`);
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log(`Form ${formId} submitted`);
            const submitBtn = form.querySelector('button[type="submit"]'); // Use specific selector
            if (submitBtn) submitBtn.disabled = true;
            
            try {
                await handler(e); // Calls the specific handler (e.g., handleRegister)
            } catch (error) {
                console.error(`Error in form handler for ${formId}:`, error);
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    bindClickListener(elementId, handler) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`Element with ID ${elementId} not found`);
            return;
        }
        
        console.log(`Setting up click listener for: ${elementId}`);
        element.addEventListener('click', (e) => {
            e.preventDefault();
            console.log(`Element ${elementId} clicked`);
            try {
                handler(e);
            } catch (error) {
                console.error(`Error in click handler for ${elementId}:`, error);
            }
        });
    }

    persistAuthData(token) {
        console.log('Persisting auth token:', token);
        localStorage.setItem('authToken', token);
        localStorage.setItem('tokenTimestamp', Date.now().toString());
    }

    clearAuthData() {
        console.log('Clearing auth token');
        localStorage.removeItem('authToken');
        localStorage.removeItem('tokenTimestamp');
    }

    showRegistrationForm() {
        this.toggleForms('register');
    }

    showLoginForm() {
        this.toggleForms('login');
    }

    // Public API methods
    async handleLogin(event) {
        // Get the form element correctly
        const form = document.getElementById('loginForm');
        if (!form) {
            console.error("Login form element not found!");
            this.showError("Login UI is broken.");
            return;
        }
        
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const username = usernameInput ? usernameInput.value : null;
        const password = passwordInput ? passwordInput.value : null;

        if (!username || !password) {
            this.showError('Username and password are required');
            return;
        }

        try {
            console.log(`Attempting login for user: ${username}`);
            
            // Clear any existing tokens first
            this.clearAuthData();
            
            // Build the correct login URL
            const loginUrl = `${CONFIG.SERVICES.AUTH.URL}${CONFIG.SERVICES.AUTH.ENDPOINTS.LOGIN}`;
            console.log('Login URL:', loginUrl);
            
            // Do NOT use fetchWithAuth for login - use regular fetch
            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            console.log('Login response status:', response.status);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Login failed');
            }
            
            const data = await response.json();
            console.log('Login response data:', data);

            if (!data.token) {
                throw new Error('No authentication token received from server');
            }

            console.log('Login successful, received token');
            
            // Store token in localStorage
            this.persistAuthData(data.token);
            
            // Update UI and application state
            this.updateAuthState(data.token);
            
            this.showSuccess('Login successful');
            form.reset(); // Now form should be the correct element
            
            // Emit login success event
            this.eventBus.emit(Events.AUTH.LOGIN_SUCCESS, { 
                username: username 
            });
            
        } catch (error) {
            console.error('Login error:', error);
            this.eventBus.emit(Events.AUTH.ERROR, { error: error.message });
            this.showError(error.message);
        }
    }

    async handleRegister(event) {
        console.log("[handleRegister] Starting..."); // Log Start
        // Get the form element correctly
        const form = document.getElementById('registerForm'); 
        if (!form) {
            console.error("Register form element not found!");
            this.showError("Registration UI is broken.");
            return;
        }

        // Get values using the updated IDs
        const usernameInput = document.getElementById('registerUsername');
        const emailInput = document.getElementById('registerEmail'); // Get email input
        const passwordInput = document.getElementById('registerPassword');
        
        const username = usernameInput ? usernameInput.value : null;
        const email = emailInput ? emailInput.value : null; // Get email value
        const password = passwordInput ? passwordInput.value : null;

        console.log(`[handleRegister] Values - User: ${username}, Email: ${email}, Pass length: ${password?.length}`); // Log Values

        // Basic client-side validation (already handled by 'required' and 'minlength' in HTML, but good defense)
        if (!username || !email || !password) { 
            console.log("[handleRegister] Validation failed: Missing fields"); // Log Fail
            this.showError('Username, email, and password are required');
            return;
        }
        if (password.length < 8) {
            console.log("[handleRegister] Validation failed: Password too short"); // Log Fail
            this.showError('Password must be at least 8 characters');
            return;
        }
        // Basic email format check (optional, type="email" helps)
        if (!email.includes('@')) {
            console.log("[handleRegister] Validation failed: Invalid email"); // Log Fail
            this.showError('Please enter a valid email address');
            return;
        }

        console.log("[handleRegister] Validation passed. Proceeding to fetch."); // Log Pass
        try {
            const registerUrl = `${CONFIG.SERVICES.AUTH.URL}${CONFIG.SERVICES.AUTH.ENDPOINTS.REGISTER}`;
            console.log('[handleRegister] Register URL:', registerUrl);
            
            console.log("[handleRegister] Calling fetch..."); // Log Fetch
            const response = await fetch(registerUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    email: email, // Include email in the body
                    password: password
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Registration failed');
            }

            const data = await response.json();
            
            // Registration successful, log the user in immediately
            this.showSuccess('Registration successful! Logging you in...');
            
            // Persist the token received from registration
            this.persistAuthData(data.token);
            
            // Update UI and application state
            this.updateAuthState(data.token);

            form.reset(); // This should now work as it's a form element

            // Emit registration success event (which also implies login)
            this.eventBus.emit(Events.AUTH.LOGIN_SUCCESS, { 
                username: username // Or use data.user.username if returned
            });
            
        } catch (error) {
            console.error('Registration error:', error);
            this.eventBus.emit(Events.AUTH.ERROR, { error: error.message });
            this.showError(error.message);
        }
        console.log("[handleRegister] Finished."); // Log End
    }

    handleLogout() {
        this.updateAuthState(null);
        this.showSuccess('Logged out successfully');
    }

    updateAuthState(token) {
        console.log('Updating auth state, token present:', !!token);
        this.token = token;
        
        // Show/hide sections based on login state
        document.body.className = token ? 'logged-in' : 'logged-out';
        
        if (token) {
            // User is logged in
            this.persistAuthData(token);
            
            // Hide login section, show app sections
            const authSection = document.getElementById('auth');
            const inventorySection = document.getElementById('inventory');
            const recipeSection = document.getElementById('recipe');
            
            console.log('DOM elements found:', {
                authSection: !!authSection,
                inventorySection: !!inventorySection,
                recipeSection: !!recipeSection
            });
            
            if (authSection) authSection.style.display = 'none';
            if (inventorySection) inventorySection.style.display = 'block';
            if (recipeSection) recipeSection.style.display = 'block';
            
            // Show logout button in header
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            
            // Emit login event with small delay to ensure DOM is ready
            setTimeout(() => {
                this.eventBus.emit(Events.AUTH.LOGIN, { token });
                console.log('Auth login event emitted');
            }, 500);
        } else {
            // User is logged out
            this.clearAuthData();
            
            // Show login section, hide app sections
            const authSection = document.getElementById('auth');
            const inventorySection = document.getElementById('inventory');
            const recipeSection = document.getElementById('recipe');
            
            if (authSection) authSection.style.display = 'block';
            if (inventorySection) inventorySection.style.display = 'none';
            if (recipeSection) recipeSection.style.display = 'none';
            
            // Hide logout button in header
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) logoutBtn.style.display = 'none';
            
            this.eventBus.emit(Events.AUTH.LOGOUT);
        }
    }

    toggleForms(show) {
        // Get references to form elements
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        
        if (!loginForm || !registerForm) {
            console.error('Unable to toggle forms: form elements not found in DOM');
            return;
        }
        
        if (show === 'register') {
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
        } else {
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
        }
    }

    // Public API for other services
    isAuthenticated() {
        return !!this.token;
    }

    getToken() {
        return this.token;
    }
}

export const authService = new AuthService();