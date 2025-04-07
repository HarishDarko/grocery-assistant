import json
import os
import sys
import logging
import secrets
import boto3 # Import boto3
from botocore.exceptions import ClientError # Import ClientError
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from flask_jwt_extended import JWTManager, jwt_required, get_jwt_identity, verify_jwt_in_request
from werkzeug.datastructures import Headers
from werkzeug.test import EnvironBuilder
from dotenv import load_dotenv
import traceback

# Add parent directory (backend) to sys.path for local execution
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
backend_root = os.path.dirname(parent_dir) # Go up two levels
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

# Import the shared utility
from utils.secrets import get_secret_value

# --- Top Level Log --- 
print("--- Loading inventory_service/handler.py ---", flush=True)
logging.basicConfig(level=logging.INFO) # Ensure basicConfig is called early
logger = logging.getLogger(__name__) # Use __name__ for logger
logger.info("--- Logger initialized for inventory_service ---")

# Try loading from .env file first (local development)
env_path = os.path.join(os.path.dirname(__file__), '.env')
logger.info(f"Checking for .env file at: {env_path}")
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
    logger.info("Loaded environment variables from .env file")
else:
    logger.warning(".env file not found, relying on system environment variables.")

# Initialize Flask app
logger.info("Initializing Flask app...")
app = Flask(__name__)
logger.info("Flask app initialized.")

# Define allowed origins
FRONTEND_ORIGIN = 'https://d1k7vf5yu4148q.cloudfront.net'
LOCAL_DEV_ORIGIN = 'http://localhost:5000'
ALLOWED_ORIGINS = [FRONTEND_ORIGIN, LOCAL_DEV_ORIGIN]

# Configure CORS explicitly for allowed origins and allow credentials
logger.info("Configuring CORS...")
CORS(app, 
     origins=ALLOWED_ORIGINS, 
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], # Explicitly list allowed methods
     allow_headers=["Content-Type", "Authorization"], # Explicitly list allowed headers
     supports_credentials=True)
logger.info("CORS configured.")

# Define the frontend origin for CORS - Deprecated, use ALLOWED_ORIGINS
# FRONTEND_ORIGIN = 'https://d1k7vf5yu4148q.cloudfront.net'

def _build_cors_response(body, status_code=200):
    """Helper function to build a JSON response with CORS headers."""
    headers = {
        # 'Access-Control-Allow-Origin': FRONTEND_ORIGIN, # REMOVED - Let CORS/cross_origin handle this
        'Access-Control-Allow-Credentials': 'true', # Needed if using JWT auth
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE' 
    }
    return jsonify(body), status_code, headers

# --- Secure JWT Configuration (If needed for this service) ---
# Replicate JWT key loading logic from auth_service if inventory routes are protected
logger.info("Starting JWT Configuration...")
SECRETS_ARN = os.environ.get('SECRETS_ARN')
JWT_SECRET_KEY = None

if SECRETS_ARN:
    logger.info(f"SECRETS_ARN is set. Attempting to load JWT key from Secrets Manager: {SECRETS_ARN}")
    JWT_SECRET_KEY = get_secret_value(SECRETS_ARN, "jwt_secret_key")
    if JWT_SECRET_KEY:
        logger.info("Successfully loaded jwt_secret_key from Secrets Manager.")
    else:
        logger.error(f"Failed to load 'jwt_secret_key' from secret {SECRETS_ARN}. Check secret content and permissions.")
else:
    logger.warning("SECRETS_ARN environment variable not set. Loading JWT_SECRET_KEY from environment.")
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY')

if not JWT_SECRET_KEY:
    JWT_SECRET_KEY = "default_dev_secret_key_CHANGE_ME"
    logger.warning("JWT_SECRET_KEY not found. USING DEFAULT KEY!")

logger.info(f"Applying JWT_SECRET_KEY to Flask config.")
app.config["JWT_SECRET_KEY"] = JWT_SECRET_KEY
jwt = JWTManager(app)
logger.info("JWT configuration finished.")
# --- End Secure JWT Configuration ---

# Import database module
logger.info("Importing InventoryDatabase...")
from database import InventoryDatabase
logger.info("InventoryDatabase imported.")

# Prepare Database URI (Same logic as auth_service)
mongo_uri = None
if SECRETS_ARN:
    logger.info(f"Attempting to load MONGODB_URI from Secrets Manager: {SECRETS_ARN}")
    mongo_uri = get_secret_value(SECRETS_ARN, "MONGODB_URI")
    if mongo_uri:
        logger.info("Successfully loaded MONGODB_URI from Secrets Manager.")
    else:
        logger.error(f"Failed to load 'MONGODB_URI' from secret {SECRETS_ARN}. Falling back to env var.")
        mongo_uri = os.environ.get('MONGODB_URI') 

if not mongo_uri:
    logger.warning(f"{'Could not load MONGODB_URI from Secrets Manager.' if SECRETS_ARN else 'SECRETS_ARN not set.'} Loading MONGODB_URI from environment.")
    mongo_uri = os.environ.get('MONGODB_URI')

if not mongo_uri:
    mongo_uri = 'mock://grocery_assistant' # Fallback if all else fails
    logger.warning("MONGODB_URI not found. USING MOCK DATABASE.")

logger.info(f"Final MongoDB URI to be used: {mongo_uri}")

# Initialize database connection
db = None
try:
    logger.info("Attempting to initialize InventoryDatabase...")
    # Pass the fetched mongo_uri to the constructor
    db = InventoryDatabase(mongo_uri)
    logger.info("InventoryDatabase initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize InventoryDatabase: {str(e)}")
    logger.error(traceback.format_exc())
    # db remains None

logger.info("Defining routes...")

# --- Routes (Modify all returns to use _build_cors_response) ---

@app.route('/inventory/items', methods=['GET'])
@jwt_required()
def get_items():
    if db is None:
        return _build_cors_response({"success": False, "message": "Database connection failed"}, 500)
    try:
        user_id = get_jwt_identity()
        items, error = db.get_user_items(user_id)
        if error:
             return _build_cors_response({"success": False, "message": error}, 500)
        return _build_cors_response({"success": True, "items": items}, 200)
    except Exception as e:
        logger.error(f"Error fetching items: {str(e)}")
        return _build_cors_response({"success": False, "message": "Failed to fetch items"}, 500)

@app.route('/inventory/items', methods=['POST'])
@jwt_required()
def add_item():
    if db is None:
        return _build_cors_response({"success": False, "message": "Database connection failed"}, 500)
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        item_name = data.get("item_name")

        if not item_name:
            # Only item_name is required from the frontend now
            return _build_cors_response({"success": False, "message": "Item name is required"}, 400)

        # --- Call Recipe Service for AI Prediction ---
        category = "Unknown" # Default category
        predicted_expiry = "N/A" # Default expiry

        # Get the Recipe Service Lambda function name from environment variables
        recipe_lambda_name = os.environ.get("RECIPE_LAMBDA_NAME")

        if recipe_lambda_name:
            try:
                logger.info(f"Attempting direct invocation of Lambda: {recipe_lambda_name}")
                lambda_client = boto3.client('lambda')

                # Prepare the payload for the recipe service's predict_food_info endpoint
                # Mimic the structure expected by the recipe service's handler for this route
                # This structure might need adjustment based on how recipe service parses the event
                # Assuming it expects a JSON body within the event
                invocation_payload = {
                    # We don't need the full API Gateway event structure here,
                    # just the data the target function needs.
                    # Let's assume recipe service's predict_food_info parses request.get_json()
                    "body": json.dumps({"item_name": item_name})
                    # Add other fields if the recipe service expects them (e.g., httpMethod, path)
                    # "httpMethod": "POST",
                    # "path": "/recipes/predict_food_info" # Or whatever path triggers prediction
                }

                response = lambda_client.invoke(
                    FunctionName=recipe_lambda_name,
                    InvocationType='RequestResponse', # Synchronous invocation
                    Payload=json.dumps(invocation_payload)
                )

                # Check if the invocation itself was successful
                if response.get('StatusCode') == 200 and not response.get('FunctionError'):
                    # Decode the payload returned by the target Lambda
                    response_payload_bytes = response['Payload'].read()
                    response_payload = json.loads(response_payload_bytes.decode('utf-8'))
                    logger.info(f"Lambda invocation response payload: {response_payload}")

                    # Now, parse the *response payload* from the invoked Lambda.
                    # This payload should be the JSON body returned by the recipe service's endpoint.
                    # We assume the recipe service returns a dict like {"success": True, "category": "...", "expiry": "..."}
                    if isinstance(response_payload, dict) and response_payload.get("success"):
                        category = response_payload.get("category", category)
                        predicted_expiry = response_payload.get("expiry", predicted_expiry)
                        logger.info(f"Using values from Lambda invocation - Category: {category}, Expiry: {predicted_expiry}")
                    else:
                        # Log if the invoked function's response indicated failure
                        error_message = response_payload.get('message', 'Unknown error from recipe service') if isinstance(response_payload, dict) else 'Invalid response format from recipe service'
                        logger.warning(f"Invoked recipe Lambda indicated failure: {error_message}")

                else:
                    # Log if the invocation itself failed (e.g., function error, timeout)
                    error_details = response.get('Payload').read().decode('utf-8') if 'Payload' in response else 'No payload'
                    logger.error(f"Lambda invocation failed. Status: {response.get('StatusCode')}, Error: {response.get('FunctionError')}, Details: {error_details}")

            except ClientError as e:
                logger.error(f"Boto3 ClientError calling recipe Lambda: {e}")
            except Exception as e:
                logger.error(f"Unexpected error during Lambda invocation: {str(e)}")
                logger.error(traceback.format_exc())
        else:
            logger.warning("RECIPE_LAMBDA_NAME environment variable not set. Skipping AI prediction.")
        # --- End AI Prediction Call ---

        # Add item to DB using potentially AI-updated category/expiry
        item, error = db.add_item(user_id, item_name, category, predicted_expiry)
        if error:
            # Handle potential DB error from add_item if its signature changed
            # Assuming add_item now returns (item, error) like get_user_items
            return _build_cors_response({"success": False, "message": error}, 500)
            
        # Assuming add_item returns the added item dict on success    
        return _build_cors_response({"success": True, "item": item}, 201) # 201 Created status

    except Exception as e:
        logger.error(f"Error adding item: {str(e)}")
        logger.error(traceback.format_exc())
        return _build_cors_response({"success": False, "message": "Failed to add item"}, 500)

@app.route('/inventory/items/<item_id>', methods=['DELETE'])
@jwt_required()
def delete_item(item_id):
    if db is None:
        return _build_cors_response({"success": False, "message": "Database connection failed"}, 500)
    try:
        user_id = get_jwt_identity()
        logger.info(f"Delete item request for item {item_id}, user: {user_id}") # Added logging
        
        # delete_item returns a DeleteResult object
        result = db.delete_item(user_id, item_id)
        
        if result is None: # Should not happen if db.delete_item raises exceptions
             return _build_cors_response({"success": False, "message": "Database error during delete"}, 500)
             
        if result.deleted_count == 1:
            logger.info(f"Successfully deleted item {item_id} for user {user_id}")
            return _build_cors_response({"success": True, "message": "Item deleted"}, 200)
        else:
            logger.warning(f"Item {item_id} not found or not owned by user {user_id}")
            # Item not found or didn't belong to the user
            return _build_cors_response({"success": False, "message": "Item not found or deletion forbidden"}, 404) 
            
    except Exception as e:
        # Catch potential ObjectId conversion errors or other issues
        logger.error(f"Error deleting item {item_id}: {str(e)}")
        logger.error(traceback.format_exc())
        return _build_cors_response({"success": False, "message": "Failed to delete item"}, 500)
        
@app.route('/inventory/health', methods=['GET', 'OPTIONS'])
@cross_origin(origins=ALLOWED_ORIGINS, supports_credentials=True)
def health_check():
    """Health check endpoint"""
    if request.method == 'OPTIONS':
        # Handled by Flask-CORS / @cross_origin
        pass

    if db is None:
        return _build_cors_response({"status": "unhealthy", "message": "Database connection failed"}, 500)
    
    try:
        # Try a lightweight DB operation to test connection
        db.items.find_one({}, {"_id": 1})
        return _build_cors_response({"status": "healthy", "service": "inventory"}, 200)
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return _build_cors_response({"status": "unhealthy", "message": str(e)}, 500)

def lambda_handler(event, context):
    """
    AWS Lambda handler function that processes API Gateway events
    and routes them to the Flask application
    """
    logger.info(f"Event: {json.dumps(event)}")

    # Check if this is a warmup event
    if event.get('source') == 'serverless-plugin-warmup':
        logger.info('WarmUp - Lambda is warm!')
        return {}

    # Process HTTP API Gateway event
    if 'httpMethod' in event:
        # Set up the Flask environment from the API Gateway event
        headers = event.get('headers', {}) or {}
        query_params = event.get('queryStringParameters', {}) or {}
        path_params = event.get('pathParameters', {}) or {}
        body = event.get('body', '')
        
        path = event.get('path', '')
        method = event.get('httpMethod', '')
        
        # Parse JSON body if it exists
        if body and isinstance(body, str):
            try:
                body = json.loads(body)
            except:
                pass

        # Create a Flask-compatible WSGI environment
        builder = EnvironBuilder(
            path=path,
            method=method,
            headers=Headers(headers),
            data=json.dumps(body) if isinstance(body, dict) else body,
            query_string=query_params
        )
        
        env = builder.get_environ()
        
        # Add path parameters to the Flask request
        if path_params:
            for param, value in path_params.items():
                path = path.replace(f"{{{param}}}", value)
                
        # Override the PATH_INFO
        env['PATH_INFO'] = path
        
        # Create a Flask request with our environment
        with app.request_context(env):
            # Process the request through Flask
            response = app.full_dispatch_request()
            
            # Convert Flask response to Lambda/API Gateway format
            return {
                "statusCode": response.status_code,
                "headers": {
                    "Content-Type": response.content_type,
                    **dict(response.headers)
                },
                "body": response.get_data(as_text=True)
            }

    # Handle other event types or return an error
    return {
        "statusCode": 400,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"error": "Unsupported event type"})
    }

# --- End of handler.py Log ---
logger.info("--- Finished loading inventory_service/handler.py ---")
print("--- Finished loading inventory_service/handler.py ---", flush=True)