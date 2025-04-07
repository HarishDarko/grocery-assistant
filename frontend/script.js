// grocery-assistant/frontend/script.js

// Ensure CONFIG is loaded before using it
if (typeof window.CONFIG === 'undefined' || typeof window.CONFIG.API_BASE_URL === 'undefined') {
    console.error("CRITICAL: Frontend configuration (CONFIG or CONFIG.API_BASE_URL) is not loaded. Check index.html includes config.js correctly.");
    // Optionally display an error to the user or halt execution
    alert("Application configuration is missing. Please contact support.");
    throw new Error("Frontend configuration failed to load.");
}

// Add this at the top of the file
const markdownit = window.markdownit();

// Initialize markdown-it with specific options
const md = window.markdownit({
    html: true,
    breaks: true,
    linkify: true,
    typographer: true
});

// DOM Elements - Add error checking
const itemForm = document.getElementById('addItemForm') || document.createElement('form');
const itemInput = document.getElementById('itemName');
const messageArea = document.getElementById('message-area');
const groceryListBody = document.getElementById('groceryListBody');
const sortSelect = document.getElementById('sortBy'); // Get the select element
const sortOrderBtn = document.getElementById('sortOrder'); // Get the button
const recipeDisplay = document.getElementById('recipe-display');
let authToken = null;
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegisterLink = document.getElementById('showRegister');
const showLoginLink = document.getElementById('showLogin');

// Global state for filters and sorting
let currentSort = { field: 'added', ascending: true }; // Keep only sorting state, default sort by added date

// Store items state
let grocery_items = [];

// Add cleanup function
function cleanupEventListeners() {
    try {
        sortSelect?.removeEventListener('change', updateSort);
        sortOrderBtn?.removeEventListener('click', toggleSortOrder);
        loginForm?.removeEventListener('submit', handleLogin);
        registerForm?.removeEventListener('submit', handleRegister);
        itemForm?.removeEventListener('submit', addItem); // Correct function
    } catch (error) {
        console.error('Error cleaning up event listeners:', error);
    }
}

// Modify showMessage function to accept a duration parameter
function showMessage(message, isError = false, duration = 3000) {
    if (!messageArea) {
        console.error('Message area not found');
        return;
    }
    
    try {
        messageArea.textContent = message;
        messageArea.className = isError ? 'error' : 'success';

        if (duration) {
            setTimeout(() => {
                if (messageArea) {
                    messageArea.textContent = '';
                    messageArea.className = '';
                }
            }, duration);
        }
    } catch (error) {
        console.error('Error showing message:', error);
    }
}

// Add auth state management
function updateAuthState(token) {
    try {
        const authContainer = document.getElementById('auth-container');
        const mainContainer = document.getElementById('main-container');
        
        if (!authContainer || !mainContainer) {
            console.error('Required containers not found');
            return;
        }

        authToken = token;
        if (token) {
            localStorage.setItem('authToken', token);
            localStorage.setItem('tokenTimestamp', Date.now().toString());
            authContainer.style.display = 'none';
            mainContainer.style.display = 'block';
            loadInitialData();
        } else {
            localStorage.removeItem('authToken');
            localStorage.removeItem('tokenTimestamp');
            authContainer.style.display = 'block';
            mainContainer.style.display = 'none';
            grocery_items = [];
        }
    } catch (error) {
        showMessage('Error updating authentication state', true);
        console.error(error);
    }
}

// Add auth header helper
function getAuthHeaders() {
    return {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
    };
}

// Add login handler
async function handleLogin(event) {
    event.preventDefault();
    const submitButton = loginForm.querySelector('button');
    submitButton.disabled = true;

    try {
        const username = document.getElementById('loginUsername')?.value?.trim();
        const password = document.getElementById('loginPassword')?.value;

        if (!username || !password) {
            throw new Error('Username and password are required');
        }

        const response = await fetch(`${window.CONFIG.API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Login failed');
        }

        // Clear form
        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';

        updateAuthState(data.token);
        showMessage('Login successful');

    } catch (error) {
        showMessage(error.message, true);
    } finally {
        submitButton.disabled = false;
    }
}

// Add register handler
async function handleRegister(event) {
    event.preventDefault();
    const submitButton = registerForm.querySelector('button');
    submitButton.disabled = true;
    try {
        const username = document.getElementById('registerUsername').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;

        const response = await fetch(`${window.CONFIG.API_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Registration failed');
        }

        updateAuthState(data.token);
        showMessage('Registration successful');

    } catch (error) {
        showMessage(error.message, true);
    } finally {
        submitButton.disabled = false;
    }
    
}

// Function to add a new item
async function addItem(event) {
    event.preventDefault();
    const itemName = itemInput?.value?.trim();
    if (!itemName) {
        showMessage('Please enter an item name', true);
        return;
    }

    const submitButton = itemForm.querySelector('button');
    submitButton.disabled = true;

    try {
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/add_item`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ item_name: itemName })
        });

        if (handleTokenExpiry(response)) return;

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to add item');
        }

        // Get updated items after adding
        const itemsResponse = await fetch(`${window.CONFIG.API_BASE_URL}/get_items`, {
            headers: getAuthHeaders()
        });

        if (handleTokenExpiry(itemsResponse)) return;

        const itemsData = await itemsResponse.json();
        
        if (itemsData.success) {
            grocery_items = itemsData.items;
            updateDisplay();
        }

        // Clear input
        itemInput.value = '';
        showMessage('Item added successfully');

    } catch (error) {
        showMessage(error.message, true);
    } finally {
        submitButton.disabled = false;
    }
}

// Function to update the table
function updateTable(items) {
    if (!groceryListBody) return;
    
    groceryListBody.innerHTML = '';

    items.forEach(item => {
        const row = document.createElement('tr');

        // Name cell with timestamp
        const nameCell = document.createElement('td');
        const nameDiv = document.createElement('div');
        nameDiv.className = 'item-info';

        const nameText = document.createElement('span');
        nameText.textContent = item.item_name;

        const timestamp = document.createElement('span');
        timestamp.className = 'timestamp';
        timestamp.textContent = `Added: ${item.added_on}`;

        nameDiv.appendChild(nameText);
        nameDiv.appendChild(timestamp);
        nameCell.appendChild(nameDiv);

        // Category cell with tag styling
        const categoryCell = document.createElement('td');
        const categoryTag = document.createElement('span');
        categoryTag.className = 'category-tag';
        categoryTag.textContent = item.category;
        categoryCell.appendChild(categoryTag);

        // Expiry cell
        const expiryCell = document.createElement('td');
        expiryCell.textContent = item.predicted_expiry;

        // Action cell
        const actionCell = document.createElement('td');
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = () => deleteItem(item._id); // Use item._id instead of item_name
        actionCell.appendChild(deleteButton);

        row.appendChild(nameCell);
        row.appendChild(categoryCell);
        row.appendChild(expiryCell);
        row.appendChild(actionCell);
        groceryListBody.appendChild(row);
    });
}

// Update deleteItem function
async function deleteItem(itemId) {
    try {
        if (!itemId) {
            throw new Error('Item ID is required');
        }
        
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/delete_item/${itemId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (handleTokenExpiry(response)) return;

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to delete item');
        }

        // Update local state with the returned items
        grocery_items = data.items;
        updateDisplay();
        showMessage('Item deleted successfully');

    } catch (error) {
        showMessage(error.message, true);
    }
}

function handleTokenExpiry(response) {
    if (!response) return false;
    
    if (response.status === 401) {
        const token = localStorage.getItem('authToken');
        const timestamp = localStorage.getItem('tokenTimestamp');
        
        // Clear expired token
        if (token) {
            updateAuthState(null);
            showMessage('Session expired. Please login again.', true);
            return true;
        }
    }
    return false;
}

// Update getRecipes function
async function getRecipes() {
    if (!recipeDisplay) return;

    recipeDisplay.innerHTML = '<div class="markdown-body">Loading recipes...</div>';

    try {
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/get_recipes`, {
            headers: getAuthHeaders()
        });

        // Check for token expiry
        if (handleTokenExpiry(response)) return;

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to get recipes');
        }

        // Handle no items case
        if (!data.recipe) {
            recipeDisplay.innerHTML = `
                <div class="markdown-body">
                    <p>No recipes available. Please add some items to your grocery list.</p>
                </div>`;
            return;
        }

        try {
            // Convert Markdown to HTML with error handling
            const htmlContent = md.render(data.recipe);
            recipeDisplay.innerHTML = `
                <div class="markdown-body">
                    ${htmlContent}
                </div>`;
        } catch (mdError) {
            throw new Error('Error formatting recipe: ' + mdError.message);
        }

    } catch (error) {
        recipeDisplay.innerHTML = `
            <div class="markdown-body error">
                <p>Error: ${error.message}</p>
                <p>Please try again later.</p>
            </div>`;
        showMessage(error.message, true);
    }
}

// Load initial data when page loads
async function loadInitialData() {
    try {
        const response = await fetch(`${window.CONFIG.API_BASE_URL}/get_items`, {
            headers: getAuthHeaders()
        });
        if (handleTokenExpiry(response)) return;

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to load items');
        }

        grocery_items = data.items; // Update the items state
        initializeControls(); // Initialize on data load
    } catch (error) {
        showMessage('Failed to load initial data', true);
    }
}

// Update updateSort function
function updateSort(event) {
    if(!event.target.value) return;
    currentSort.field = event.target.value;
    updateDisplay();
}

// Update initializeControls function.  This is now called *after* data is loaded.
function initializeControls() {
    // Add event listeners for sort controls (ensure elements exist)
    if (sortSelect && sortOrderBtn) {
        sortSelect.addEventListener('change', updateSort);
        sortOrderBtn.addEventListener('click', toggleSortOrder);

        //Set Initial Values.
        sortSelect.value = 'added';
        sortOrderBtn.textContent = '↑';
    }
    updateDisplay();
}

// Update toggleSortOrder function
function toggleSortOrder() {
    currentSort.ascending = !currentSort.ascending;
    sortOrderBtn.textContent = currentSort.ascending ? '↑' : '↓'; // Update button text
    updateDisplay();
}

// Update the updateDisplay function
function updateDisplay() {
    try {
        let sortedItems = [...grocery_items];
        sortedItems.sort((a, b) => {
            switch (currentSort.field) {
                case 'name':
                    return currentSort.ascending 
                        ? a.item_name.localeCompare(b.item_name)
                        : b.item_name.localeCompare(a.item_name);
                case 'category':
                    return currentSort.ascending
                        ? a.category.localeCompare(b.category)
                        : b.category.localeCompare(a.category);
                case 'expiry':
                    const daysA = getExpiryDays(a.predicted_expiry);
                    const daysB = getExpiryDays(b.predicted_expiry);
                    return currentSort.ascending ? daysA - daysB : daysB - daysA;
                case 'added':
                    try {
                        const dateA = new Date(a.added_on.replace(" ", "T"));
                        const dateB = new Date(b.added_on.replace(" ", "T"));
                        return currentSort.ascending ? dateA - dateB : dateB - dateA;
                    } catch {
                        return 0;
                    }
                default:
                    return 0;
            }
        });

        updateTable(sortedItems);
    } catch (error) {
        showMessage('Error updating display', true);
        console.error(error);
    }
}

// Helper function to consistently get expiry days
function getExpiryDays(expiryString) {
    if (!expiryString) {
        return -Infinity; // Handle missing expiry info
    }
    const lowerExpiry = expiryString.toLowerCase();
    if (lowerExpiry.includes('indefinite')) {
        return Infinity; // Treat indefinite as the longest expiry
    }
    let days = parseInt(lowerExpiry.match(/\d+/)?.[0], 10);
    if (isNaN(days)) {
        return 0;  // Default to 0 if parsing fails
    }
    if (lowerExpiry.includes('week')) {
        days *= 7;
    } else if (lowerExpiry.includes('month')) {
        days *= 30;
    }
    return days;
}

// Add auth form toggle handlers
showRegisterLink?.addEventListener('click', (e) => {
    e.preventDefault();
    const loginBox = document.querySelector('.auth-box:first-child');
    const registerBox = document.querySelector('.auth-box:last-child');
    if (loginBox && registerBox) {
        loginBox.style.display = 'none';
        registerBox.style.display = 'block';
    }
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('.auth-box:first-child').style.display = 'block';
    document.querySelector('.auth-box:last-child').style.display = 'none';
});

// Add auth form submit handlers
loginForm.addEventListener('submit', handleLogin);
registerForm.addEventListener('submit', handleRegister);

// Add logout handler
function handleLogout() {
    updateAuthState(null);
    showMessage('Logged out successfully');
}

document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

// Update DOMContentLoaded to check for existing token
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Clean up existing listeners
        cleanupEventListeners();
        
        // Check token and its expiry
        const token = localStorage.getItem('authToken');
        const timestamp = localStorage.getItem('tokenTimestamp');
        const now = Date.now();
        
        if (token && timestamp && (now - parseInt(timestamp)) < 24 * 60 * 60 * 1000) {
            updateAuthState(token);
        } else {
            // Clear expired token
            localStorage.removeItem('authToken');
            localStorage.removeItem('tokenTimestamp');
            updateAuthState(null);
        }

        // Add event listeners only once
        sortSelect?.addEventListener('change', updateSort);
        sortOrderBtn?.addEventListener('click', toggleSortOrder);
        loginForm?.addEventListener('submit', handleLogin);
        registerForm?.addEventListener('submit', handleRegister);
        itemForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            addItem(e);
        });
        
    } catch (error) {
        console.error('Error during initialization:', error);
        showMessage('Error initializing application', true);
    }
});

// Cleanup on page unload
window.addEventListener('unload', cleanupEventListeners);

