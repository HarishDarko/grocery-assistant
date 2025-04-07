import json
import os
import sys # Add sys import
import logging
import secrets
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
import boto3
from werkzeug.datastructures import Headers
from werkzeug.test import EnvironBuilder
from dotenv import load_dotenv
import traceback  # Added for better error logging

# Add parent directory (backend) to sys.path for local execution
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
backend_root = os.path.dirname(parent_dir) # Go up two levels
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

# Import the shared utility
from utils.secrets import get_secret_value 

# --- Top Level Log --- 
print("--- Loading auth_service/handler.py ---", flush=True)
logging.basicConfig(level=logging.INFO) # Ensure basicConfig is called early
logger = logging.getLogger(__name__) # Use __name__ for logger
logger.info("--- Logger initialized for auth_service ---")

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

# Configure CORS explicitly for local dev and allow credentials
logger.info("Configuring CORS...")
CORS(app, origins=["http://localhost:5000"], supports_credentials=True)
logger.info("CORS configured.")

# --- Secure JWT Configuration ---
logger.info("Starting JWT Configuration...")
SECRETS_ARN = os.environ.get('SECRETS_ARN')
JWT_SECRET_KEY = None

if SECRETS_ARN:
    logger.info(f"SECRETS_ARN is set. Attempting to load JWT key from Secrets Manager: {SECRETS_ARN}")
    JWT_SECRET_KEY = get_secret_value(SECRETS_ARN, "jwt_secret_key") # Use lowercase key for secret
    if JWT_SECRET_KEY:
        logger.info("Successfully loaded jwt_secret_key from Secrets Manager.")
    else:
        logger.error(f"Failed to load 'jwt_secret_key' from secret {SECRETS_ARN}. Check secret content and permissions.")
else:
    logger.warning("SECRETS_ARN environment variable not set. Loading JWT_SECRET_KEY from environment (expected from .env locally).")
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') # Use uppercase for direct env var read

# Final fallback to default if not loaded from Secret or Env
if not JWT_SECRET_KEY:
    JWT_SECRET_KEY = "default_dev_secret_key_CHANGE_ME"
    logger.warning("JWT_SECRET_KEY not found in Secrets Manager or environment. USING DEFAULT KEY - CHANGE FOR PRODUCTION!")

logger.info(f"Applying JWT_SECRET_KEY to Flask config.") # Simplified log
app.config["JWT_SECRET_KEY"] = JWT_SECRET_KEY
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = 86400
jwt = JWTManager(app)
logger.info("JWT configuration finished.")
# --- End Secure JWT Configuration ---

# Import database module
logger.info("Importing AuthDatabase...")
from database import AuthDatabase
logger.info("AuthDatabase imported.")

# Prepare Database URI
mongo_uri = None
if SECRETS_ARN:
    logger.info(f"Attempting to load MONGODB_URI from Secrets Manager: {SECRETS_ARN}")
    mongo_uri = get_secret_value(SECRETS_ARN, "MONGODB_URI")
    if mongo_uri:
        logger.info("Successfully loaded MONGODB_URI from Secrets Manager.")
        # Set environment variable so DB class can potentially read it
        os.environ['MONGODB_URI'] = mongo_uri 
    else:
        logger.error(f"Failed to load 'MONGODB_URI' from secret {SECRETS_ARN}. Check secret content and permissions. Falling back to env var.")
        # Fallback within AWS context if secret fetch failed
        mongo_uri = os.environ.get('MONGODB_URI') 

if not mongo_uri:
    logger.warning(f"{'Could not load MONGODB_URI from Secrets Manager.' if SECRETS_ARN else 'SECRETS_ARN not set.'} Loading MONGODB_URI from environment (expected from .env locally).")
    mongo_uri = os.environ.get('MONGODB_URI') # Load from env if not from secret or ARN not set

# Final fallback to mock DB if not loaded from Secret or Env
if not mongo_uri:
    mongo_uri = 'mock://grocery_assistant'
    logger.warning("MONGODB_URI not found in Secrets Manager or environment. USING MOCK DATABASE.")

logger.info(f"Final MongoDB URI to be used: {mongo_uri}")

# Initialize database connection outside of the handler
db = None
try:
    logger.info("Attempting to initialize AuthDatabase...")
    # Pass the fetched mongo_uri to the constructor
    db = AuthDatabase(mongo_uri) 
    logger.info("AuthDatabase initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize AuthDatabase: {str(e)}")
    logger.error(traceback.format_exc())
    # db remains None, endpoints should check for this

# Define the frontend origin for CORS
FRONTEND_ORIGIN = 'https://d1k7vf5yu4148q.cloudfront.net'
LOCAL_DEV_ORIGIN = 'http://localhost:5000' # Added for local development
ALLOWED_ORIGINS = [FRONTEND_ORIGIN, LOCAL_DEV_ORIGIN]

def _build_cors_response(body, status_code=200):
    """Helper function to build a JSON response with CORS headers."""
    headers = {
        # 'Access-Control-Allow-Origin': FRONTEND_ORIGIN, # REMOVED - Let @cross_origin handle this
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE' # Be more specific if needed
    }
    return jsonify(body), status_code, headers

logger.info("Defining routes...")

@app.route('/auth/register', methods=['POST'])
@cross_origin(origins=ALLOWED_ORIGINS, supports_credentials=True) # Use combined list
def register():
    if db is None:
        return _build_cors_response({"success": False, "message": "Database connection failed"}, 500)
        
    try:
        data = request.get_json()
        username = data.get("username")
        email = data.get("email")
        password = data.get("password")
        
        if not all([username, email, password]):
             return _build_cors_response({"success": False, "message": "All fields are required"}, 400)
            
        # Validate input
        if len(password) < 8:
            return _build_cors_response({"success": False, "message": "Password must be at least 8 characters"}, 400)
            
        if not "@" in email:
            return _build_cors_response({"success": False, "message": "Invalid email format"}, 400)
        
        user, error = db.create_user(username, email, password)
        if error:
            return _build_cors_response({"success": False, "message": error}, 400)
        
        token = create_access_token(identity=str(user["_id"]))
        response_body = {
            "success": True, 
            "message": "Registration successful", 
            "token": token, 
            "user": {"username": user["username"], "email": user["email"]}
        }
        return _build_cors_response(response_body, 200)
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        return _build_cors_response({"success": False, "message": "Registration failed"}, 500)

@app.route('/auth/login', methods=['POST'])
@cross_origin(origins=ALLOWED_ORIGINS, supports_credentials=True) # Use combined list
def login():
    logger.info("--- Login request received ---") # Log start of request
    if db is None:
        logger.error("Login attempt failed: Database connection is None")
        return _build_cors_response({"success": False, "message": "Database connection failed"}, 500)
        
    try:
        logger.info("Attempting to parse request JSON")
        data = request.get_json()
        if not data:
            logger.error("Login failed: Request body is missing or not valid JSON")
            return _build_cors_response({"success": False, "message": "Invalid request data"}, 400)
            
        username = data.get("username")
        password = data.get("password")
        logger.info(f"Login attempt for user: {username}")
        
        if not all([username, password]):
            logger.error("Login failed: Username or password missing")
            return _build_cors_response({"success": False, "message": "Username and password required"}, 400)
        
        logger.info("Attempting to verify user against database")
        user, error = db.verify_user(username, password)
        
        if error:
            logger.warning(f"Login failed for user '{username}': {error}")
            # Note: Returning 401 for invalid credentials
            return _build_cors_response({"success": False, "message": error}, 401)
            
        if not user:
             # This case might occur if db.verify_user returns (None, None)
             logger.error(f"Login failed: User '{username}' not found or password incorrect (verify_user returned None)")
             return _build_cors_response({"success": False, "message": "Invalid username or password"}, 401)
             
        logger.info(f"User '{username}' verified successfully. Attempting token creation.")
        token = create_access_token(identity=str(user["_id"]))
        logger.info(f"Token created successfully for user '{username}'")
        
        # Prepare the response body
        response_body = {
            "success": True, 
            "message": "Login successful", 
            "token": token, 
            "user": {"username": user["username"], "email": user["email"]}
        }
        
        # Return jsonify with body, status code, and CORS headers
        return _build_cors_response(response_body, 200)

    except Exception as e:
        logger.error(f"!!! Unhandled exception during login for user '{username if 'username' in locals() else 'unknown'}': {str(e)}")
        logger.error(traceback.format_exc()) # Log the full traceback
        return _build_cors_response({"success": False, "message": "Login failed due to server error"}, 500)

@app.route('/auth/health', methods=['GET'])
@cross_origin(origins=ALLOWED_ORIGINS, supports_credentials=True) # Use combined list
def health_check():
    """Health check endpoint for the frontend service health monitor"""
    if db is None:
        return _build_cors_response({"status": "unhealthy", "message": "Database connection failed"}, 500)
        
    try:
        # Try a lightweight DB operation to test connection
        db.users.find_one({}, {"_id": 1})
        return _build_cors_response({"status": "healthy", "service": "auth"}, 200)
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
logger.info("--- Finished loading auth_service/handler.py ---")
print("--- Finished loading auth_service/handler.py ---", flush=True)