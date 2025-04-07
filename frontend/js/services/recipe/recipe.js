import { CONFIG } from '../../config.js';
import { eventBus, Events } from '../../core/eventBus.js';
import { BaseService } from '../../core/baseService.js';
import { fetchWithAuth } from '../../core/utils.js';

// Add this at the top of the file to catch any JSON parsing errors
window.onerror = function(message, source, lineno, colno, error) {
    console.log('%c GLOBAL ERROR CAUGHT ', 'background: red; color: white; font-size: 16px');
    console.log('Message:', message);
    console.log('Source:', source);
    console.log('Line:', lineno);
    console.log('Column:', colno);
    console.log('Error object:', error);
    return false; // Allow default error handling to continue
};

class RecipeService extends BaseService {
    constructor() {
        super();
        this.md = null;
        
        // Initialize the markdown renderer once DOM is loaded
        document.addEventListener('DOMContentLoaded', () => {
            this.initializeMarkdownRenderer();
            this.setupListeners();
        });
        
        this.setupEventHandlers();
    }

    initializeMarkdownRenderer() {
        // Try to initialize the markdown renderer
        try {
            // Check if markdown-it is available globally
            if (window && typeof window.markdownit === 'function') {
                this.md = window.markdownit({
                    html: false,  // Disable HTML tags in source
                    xhtmlOut: false,  // Use '/' to close single tags (<br />)
                    breaks: true,  // Convert '\n' in paragraphs into <br>
                    linkify: true  // Autoconvert URL-like text to links
                });
                console.log('Markdown renderer initialized successfully');
            } else {
                console.warn('markdown-it library not found, will use fallback formatting');
                // Retry in case the script is still loading
                setTimeout(() => {
                    if (!this.md && window && typeof window.markdownit === 'function') {
                        this.initializeMarkdownRenderer();
                    }
                }, 1000);
            }
        } catch (error) {
            console.error('Error initializing markdown renderer:', error);
        }
    }

    setupListeners() {
        const getRecipeBtn = document.getElementById('getRecipesBtn');
        if (getRecipeBtn) {
            console.log('Setting up recipe button listener');
            getRecipeBtn.addEventListener('click', () => this.generateRecipe());
        } else {
            console.warn('Get recipe button not found with ID: getRecipesBtn');
        }
    }

    setupEventHandlers() {
        // Listen for inventory updates - DON'T automatically generate recipes
        this.eventBus.on(Events.INVENTORY.UPDATED, () => {
            console.log('Recipe: Inventory updated - recipes ready to generate on demand');
            // Don't automatically call generateRecipe to prevent unwanted API calls
            // this.generateRecipe();
        });

        // Listen for auth events
        this.eventBus.on(Events.AUTH.LOGOUT, () => {
            console.log('Recipe: User logged out, clearing recipe');
            this.clearRecipe();
        });

        this.eventBus.on(Events.AUTH.LOGIN, () => {
            console.log('Recipe: User logged in, preparing recipe area');
            this.initializeRecipeArea();
        });
    }

    async generateRecipe() {
        console.log('%c RECIPE GENERATION STARTED ', 'background: blue; color: white; font-size: 14px');
        const recipeDisplay = document.getElementById('recipe-display');
        
        if (!recipeDisplay) {
            console.error('Recipe display container not found with ID: recipe-display');
            return;
        }
        
        try {
            // Show loading state
            recipeDisplay.innerHTML = `
                <div class="recipe-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Generating recipe suggestions...</p>
                </div>
            `;
            
            const recipeUrl = `${CONFIG.SERVICES.RECIPE.URL}${CONFIG.SERVICES.RECIPE.ENDPOINTS.GENERATE}`;
            const token = localStorage.getItem('authToken');
            
            if (!token) {
                throw new Error('Authentication token not found. Please log in.');
            }

            // Fetch inventory items to send with the request
            const inventoryItems = await this.getInventoryItems();
            if (!inventoryItems || inventoryItems.length === 0) {
                this.showEmptyState();
                return; // Don't proceed if inventory is empty
            }
            const itemNames = inventoryItems.map(item => item.name || item.item_name).filter(Boolean);
            console.log('Items to send for recipe generation:', itemNames);

            // Change to GET request and send items as a query parameter
            const queryParams = new URLSearchParams({ items: itemNames.join(',') }).toString();
            const requestUrl = `${recipeUrl}?${queryParams}`;
            console.log(`Recipe generation URL: ${requestUrl}`);

            // Request headers (no Content-Type needed for GET with no body)
            const requestHeaders = {
                'Authorization': `Bearer ${token}`
            };
            console.log('Request headers:', requestHeaders);
            
            console.log('%c Making API call... ', 'background: orange; color: black');
            
            // Change method to GET and remove body
            const response = await fetchWithAuth(
                requestUrl, // Use the URL with query parameters
                {
                    method: 'GET', // Change method to GET
                    headers: requestHeaders
                    // No body for GET request
                }
            );
            
            console.log('%c RESPONSE RECEIVED ', 'background: green; color: white; font-size: 14px');
            console.log('Response status:', response.status);
            console.log('Response status text:', response.statusText);
            console.log('Response headers:', Object.fromEntries([...response.headers.entries()]));
            
            // Check content type before doing anything else
            const contentType = response.headers.get('content-type');
            console.log('%c Response content-type: ', 'color: blue', contentType);
            
            // Get response as text first to examine it
            const responseText = await response.text();
            console.log('%c Raw response text: ', 'color: blue', responseText.substring(0, 500));
            
            // Manual check if it starts with HTML
            if (responseText.trim().startsWith('<!DOCTYPE') || 
                responseText.trim().startsWith('<html') || 
                responseText.trim().startsWith('<')) {
                console.error('%c Response is HTML, not JSON ', 'background: red; color: white');
                throw new Error(`Server returned HTML instead of JSON. This usually indicates a server-side error or incorrect endpoint.`);
            }
            
            if (!response.ok) {
                // Response is not HTML but is also not a success
                let errorMessage = `Failed to generate recipe (status: ${response.status})`;
                try {
                    // Only try to parse as JSON if it looks like JSON
                    if (responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
                        const errorData = JSON.parse(responseText);
                        console.log('Error parsed as JSON:', errorData);
                        errorMessage = errorData.message || errorMessage;
                    } else {
                        errorMessage += ` - ${responseText.substring(0, 100)}...`;
                    }
                } catch (parseError) {
                    console.error('Error parsing error response:', parseError);
                }
                throw new Error(errorMessage);
            }
            
            let data;
            
            // Try to parse as JSON
            try {
                console.log('%c Attempting to parse JSON... ', 'color: blue');
                data = JSON.parse(responseText);
                console.log('%c JSON parse successful ', 'background: green; color: white');
            } catch (jsonError) {
                console.error('%c JSON parse error: ', 'background: red; color: white', jsonError);
                
                // Try to provide more context about the parsing error
                const errorLocation = jsonError.message.match(/position (\d+)/);
                if (errorLocation && errorLocation[1]) {
                    const position = parseInt(errorLocation[1]);
                    const start = Math.max(0, position - 20);
                    const end = Math.min(responseText.length, position + 20);
                    console.error('JSON error context:', responseText.substring(start, end));
                    console.error('Character at position:', responseText.charAt(position));
                }
                
                throw new Error(`Failed to parse JSON response: ${jsonError.message}`);
            }
            
            console.log('%c Recipe response data: ', 'color: green', data);
            
            if (!data.recipe) {
                throw new Error('No recipe was returned from the service');
            }
            
            const recipeHtml = this.renderMarkdown(data.recipe);
            recipeDisplay.innerHTML = `
                <div class="recipe-content">
                    ${recipeHtml}
                </div>
            `;
            
            // Notify success
            this.showSuccess('Recipe generated successfully');
            
        } catch (error) {
            console.error('%c ERROR GENERATING RECIPE: ', 'background: red; color: white; font-size: 14px', error);
            recipeDisplay.innerHTML = `
                <div class="recipe-error">
                    <p>Error generating recipe: ${error.message}</p>
                    <button id="retry-recipe" class="btn">Try Again</button>
                </div>
            `;
            
            const retryButton = document.getElementById('retry-recipe');
            if (retryButton) {
                retryButton.addEventListener('click', () => this.generateRecipe());
            }
            
            this.showError(error.message);
        }
    }

    async getInventoryItems() {
        // Get fresh inventory items every time
        try {
            const response = await fetchWithAuth(`${CONFIG.SERVICES.INVENTORY.URL}/items`);
            const data = await response.json();
            
            console.log('Retrieved inventory items for recipe:', data);
            
            // Handle different response structures
            if (Array.isArray(data)) {
                return data;
            } else if (data.items && Array.isArray(data.items)) {
                return data.items;
            } else if (data.items) {
                return [data.items];
            } else {
                console.warn('Unexpected inventory data format:', data);
                return [];
            }
        } catch (error) {
            console.error('Error fetching inventory items:', error);
            throw new Error('Failed to get inventory items: ' + error.message);
        }
    }

    renderMarkdown(markdown) {
        if (!markdown) return '';
        
        try {
            // First try to use the class instance
            if (this.md) {
                return this.md.render(markdown);
            }
            // If not available, try the global instance
            else if (window && typeof window.markdownit === 'function') {
                const md = window.markdownit();
                return md.render(markdown);
            }
            // If nothing works, use basic format
            else {
                return this.formatBasicMarkdown(markdown);
            }
        } catch (error) {
            console.error('Error rendering markdown:', error);
            return this.formatBasicMarkdown(markdown);
        }
    }

    formatBasicMarkdown(text) {
        if (!text) return '';
        
        // Basic markdown formatting as fallback
        return text
            // Headers
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Newlines
            .replace(/\n/g, '<br>')
            // Lists
            .replace(/^- (.*$)/gm, '<ul><li>$1</li></ul>')
            .replace(/<\/ul><ul>/g, '')
            // Links
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
    }

    showEmptyState() {
        const recipeDisplay = document.getElementById('recipe-display');
        if (!recipeDisplay) return;

        recipeDisplay.innerHTML = `
            <div class="markdown-body">
                <p>Add some items to your grocery list to get recipe suggestions.</p>
            </div>`;
    }

    handleError(error) {
        const recipeDisplay = document.getElementById('recipe-display');
        if (!recipeDisplay) return;

        recipeDisplay.innerHTML = `
            <div class="markdown-body error">
                <p>Error: ${error.message}</p>
                <p>Please try again later.</p>
            </div>`;
        this.showError(error.message);
        this.eventBus.emit(Events.RECIPE.ERROR, { error: error.message });
    }

    clearRecipe() {
        const recipeDisplay = document.getElementById('recipe-display');
        if (!recipeDisplay) return;
        
        recipeDisplay.innerHTML = `
            <div class="markdown-body">
                <p>Add items to your grocery list to get recipe suggestions.</p>
            </div>`;
    }

    initializeRecipeArea() {
        const recipeDisplay = document.getElementById('recipe-display');
        if (!recipeDisplay) return;

        recipeDisplay.innerHTML = `
            <div class="markdown-body">
                <p>Click "Get Recipe Suggestions" to generate recipes based on your grocery list.</p>
            </div>`;
    }

    onAuthExpired() {
        this.clearRecipe();
        super.onAuthExpired();
    }

    getCurrentInventory() {
        // Get the current inventory items from the DOM
        const items = [];
        const groceryListBody = document.getElementById('groceryListBody');
        
        if (groceryListBody) {
            const rows = groceryListBody.querySelectorAll('tr');
            rows.forEach(row => {
                const nameCell = row.querySelector('td:first-child');
                if (nameCell) {
                    items.push(nameCell.textContent.trim());
                }
            });
        }
        
        return items;
    }
}

export const recipeService = new RecipeService();