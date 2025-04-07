from pymongo import MongoClient
from datetime import datetime
import os
import sys
from dotenv import load_dotenv
import logging
from bson import ObjectId

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Add parent directory to the path so we can import the utils package
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

# Try loading from .env file first (local development)
env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
    logger.info("Loaded environment variables from .env file")

# Remove or comment out the module-level MONGODB_URI fetching logic
# MONGODB_URI = os.environ.get('MONGODB_URI')
# if not MONGODB_URI:
#    logger.warning("MONGODB_URI environment variable not set - using mock database")
#    MONGODB_URI = "mock://grocery_assistant"
#
# if MONGODB_URI.startswith('mock://'):
#    try:
#        from services.utils.mock_db import MockMongoClient
#        logger.info("Using mock MongoDB for local development")
#        MongoClientClass = MockMongoClient
#    except ImportError:
#        logger.warning("Could not import mock_db, falling back to real MongoDB")
#        MongoClientClass = MongoClient
# else:
#    MongoClientClass = MongoClient

# Define MongoClientClass directly here for clarity
MongoClientClass = MongoClient

class InventoryDatabase:
    # Add db_uri parameter to __init__
    def __init__(self, db_uri):
        if not db_uri:
            raise ValueError("MongoDB URI is required")

        # Use the passed db_uri here
        try:
            # Assume real MongoClient if real URI is passed
            self.client = MongoClientClass(db_uri, serverSelectionTimeoutMS=5000)
            self.client.admin.command('ping') # Test connection
            logger.info("Successfully connected to MongoDB for InventoryService")
            self.db = self.client.get_database() # Get DB from URI
            self.items = self.db.items
            self._ensure_indexes()
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB for InventoryService: {str(e)}")
            raise

    def _ensure_indexes(self):
        """Ensure necessary indexes exist."""
        self.items.create_index([("user_id", 1)])
        self.items.create_index([("name", 1)])

    def add_item(self, user_id, item_name, category, predicted_expiry):
        """Add a new item to the inventory. Returns (item, error)."""
        try:
            item = {
                "user_id": user_id,
                "item_name": item_name,
                "category": category,
                "predicted_expiry": predicted_expiry,
                "added_on": datetime.now().strftime("%Y-%m-%d %H:%M")
            }
            result = self.items.insert_one(item)
            item["_id"] = str(result.inserted_id)
            return item, None # Return item and None error on success
        except Exception as e:
            logger.error(f"Error adding item: {str(e)}")
            return None, str(e) # Return None item and error string on failure
    
    def get_user_items(self, user_id):
        """Get all items for a specific user. Returns (items, error)."""
        try:
            items = list(self.items.find({"user_id": user_id}))
            for item in items:
                item['_id'] = str(item['_id'])
            return items, None # Return items and None for error on success
        except Exception as e:
            logger.error(f"Error getting user items: {str(e)}")
            return None, str(e) # Return None for items and the error message on failure
    
    def delete_item(self, user_id, item_id):
        """Delete a specific item"""
        try:
            return self.items.delete_one({
                "_id": ObjectId(item_id), 
                "user_id": user_id
            })
        except Exception as e:
            logger.error(f"Error deleting item: {str(e)}")
            raise
    
    def close(self):
        """Close database connection"""
        try:
            self.client.close()
            logger.info("MongoDB connection closed")
        except Exception as e:
            logger.error(f"Error closing MongoDB connection: {str(e)}")