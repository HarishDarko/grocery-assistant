import json
import os
import sys
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from flask_jwt_extended import JWTManager, jwt_required, get_jwt_identity, verify_jwt_in_request
import requests
from werkzeug.datastructures import Headers
from werkzeug.test import EnvironBuilder
from dotenv import load_dotenv
from groq import Groq
import traceback

# Add parent directory (backend) to sys.path for local execution
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
backend_root = os.path.dirname(parent_dir) # Go up two levels
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

# Import the shared utility
from utils.secrets import get_secret_value

# Define allowed origins
FRONTEND_ORIGIN = 'https://d1k7vf5yu4148q.cloudfront.net'
LOCAL_DEV_ORIGIN = 'http://localhost:5000'
ALLOWED_ORIGINS = [FRONTEND_ORIGIN, LOCAL_DEV_ORIGIN]

# Configure logging
logger = logging.getLogger(__name__) # Use __name__
logger.setLevel(logging.INFO)

# Helper function for building CORS-compliant responses
def _build_cors_response(body, status_code=200):
    response = jsonify(body)
    response.status_code = status_code
    # Allow requests from any origin in this example, adjust as needed for production
    # response.headers['Access-Control-Allow-Origin'] = '*' # REMOVED - Let CORS/cross_origin handle this
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    response.headers['Access-Control-Allow-Credentials'] = 'true' # If needed
    return response

# Try loading from .env file first (local development)
env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
    logger.info("Loaded environment variables from .env file")

# Load API keys and JWT Key
logger.info("Loading configuration...")
SECRETS_ARN = os.environ.get('SECRETS_ARN')
GROQ_API_KEY = None
JWT_SECRET_KEY = None

if SECRETS_ARN:
    logger.info(f"SECRETS_ARN is set. Attempting to load keys from Secrets Manager: {SECRETS_ARN}")
    GROQ_API_KEY = get_secret_value(SECRETS_ARN, "GROQ_API_KEY")
    JWT_SECRET_KEY = get_secret_value(SECRETS_ARN, "jwt_secret_key") # Lowercase for secret key
    
    if GROQ_API_KEY: logger.info("Successfully loaded GROQ_API_KEY from Secrets Manager.")
    else: logger.error(f"Failed to load 'GROQ_API_KEY' from secret {SECRETS_ARN}.")
    
    if JWT_SECRET_KEY: logger.info("Successfully loaded jwt_secret_key from Secrets Manager.")
    else: logger.error(f"Failed to load 'jwt_secret_key' from secret {SECRETS_ARN}.")
else:
    logger.warning("SECRETS_ARN environment variable not set. Loading keys from environment (expected from .env locally).")
    GROQ_API_KEY = os.environ.get("GROQ_API_KEY") # Uppercase for env var
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY") # Uppercase for env var

# Fallback/Defaults if not loaded from Secret or Env
if not JWT_SECRET_KEY:
    JWT_SECRET_KEY = "default_dev_secret_key_CHANGE_ME"
    logger.warning("JWT_SECRET_KEY not found. USING DEFAULT KEY - CHANGE FOR PRODUCTION!")
if not GROQ_API_KEY:
    logger.warning("GROQ_API_KEY not found. Recipe generation/prediction might fail.")

GROQ_API_URL = os.environ.get("GROQ_API_URL", "https://api.groq.com/openai/v1/chat/completions")

# Initialize Flask app
app = Flask(__name__)
# Configure CORS explicitly for allowed origins and credentials
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)

# JWT configuration
logger.info("Applying JWT_SECRET_KEY to Flask config.")
app.config["JWT_SECRET_KEY"] = JWT_SECRET_KEY
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = 86400  # 24 hours
jwt = JWTManager(app)

# Initialize Groq client
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
if not groq_client:
    logger.warning("Groq client could not be initialized. Ensure GROQ_API_KEY is set.")

@app.route('/recipes/generate', methods=['GET'])
@jwt_required()
def generate_recipes():
    """Generate recipe based on inventory items from query parameters"""
    current_user_id = get_jwt_identity()
    logger.info(f"Recipe generation requested by user: {current_user_id}")

    try:
        # Get item names from query parameters
        items_query = request.args.get('items')
        if not items_query:
            return _build_cors_response({"success": False, "message": "Missing 'items' query parameter"}, 400)

        # Split the comma-separated string into a list
        inventory_items = [item.strip() for item in items_query.split(',') if item.strip()]
        logger.info(f"Generating recipe for items: {inventory_items}")

        if not inventory_items:
            return _build_cors_response({"success": False, "message": "No items provided for recipe generation"}, 400)

        # Ensure Groq client is initialized
        if groq_client is None:
            logger.error("Groq client is not initialized due to missing API key")
            return _build_cors_response({"success": False, "message": "Recipe service is not configured properly"}, 500)

        # Create chat completion request
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that generates simple recipes based on a list of ingredients. Format the recipe clearly using Markdown."
                },
                {
                    "role": "user",
                    "content": f"Generate a simple recipe using some or all of these ingredients: {', '.join(inventory_items)}. If you cannot make a reasonable recipe, say so."
                }
            ],
            model="llama3-8b-8192",
            temperature=0.7,
            max_tokens=1024,
            top_p=1,
            stop=None,
            stream=False,
        )

        recipe_content = chat_completion.choices[0].message.content
        logger.info(f"Generated recipe content (first 100 chars): {recipe_content[:100]}")
        
        return _build_cors_response({"success": True, "recipe": recipe_content})

    except Exception as e:
        logger.error(f"Error generating recipe: {str(e)}")
        logger.error(traceback.format_exc()) # Log the full traceback
        return _build_cors_response({"success": False, "message": f"Failed to generate recipe: {str(e)}"}, 500)

@app.route('/recipes/health', methods=['GET', 'OPTIONS'])
@cross_origin(origins=ALLOWED_ORIGINS, supports_credentials=True) # Use specific origins and allow credentials
def health_check():
    """Health check endpoint for the frontend service health monitor"""
    if request.method == 'OPTIONS':
        # Handled by Flask-CORS and @cross_origin
        # Just return a success response for the actual method if needed
        pass 
    # Simple health check, can be expanded (e.g., check Groq key)
    return _build_cors_response({"status": "healthy", "service": "recipe"})

@app.route('/recipes/predict_food_info', methods=['POST', 'OPTIONS'])
def predict_food_info():
    # Handle OPTIONS preflight request
    if request.method == 'OPTIONS':
        return _build_cors_response({}, 200) 
        
    try:
        # Get the food item name from the request
        data = request.get_json()
        if not data or not data.get('item_name'):
            return _build_cors_response({"success": False, "message": "Item name is required"}, 400)
            
        item_name = data.get('item_name')
        logger.info(f"Predicting food info for: {item_name}")
        
        # Use GROQ API to predict food category and expiry
        if GROQ_API_KEY:
            try:
                logger.info(f"Calling GROQ API for food prediction")
                prompt = f"""For the food item '{item_name}', please provide:
1. The food category (e.g., Produce, Dairy, Meat, Seafood, Bakery, Pantry, Frozen, Beverage)
2. The typical shelf life/expiry information

Return ONLY the following JSON format with no additional text:
{{
    "category": "Category name",
    "expiry": "Detailed expiry information"
}}"""
                
                response = requests.post(
                    GROQ_API_URL,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {GROQ_API_KEY}"
                    },
                    json={
                        "model": "llama3-70b-8192",
                        "messages": [{
                            "role": "system", 
                            "content": "You are a helpful AI that provides accurate food storage information."
                        }, {
                            "role": "user", 
                            "content": prompt
                        }],
                        "temperature": 0.2,
                        "max_tokens": 500,
                        "response_format": {"type": "json_object"}
                    }
                )
                
                logger.info(f"GROQ API response status: {response.status_code}")
                if response.status_code == 200:
                    ai_response = response.json()
                    content = ai_response.get("choices", [{}])[0].get("message", {}).get("content", "{}")
                    
                    try:
                        # Parse the JSON response
                        food_info = json.loads(content)
                        logger.info(f"Food info predicted: {food_info}")
                        
                        # Make sure it has the right fields
                        if not food_info.get("category") or not food_info.get("expiry"):
                            raise ValueError("Missing category or expiry in response")
                            
                        return _build_cors_response({
                            "success": True, 
                            "category": food_info["category"],
                            "expiry": food_info["expiry"]
                        })
                    except (ValueError, json.JSONDecodeError) as e:
                        logger.error(f"Error parsing food info response: {str(e)}, content: {content}")
                        return _build_cors_response({
                            "success": False, 
                            "message": "Failed to parse food information",
                            "category": "Unknown",
                            "expiry": "Unknown"
                        }, 500) # Changed to 500 for server-side parsing error
                else:
                    logger.error(f"Error from GROQ API: {response.status_code}, {response.text}")
                    return _build_cors_response({
                        "success": False, 
                        "message": "Failed to predict food information",
                        "category": "Unknown",
                        "expiry": "Unknown"
                    }, 502) # Use 502 for upstream error
            except Exception as e:
                logger.error(f"Error calling GROQ API for food prediction: {str(e)}")
                return _build_cors_response({
                    "success": False, 
                    "message": f"Failed to predict food information: {str(e)}",
                    "category": "Unknown",
                    "expiry": "Unknown"
                }, 500)
        else:
            # Fallback response when no GROQ API key is available
            logger.warning("GROQ_API_KEY not set, returning default food info")
            return _build_cors_response({
                "success": False, # Changed to False as prediction failed
                "message": "AI prediction not available",
                "category": "Unknown", 
                "expiry": "Check packaging for details"
            }, 200) # Return 200 but indicate failure in payload
            
    except Exception as e:
        logger.error(f"Error in predict_food_info: {str(e)}")
        return _build_cors_response({
            "success": False,
            "message": f"Server error: {str(e)}",
            "category": "Unknown",
            "expiry": "Unknown"
        }, 500)

# Direct function for prediction logic (used by direct invocation)
def _handle_prediction(item_name):
    logger.info(f"Handling direct prediction request for: {item_name}")
    if not GROQ_API_KEY:
        logger.error("GROQ_API_KEY not available for prediction.")
        return {"success": False, "message": "Recipe service not configured for prediction.", "category": "Unknown", "expiry": "N/A"}

    try:
        logger.info(f"Calling GROQ API for food prediction (direct invocation)")
        prompt = f"""For the food item '{item_name}', please provide:
1. The food category (e.g., Produce, Dairy, Meat, Seafood, Bakery, Pantry, Frozen, Beverage)
2. The typical shelf life/expiry information

Return ONLY the following JSON format with no additional text:
{{
    "category": "Category name",
    "expiry": "Detailed expiry information"
}}"""

        response = requests.post(
            GROQ_API_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {GROQ_API_KEY}"
            },
            json={
                "model": "llama3-70b-8192", # Or another suitable model
                "messages": [{
                    "role": "system",
                    "content": "You are a helpful AI that provides accurate food storage information."
                }, {
                    "role": "user",
                    "content": prompt
                }],
                "temperature": 0.2,
                "max_tokens": 500,
                "response_format": {"type": "json_object"}
            }
        )

        logger.info(f"GROQ API response status (direct): {response.status_code}")
        if response.status_code == 200:
            ai_response = response.json()
            content = ai_response.get("choices", [{}])[0].get("message", {}).get("content", "{}")
            try:
                food_info = json.loads(content)
                logger.info(f"Food info predicted (direct): {food_info}")
                if not food_info.get("category") or not food_info.get("expiry"):
                    raise ValueError("Missing category or expiry in response")
                return {
                    "success": True,
                    "category": food_info["category"],
                    "expiry": food_info["expiry"]
                }
            except (ValueError, json.JSONDecodeError) as e:
                logger.error(f"Error parsing food info response (direct): {str(e)}, content: {content}")
                return {"success": False, "message": "Failed to parse food information", "category": "Unknown", "expiry": "N/A"}
        else:
            logger.error(f"Error from GROQ API (direct): {response.status_code}, {response.text}")
            return {"success": False, "message": "Failed to predict food information", "category": "Unknown", "expiry": "N/A"}
    except Exception as e:
        logger.error(f"Error during GROQ API call (direct): {str(e)}")
        logger.error(traceback.format_exc())
        return {"success": False, "message": "Internal error during prediction", "category": "Unknown", "expiry": "N/A"}

def lambda_handler(event, context):
    """
    AWS Lambda handler function that processes API Gateway events OR direct invocations
    and routes them appropriately.
    """
    logger.info(f"Event: {json.dumps(event)}")

    # Check if this is a direct invocation from another Lambda (e.g., for prediction)
    # We identify this by checking for keys typical of API Gateway events vs direct payload.
    # A more robust check might involve a specific key in the direct payload.
    is_api_gateway_event = 'httpMethod' in event and 'requestContext' in event

    if is_api_gateway_event:
        logger.info("Processing as API Gateway event...")
        # Set up the Flask environment from the API Gateway event
        headers = event.get('headers', {}) or {}
        query_params = event.get('queryStringParameters', {}) or {}
        path_params = event.get('pathParameters', {}) or {}
        body = event.get('body', '')

        path = event.get('path', '')
        method = event.get('httpMethod', '')

        # Parse JSON body if it exists and is a string
        parsed_body = body
        if body and isinstance(body, str):
            try:
                parsed_body = json.loads(body)
            except json.JSONDecodeError:
                logger.warning("Failed to parse body as JSON, treating as raw string.")
                pass # Keep body as string if not valid JSON

        # Create a Flask-compatible WSGI environment
        builder = EnvironBuilder(
            path=path,
            method=method,
            headers=Headers(headers),
            data=json.dumps(parsed_body) if isinstance(parsed_body, dict) else parsed_body, # Re-encode if dict
            query_string=query_params
        )

        env = builder.get_environ()

        # Add path parameters to the Flask request context (used by Flask routes)
        if path_params:
            env['werkzeug.request'].path_params = path_params

        # Create a Flask request context
        with app.request_context(env):
            # Process the request through Flask
            try:
                response = app.full_dispatch_request()
                # Convert Flask response to Lambda/API Gateway format
                response_body = response.get_data(as_text=True)
                response_headers = dict(response.headers)

                # Ensure Content-Type is present
                if 'content-type' not in response_headers:
                    response_headers['Content-Type'] = response.content_type or 'application/json'

                return {
                    "statusCode": response.status_code,
                    "headers": response_headers,
                    "body": response_body
                }
            except Exception as e:
                logger.error(f"Error during Flask request dispatch: {e}")
                logger.error(traceback.format_exc())
                return {
                    "statusCode": 500,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"success": False, "message": "Internal Server Error"})
                }
    else:
        # Handle potential direct invocation for prediction
        # Assume the payload is the direct event body passed by the invoking Lambda
        logger.info("Processing as potential direct invocation...")
        try:
            # The invoking Lambda sends a dict with a 'body' key containing a JSON string
            if isinstance(event, dict) and 'body' in event:
                payload_body = json.loads(event['body'])
                item_name = payload_body.get('item_name')

                if item_name:
                    # Call the internal prediction logic directly
                    prediction_result = _handle_prediction(item_name)
                    # Return the result directly (the invoking Lambda expects a JSON serializable dict)
                    return prediction_result
                else:
                    logger.warning("Direct invocation payload missing 'item_name' in body.")
                    return {"success": False, "message": "Missing item_name in payload"}
            else:
                logger.warning(f"Direct invocation payload format not recognized: {type(event)}")
                return {"success": False, "message": "Unsupported direct invocation format"}

        except json.JSONDecodeError:
            logger.error("Failed to parse direct invocation event body as JSON")
            return {"success": False, "message": "Invalid JSON in direct invocation payload"}
        except Exception as e:
            logger.error(f"Error processing direct invocation: {e}")
            logger.error(traceback.format_exc())
            return {"success": False, "message": "Internal error handling direct invocation"}