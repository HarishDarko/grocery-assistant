import os
import json
import logging
import boto3
import traceback
from typing import Union

logger = logging.getLogger(__name__)

def get_secret_value(secret_name: str, secret_key: str) -> Union[str, None]:
    """
    Retrieves a specific key's value from a secret stored in AWS Secrets Manager.

    Args:
        secret_name: The name or ARN of the secret in Secrets Manager.
        secret_key: The specific key within the secret JSON to retrieve.

    Returns:
        The value of the secret_key if found, otherwise None.
    """
    region_name = os.environ.get("AWS_REGION")
    if not region_name:
        logger.error("AWS_REGION environment variable not set. Cannot fetch secret.")
        return None

    session = boto3.session.Session()
    client = session.client(service_name='secretsmanager', region_name=region_name)

    logger.info(f"Attempting to retrieve secret '{secret_name}' for key '{secret_key}' from region '{region_name}'")

    try:
        get_secret_value_response = client.get_secret_value(SecretId=secret_name)
        
        if 'SecretString' in get_secret_value_response:
            secret_string = get_secret_value_response['SecretString']
            try:
                secret_dict = json.loads(secret_string)
                key_value = secret_dict.get(secret_key)
                if key_value:
                    logger.info(f"Successfully retrieved key '{secret_key}' from secret '{secret_name}'.")
                    return key_value
                else:
                    logger.error(f"Key '{secret_key}' not found within secret JSON for '{secret_name}'.")
                    return None
            except json.JSONDecodeError:
                logger.error(f"SecretString for '{secret_name}' is not valid JSON.")
                # Optionally, handle non-JSON secrets if needed, e.g., if the secret *is* the JWT key directly
                # if secret_key == "jwt_secret_key": return secret_string 
                return None
        else:
            # Handle binary secrets if necessary
            logger.warning(f"Secret '{secret_name}' is binary, not handled by this function.")
            return None
            
    except client.exceptions.ResourceNotFoundException:
        logger.error(f"Secret '{secret_name}' not found in Secrets Manager.")
        return None
    except client.exceptions.InvalidParameterException as e:
        logger.error(f"Invalid parameter error retrieving secret '{secret_name}': {str(e)}")
        return None
    except client.exceptions.InvalidRequestException as e:
         logger.error(f"Invalid request error retrieving secret '{secret_name}': {str(e)}")
         return None
    except client.exceptions.DecryptionFailure as e:
        logger.error(f"Decryption failure retrieving secret '{secret_name}': {str(e)}")
        return None
    except client.exceptions.InternalServiceError as e:
        logger.error(f"Internal service error retrieving secret '{secret_name}': {str(e)}")
        return None
    except Exception as e:
        logger.error(f"An unexpected error occurred retrieving secret '{secret_name}': {str(e)}")
        logger.error(traceback.format_exc())
        return None 