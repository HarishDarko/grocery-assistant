import { CONFIG } from '../../config.js';
import { eventBus, Events } from '../../core/eventBus.js';
import { BaseService } from '../../core/baseService.js';
import { fetchWithAuth } from '../../core/utils.js';

class InventoryService extends BaseService {
    constructor() {
        super();
        this.pageSize = 10;
        this.currentPage = 1;
        this.items = [];
        this.currentSort = { field: 'added', ascending: true };
        
        // Initialize event listeners after DOM is loaded
        document.addEventListener('DOMContentLoaded', () => {
            console.log('Inventory service initializing event listeners');
            this.setupListeners();
        });
        
        // Set up event handlers for auth events immediately
        this.setupEventHandlers();
    }

    setupListeners() {
        const addItemForm = document.getElementById('addItemForm');
        if (addItemForm) {
            console.log('Setting up add item form listener');
            addItemForm.addEventListener('submit', e => this.handleAddItem(e));
        } else {
            console.warn('Add item form not found in DOM');
        }
        
        const sortBySelect = document.getElementById('sortBy');
        if (sortBySelect) {
            console.log('Setting up sort select listener');
            sortBySelect.addEventListener('change', e => this.handleSort(e));
        } else {
            console.warn('Sort select not found in DOM');
        }
        
        const sortOrderBtn = document.getElementById('sortOrder');
        if (sortOrderBtn) {
            console.log('Setting up sort order button listener');
            sortOrderBtn.addEventListener('click', () => this.toggleSortOrder());
        } else {
            console.warn('Sort order button not found in DOM');
        }
    }

    setupEventHandlers() {
        // Listen for auth events
        this.eventBus.on(Events.AUTH.LOGIN, (data) => {
            console.log('Inventory: Auth state changed, loading items', data);
            setTimeout(() => this.loadItems(), 500); // Add delay to ensure DOM is ready
        });

        this.eventBus.on(Events.AUTH.LOGOUT, () => {
            console.log('Inventory: User logged out, clearing items');
            this.clearItems();
        });
    }

    async handleAddItem(event) {
        event.preventDefault();
        const itemInput = document.getElementById('itemName');
        const itemName = itemInput.value.trim();
        
        // Validate input
        if (!itemName || itemName.length < 2) {
            this.showError('Please enter a valid item name (at least 2 characters)');
            return;
        }
        
        const submitBtn = event.target.querySelector('button');
        submitBtn.disabled = true;

        try {
            console.log('Adding new item:', itemName);
            // Format the item name - capitalize first letter
            const formattedName = itemName.charAt(0).toUpperCase() + itemName.slice(1).toLowerCase();
            
            // Fix the URL construction to properly use the correct endpoint ('ITEMS')
            const addItemUrl = `${CONFIG.SERVICES.INVENTORY.URL}${CONFIG.SERVICES.INVENTORY.ENDPOINTS.ITEMS}`; // Use ITEMS endpoint
            console.log('Using URL for add item:', addItemUrl);
            
            const response = await fetchWithAuth(
                addItemUrl,
                {
                    method: 'POST',
                    body: JSON.stringify({ item_name: formattedName })
                }
            );

            const data = await response.json();
            console.log('Add item response:', data);
            
            if (!response.ok) throw new Error(data.message || 'Failed to add item');

            this.eventBus.emit(Events.INVENTORY.ITEM_ADDED, {
                itemId: data.itemId,
                name: formattedName
            });

            // Reload items immediately
            await this.loadItems();
            itemInput.value = '';
            this.showSuccess(`${formattedName} added successfully!`);
        } catch (error) {
            console.error('Error adding item:', error);
            this.eventBus.emit(Events.INVENTORY.ERROR, { error: error.message });
            this.showError(error.message);
        } finally {
            submitBtn.disabled = false;
        }
    }

    async loadItems(page = 1) {
        try {
            console.log('Loading inventory items, page:', page);
            const response = await fetchWithAuth(
                `${CONFIG.SERVICES.INVENTORY.URL}/items?page=${page}&size=${this.pageSize}`
            );
            
            const data = await response.json();
            console.log('Inventory API response data:', data);
            
            if (!response.ok) throw new Error(data.message || 'Failed to load items');
            
            // Store the raw items data - ensure we have an array and format if needed
            if (Array.isArray(data.items)) {
                this.items = data.items;
            } else if (data.items) {
                this.items = [data.items];
            } else if (Array.isArray(data)) {
                this.items = data;
            } else {
                this.items = [];
            }
            
            console.log('Processed items array for display:', this.items);
            
            // Apply current sorting before displaying
            const sortedItems = this.getSortedItems();
            
            // Display the items in the UI
            this.displayItems(sortedItems);
            
            // Setup pagination if available
            if (data.pagination) {
                this.setupPagination(data.pagination);
            }
            
            // Notify other components that inventory was updated
            this.eventBus.emit(Events.INVENTORY.UPDATED, {
                items: this.items
            });
        } catch (error) {
            console.error('Error loading inventory items:', error);
            this.eventBus.emit(Events.INVENTORY.ERROR, { error: error.message });
            this.showError(error.message || 'Failed to load inventory items');
        }
    }

    displayItems(items = []) {
        const tbody = document.getElementById('groceryListBody');
        if (!tbody) {
            console.warn('Inventory tbody element not found with ID: groceryListBody');
            return;
        }
        
        console.log('Rendering inventory items:', items);
        
        try {
            // Clear existing items
            tbody.innerHTML = '';
            
            if (!items || items.length === 0) {
                const emptyRow = document.createElement('tr');
                emptyRow.innerHTML = `
                    <td colspan="4" class="empty-message">
                        <div class="empty-state">
                            <p>No items in your inventory yet</p>
                            <p>Add items using the form above</p>
                        </div>
                    </td>
                `;
                tbody.appendChild(emptyRow);
                return;
            }
            
            items.forEach(item => {
                console.log('Processing item:', JSON.stringify(item));
                
                // Extract key information safely
                const itemId = item._id || item.id || '';
                
                // Clean up item name
                let itemName = '';
                if (typeof item.name === 'string') {
                    itemName = item.name.replace(/Added:\s*.*$/i, '').trim();
                } else if (item.item_name && typeof item.item_name === 'string') {
                    itemName = item.item_name.replace(/Added:\s*.*$/i, '').trim();
                } else {
                    itemName = 'Unnamed Item';
                }
                
                // Format the name properly
                if (itemName && itemName.length > 0) {
                    itemName = itemName.charAt(0).toUpperCase() + itemName.slice(1).toLowerCase();
                }
                
                // Get category and expiry safely
                const category = item.category || 'General';
                const expiry = item.predicted_expiry || 'Not available';
                
                // Format added date
                const addedDate = item.added_date || item.added_on || new Date().toISOString();
                const formattedDate = this.formatDate(addedDate);
                
                // Create row following original structure
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="item-name">
                        ${itemName}
                        <div class="item-date">Added: ${formattedDate}</div>
                    </td>
                    <td class="item-category">${category}</td>
                    <td class="item-expiry">${expiry}</td>
                    <td class="actions">
                        <button class="delete-btn" data-id="${itemId}">Delete</button>
                    </td>
                `;
                
                // Attach event listeners to delete button
                const deleteBtn = row.querySelector('.delete-btn');
                if (deleteBtn && itemId) {
                    deleteBtn.addEventListener('click', () => {
                        if (confirm('Are you sure you want to delete this item?')) {
                            this.handleDeleteItem(itemId);
                        }
                    });
                }
                
                tbody.appendChild(row);
            });
        } catch (error) {
            console.error('Error displaying inventory items:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="4">
                        <div class="error-message">
                            <p>There was an error displaying your inventory</p>
                            <button id="retry-load" class="btn">Retry</button>
                        </div>
                    </td>
                </tr>
            `;
            
            const retryButton = document.getElementById('retry-load');
            if (retryButton) {
                retryButton.addEventListener('click', () => this.loadItems());
            }
        }
    }

    setupPagination(pagination) {
        if (!pagination) return;
        
        const paginationDiv = document.getElementById('pagination');
        if (!paginationDiv) {
            console.warn('Pagination controls element not found with ID: pagination');
            return;
        }
        
        paginationDiv.innerHTML = '';
        
        if (pagination.totalPages <= 1) return;
        
        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.innerText = '← Previous';
        prevBtn.disabled = pagination.currentPage === 1;
        prevBtn.addEventListener('click', () => {
            this.loadItems(pagination.currentPage - 1);
        });
        paginationDiv.appendChild(prevBtn);
        
        // Page buttons
        const maxPages = 5; // Show at most 5 page buttons
        const startPage = Math.max(1, pagination.currentPage - 2);
        const endPage = Math.min(pagination.totalPages, startPage + maxPages - 1);
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.innerText = i;
            pageBtn.classList.toggle('active', i === pagination.currentPage);
            pageBtn.addEventListener('click', () => {
                this.loadItems(i);
            });
            paginationDiv.appendChild(pageBtn);
        }
        
        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.innerText = 'Next →';
        nextBtn.disabled = pagination.currentPage === pagination.totalPages;
        nextBtn.addEventListener('click', () => {
            this.loadItems(pagination.currentPage + 1);
        });
        paginationDiv.appendChild(nextBtn);
    }

    formatDate(dateString) {
        if (!dateString) return 'Just now';
        
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Recently';
            
            // Format as relative time if recent
            const now = new Date();
            const diffMs = now - date;
            const diffSec = Math.floor(diffMs / 1000);
            const diffMin = Math.floor(diffSec / 60);
            const diffHour = Math.floor(diffMin / 60);
            const diffDay = Math.floor(diffHour / 24);
            
            if (diffDay < 1) {
                if (diffHour < 1) {
                    if (diffMin < 1) {
                        return 'Just now';
                    }
                    return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
                }
                return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
            } else if (diffDay < 7) {
                return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
            } else {
                // Format as date for older entries
                return date.toLocaleDateString(undefined, { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                });
            }
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'Unknown date';
        }
    }
    
    handleSort(event) {
        console.log('Sort changed:', event.target.value);
        this.currentSort.field = event.target.value;
        // Apply sorting immediately
        const sortedItems = this.getSortedItems();
        this.displayItems(sortedItems);
    }
    
    toggleSortOrder() {
        console.log('Toggling sort order from', this.currentSort.ascending);
        this.currentSort.ascending = !this.currentSort.ascending;
        
        // Update the sort icon
        const sortOrderBtn = document.getElementById('sortOrder');
        if (sortOrderBtn) {
            const icon = sortOrderBtn.querySelector('i');
            if (icon) {
                if (this.currentSort.ascending) {
                    icon.className = 'fas fa-sort-up';
                } else {
                    icon.className = 'fas fa-sort-down';
                }
            }
        }
        
        // Apply sorting immediately
        const sortedItems = this.getSortedItems();
        this.displayItems(sortedItems);
    }
    
    getSortedItems() {
        // Make a copy of the items array to avoid mutating the original
        return [...this.items].sort((a, b) => {
            let valueA, valueB;
            
            switch (this.currentSort.field) {
                case 'name':
                    valueA = this.getItemName(a).toLowerCase();
                    valueB = this.getItemName(b).toLowerCase();
                    return this.compareValues(valueA, valueB);
                    
                case 'category':
                    valueA = (a.category || 'General').toLowerCase();
                    valueB = (b.category || 'General').toLowerCase();
                    return this.compareValues(valueA, valueB);
                    
                case 'expiry':
                    valueA = this.getExpiryDays(a.predicted_expiry);
                    valueB = this.getExpiryDays(b.predicted_expiry);
                    return this.compareValues(valueA, valueB);
                    
                case 'added':
                default:
                    valueA = new Date(a.added_date || a.added_on || 0);
                    valueB = new Date(b.added_date || b.added_on || 0);
                    return this.compareValues(valueA, valueB);
            }
        });
    }
    
    compareValues(a, b) {
        if (a < b) return this.currentSort.ascending ? -1 : 1;
        if (a > b) return this.currentSort.ascending ? 1 : -1;
        return 0;
    }
    
    getItemName(item) {
        if (typeof item.name === 'string') {
            return item.name.replace(/Added:\s*.*$/i, '').trim();
        } else if (item.item_name && typeof item.item_name === 'string') {
            return item.item_name.replace(/Added:\s*.*$/i, '').trim();
        }
        return 'Unnamed Item';
    }

    getExpiryDays(expiryString) {
        if (!expiryString || expiryString === 'Not available') return Infinity;
        
        try {
            if (typeof expiryString === 'string') {
                // Parse specific expiry patterns
                if (expiryString.toLowerCase().includes('indefinite')) {
                    return Infinity;
                }
                
                if (expiryString.toLowerCase().includes('day')) {
                    const match = expiryString.match(/(\d+)\s*day/i);
                    if (match && match[1]) {
                        return parseInt(match[1], 10);
                    }
                }
                
                if (expiryString.toLowerCase().includes('week')) {
                    const match = expiryString.match(/(\d+)\s*week/i);
                    if (match && match[1]) {
                        return parseInt(match[1], 10) * 7;
                    }
                }
                
                if (expiryString.toLowerCase().includes('month')) {
                    const match = expiryString.match(/(\d+)\s*month/i);
                    if (match && match[1]) {
                        return parseInt(match[1], 10) * 30;
                    }
                }
                
                // Try to parse as a date
                const expiryDate = new Date(expiryString);
                if (!isNaN(expiryDate.getTime())) {
                    const now = new Date();
                    const diffTime = expiryDate - now;
                    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                }
            }
        } catch (error) {
            console.warn('Error parsing expiry string:', expiryString, error);
        }
        
        return 999; // Default for unparsable values
    }

    clearItems() {
        this.items = [];
        const tbody = document.getElementById('groceryListBody');
        if (tbody) {
            tbody.innerHTML = '';
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `
                <td colspan="4" class="empty-message">
                    <div class="empty-state">
                        <p>No items in your inventory yet</p>
                        <p>Add items using the form above</p>
                    </div>
                </td>
            `;
            tbody.appendChild(emptyRow);
        }
    }

    onAuthExpired() {
        this.clearItems();
        super.onAuthExpired();
    }

    async handleDeleteItem(itemId) {
        console.log('Attempting to delete item with ID:', itemId);
        try {
            // Construct the URL correctly using config
            const deleteUrl = `${CONFIG.SERVICES.INVENTORY.URL}${CONFIG.SERVICES.INVENTORY.ENDPOINTS.ITEM_BY_ID(itemId)}`;
            console.log('Using URL for delete item:', deleteUrl);
            
            const response = await fetchWithAuth(deleteUrl, { method: 'DELETE' });
            const data = await response.json();
            console.log('Delete item response:', data);

            if (!response.ok) throw new Error(data.message || 'Failed to delete item');

            this.eventBus.emit(Events.INVENTORY.ITEM_DELETED, { itemId });
            await this.loadItems(); // Reload after deletion
            this.showSuccess('Item deleted successfully!');
        } catch (error) {
            console.error('Delete error:', error);
            this.eventBus.emit(Events.INVENTORY.ERROR, { error: error.message });
            this.showError(error.message);
        }
    }
}

export const inventoryService = new InventoryService();