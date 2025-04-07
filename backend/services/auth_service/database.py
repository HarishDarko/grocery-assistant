from pymongo import MongoClient
from datetime import datetime
import os
import sys
from dotenv import load_dotenv
import bcrypt
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Add parent directory to the path so we can import the utils package
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

# Load auth service environment variables
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

class AuthDatabase:
    def __init__(self, db_uri):
        if not db_uri:
            raise ValueError("MongoDB URI is required")

        # Use the passed db_uri here
        try:
            # Note: We assume if a real URI is passed, we use the real MongoClient
            self.client = MongoClientClass(db_uri, serverSelectionTimeoutMS=5000)
            # Test the connection
            self.client.admin.command('ping')
            logger.info("Successfully connected to MongoDB")

            # Extract DB name from URI or set a default if needed
            # PyMongo >= 3.0 automatically extracts the DB name from the URI if present
            # If the URI doesn't specify a DB, you might need to specify it:
            # db_name = uri_parser.parse_uri(db_uri)['database'] or 'grocery_assistant' # Example
            # self.db = self.client[db_name]
            self.db = self.client.get_database() # Usually sufficient

            self.users = self.db.users

            # Create indexes if they don't exist
            self._ensure_indexes()
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {str(e)}")
            raise

    def _ensure_indexes(self):
        """Create indexes for faster queries"""
        self.users.create_index([("username", 1)], unique=True)
        self.users.create_index([("email", 1)], unique=True)

    def create_user(self, username, email, password):
        """Create a new user"""
        try:
            if self.users.find_one({"$or": [{"username": username}, {"email": email}]}):
                return None, "User exists"
                
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
            user = {
                "username": username,
                "email": email,
                "password": hashed,
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
            }
            result = self.users.insert_one(user)
            user["_id"] = str(result.inserted_id)
            return user, None
        except Exception as e:
            logger.error(f"Error creating user: {str(e)}")
            return None, f"Database error: {str(e)}"

    def verify_user(self, username, password):
        """Verify user credentials"""
        try:
            user = self.users.find_one({"username": username})
            if user and bcrypt.checkpw(password.encode("utf-8"), user["password"]):
                user["_id"] = str(user["_id"])
                return user, None
            return None, "Invalid credentials"
        except Exception as e:
            logger.error(f"Error verifying user: {str(e)}")
            return None, f"Database error: {str(e)}"

    def close(self):
        """Close database connection"""
        try:
            self.client.close()
            logger.info("MongoDB connection closed")
        except Exception as e:
            logger.error(f"Error closing MongoDB connection: {str(e)}")