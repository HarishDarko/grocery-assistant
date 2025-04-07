# --- IAM Role for Lambda ---
resource "aws_iam_role" "lambda_exec_role" {
  name = "${var.project_name}-lambda-exec-role-${var.stage}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "${var.project_name}-lambda-exec-role-${var.stage}"
    Environment = var.stage
    Project     = var.project_name
  }
}

# --- IAM Policy for Lambda ---
resource "aws_iam_policy" "lambda_policy" {
  name        = "${var.project_name}-lambda-policy-${var.stage}"
  description = "IAM policy for Lambda functions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Effect   = "Allow"
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Effect   = "Allow"
        Resource = var.secrets_manager_arn
      },
      {
        # Required for Lambda functions within a VPC
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface"
        ]
        Effect   = "Allow"
        Resource = "*"
      }
      # Add other permissions if needed (e.g., DynamoDB, S3)
    ]
  })

  tags = {
    Name        = "${var.project_name}-lambda-policy-${var.stage}"
    Environment = var.stage
    Project     = var.project_name
  }
}

# --- Attach Policy to Role ---
resource "aws_iam_role_policy_attachment" "lambda_policy_attach" {
  role       = aws_iam_role.lambda_exec_role.name
  policy_arn = aws_iam_policy.lambda_policy.arn
}

# --- Lambda Functions ---
# Note: Assumes deployment packages are available locally or in S3
# For local packages, use source_code_hash and filename
# For S3 packages, use s3_bucket, s3_key, s3_object_version

resource "aws_lambda_function" "auth_service" {
  function_name = "${var.project_name}-AuthService-${var.stage}"
  role          = aws_iam_role.lambda_exec_role.arn
  handler       = "handler.lambda_handler" # Adjust if your handler is different
  runtime       = var.lambda_runtime
  memory_size   = var.lambda_memory_size
  timeout       = var.lambda_timeout

  # Option 1: Local deployment package (update path as needed)
  filename         = "../../backend/auth_deployment_package.zip" 
  source_code_hash = filebase64sha256("../../backend/auth_deployment_package.zip")

  # Option 2: S3 deployment package (uncomment and configure if using S3)
  # s3_bucket = "your-lambda-deployment-bucket"
  # s3_key    = "auth_deployment_package.zip"

  environment {
    variables = {
      SECRETS_ARN           = var.secrets_manager_arn
      STAGE                 = var.stage
      POWERTOOLS_SERVICE_NAME = "AuthService"
      LOG_LEVEL             = "INFO"
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.lambda_sg_id]
  }

  tags = {
    Name        = "${var.project_name}-AuthService-${var.stage}"
    Environment = var.stage
    Project     = var.project_name
    Service     = "Auth"
  }
}

resource "aws_lambda_function" "inventory_service" {
  function_name = "${var.project_name}-InventoryService-${var.stage}"
  role          = aws_iam_role.lambda_exec_role.arn
  handler       = "handler.lambda_handler" # Adjust if your handler is different
  runtime       = var.lambda_runtime
  memory_size   = var.lambda_memory_size
  timeout       = var.lambda_timeout

  filename         = "../../backend/inventory_deployment_package.zip"
  source_code_hash = filebase64sha256("../../backend/inventory_deployment_package.zip")

  environment {
    variables = {
      SECRETS_ARN           = var.secrets_manager_arn
      STAGE                 = var.stage
      POWERTOOLS_SERVICE_NAME = "InventoryService"
      LOG_LEVEL             = "INFO"
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.lambda_sg_id]
  }

  tags = {
    Name        = "${var.project_name}-InventoryService-${var.stage}"
    Environment = var.stage
    Project     = var.project_name
    Service     = "Inventory"
  }
}

resource "aws_lambda_function" "recipe_service" {
  function_name = "${var.project_name}-RecipeService-${var.stage}"
  role          = aws_iam_role.lambda_exec_role.arn
  handler       = "handler.lambda_handler" # Adjust if your handler is different
  runtime       = var.lambda_runtime
  memory_size   = var.lambda_memory_size
  timeout       = var.lambda_timeout

  filename         = "../../backend/recipe_deployment_package.zip"
  source_code_hash = filebase64sha256("../../backend/recipe_deployment_package.zip")

  environment {
    variables = {
      SECRETS_ARN           = var.secrets_manager_arn
      STAGE                 = var.stage
      POWERTOOLS_SERVICE_NAME = "RecipeService"
      LOG_LEVEL             = "INFO"
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.lambda_sg_id]
  }

  tags = {
    Name        = "${var.project_name}-RecipeService-${var.stage}"
    Environment = var.stage
    Project     = var.project_name
    Service     = "Recipe"
  }
}

# --- API Gateway (REST API) ---
resource "aws_api_gateway_rest_api" "main" {
  name        = "${var.project_name}-API-${var.stage}"
  description = "API Gateway for ${var.project_name}"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Name        = "${var.project_name}-API-${var.stage}"
    Environment = var.stage
    Project     = var.project_name
  }
}

# --- API Gateway Resources ---
resource "aws_api_gateway_resource" "auth" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "auth"
}

resource "aws_api_gateway_resource" "auth_login" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.auth.id
  path_part   = "login"
}

resource "aws_api_gateway_resource" "auth_register" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.auth.id
  path_part   = "register"
}

resource "aws_api_gateway_resource" "inventory" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "inventory"
}

resource "aws_api_gateway_resource" "inventory_items" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.inventory.id
  path_part   = "items"
}

resource "aws_api_gateway_resource" "inventory_item_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.inventory_items.id
  path_part   = "{item_id}" # Path parameter syntax for REST API
}

resource "aws_api_gateway_resource" "recipes" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "recipes"
}

resource "aws_api_gateway_resource" "recipes_generate" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.recipes.id
  path_part   = "generate"
}

# --- API Gateway Methods & Integrations ---

# POST /auth/login
resource "aws_api_gateway_method" "auth_login_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.auth_login.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_login_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.auth_login.id
  http_method = aws_api_gateway_method.auth_login_post.http_method

  integration_http_method = "POST" # Must be POST for Lambda proxy
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.auth_service.invoke_arn
}

# POST /auth/register
resource "aws_api_gateway_method" "auth_register_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.auth_register.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_register_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.auth_register.id
  http_method = aws_api_gateway_method.auth_register_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.auth_service.invoke_arn
}

# GET /inventory/items
resource "aws_api_gateway_method" "inventory_items_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.inventory_items.id
  http_method   = "GET"
  authorization = "NONE" # Add authorization if needed (e.g., COGNITO_USER_POOLS)
}

resource "aws_api_gateway_integration" "inventory_items_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.inventory_items.id
  http_method = aws_api_gateway_method.inventory_items_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.inventory_service.invoke_arn
}

# POST /inventory/items
resource "aws_api_gateway_method" "inventory_items_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.inventory_items.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "inventory_items_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.inventory_items.id
  http_method = aws_api_gateway_method.inventory_items_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.inventory_service.invoke_arn
}

# DELETE /inventory/items/{item_id}
resource "aws_api_gateway_method" "inventory_item_delete" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.inventory_item_id.id
  http_method   = "DELETE"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "inventory_item_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.inventory_item_id.id
  http_method = aws_api_gateway_method.inventory_item_delete.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.inventory_service.invoke_arn
}

# GET /recipes/generate
resource "aws_api_gateway_method" "recipes_generate_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.recipes_generate.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "recipes_generate_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.recipes_generate.id
  http_method = aws_api_gateway_method.recipes_generate_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.recipe_service.invoke_arn
}

# --- CORS Configuration (OPTIONS methods) ---
# Add OPTIONS method for each resource requiring CORS

resource "aws_api_gateway_method" "auth_login_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.auth_login.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_login_options_mock" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.auth_login.id
  http_method = aws_api_gateway_method.auth_login_options.http_method
  type        = "MOCK" # Use MOCK integration for OPTIONS

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "auth_login_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.auth_login.id
  http_method = aws_api_gateway_method.auth_login_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "auth_login_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.auth_login.id
  http_method = aws_api_gateway_method.auth_login_options.http_method
  status_code = aws_api_gateway_method_response.auth_login_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'" # Replace with frontend URL
  }

  response_templates = {
    "application/json" = "" # Empty body for OPTIONS
  }
  depends_on = [aws_api_gateway_integration.auth_login_options_mock]
}

# OPTIONS /auth/register
resource "aws_api_gateway_method" "auth_register_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.auth_register.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_register_options_mock" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.auth_register.id
  http_method = aws_api_gateway_method.auth_register_options.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "auth_register_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.auth_register.id
  http_method = aws_api_gateway_method.auth_register_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "auth_register_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.auth_register.id
  http_method = aws_api_gateway_method.auth_register_options.http_method
  status_code = aws_api_gateway_method_response.auth_register_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'" # Replace with frontend URL
  }
  response_templates = {
    "application/json" = ""
  }
  depends_on = [aws_api_gateway_integration.auth_register_options_mock]
}

# OPTIONS /inventory/items
resource "aws_api_gateway_method" "inventory_items_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.inventory_items.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "inventory_items_options_mock" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.inventory_items.id
  http_method = aws_api_gateway_method.inventory_items_options.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "inventory_items_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.inventory_items.id
  http_method = aws_api_gateway_method.inventory_items_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "inventory_items_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.inventory_items.id
  http_method = aws_api_gateway_method.inventory_items_options.http_method
  status_code = aws_api_gateway_method_response.inventory_items_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'" # Replace with frontend URL
  }
  response_templates = {
    "application/json" = ""
  }
  depends_on = [aws_api_gateway_integration.inventory_items_options_mock]
}

# OPTIONS /inventory/items/{item_id}
resource "aws_api_gateway_method" "inventory_item_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.inventory_item_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "inventory_item_id_options_mock" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.inventory_item_id.id
  http_method = aws_api_gateway_method.inventory_item_id_options.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "inventory_item_id_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.inventory_item_id.id
  http_method = aws_api_gateway_method.inventory_item_id_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "inventory_item_id_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.inventory_item_id.id
  http_method = aws_api_gateway_method.inventory_item_id_options.http_method
  status_code = aws_api_gateway_method_response.inventory_item_id_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'DELETE,OPTIONS'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'" # Replace with frontend URL
  }
  response_templates = {
    "application/json" = ""
  }
  depends_on = [aws_api_gateway_integration.inventory_item_id_options_mock]
}

# OPTIONS /recipes/generate
resource "aws_api_gateway_method" "recipes_generate_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.recipes_generate.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "recipes_generate_options_mock" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.recipes_generate.id
  http_method = aws_api_gateway_method.recipes_generate_options.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "recipes_generate_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.recipes_generate.id
  http_method = aws_api_gateway_method.recipes_generate_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "recipes_generate_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.recipes_generate.id
  http_method = aws_api_gateway_method.recipes_generate_options.http_method
  status_code = aws_api_gateway_method_response.recipes_generate_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'" # Replace with frontend URL
  }
  response_templates = {
    "application/json" = ""
  }
  depends_on = [aws_api_gateway_integration.recipes_generate_options_mock]
}

# --- API Gateway Deployment ---
resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  # Trigger deployment on changes to methods or integrations
  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_integration.auth_login_post_lambda,
      aws_api_gateway_integration.auth_register_post_lambda,
      aws_api_gateway_integration.inventory_items_get_lambda,
      aws_api_gateway_integration.inventory_items_post_lambda,
      aws_api_gateway_integration.inventory_item_delete_lambda,
      aws_api_gateway_integration.recipes_generate_get_lambda,
      # Add OPTIONS integrations
      aws_api_gateway_integration.auth_login_options_mock,
      aws_api_gateway_integration.auth_register_options_mock,
      aws_api_gateway_integration.inventory_items_options_mock,
      aws_api_gateway_integration.inventory_item_id_options_mock,
      aws_api_gateway_integration.recipes_generate_options_mock,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

# --- API Gateway Stage ---
resource "aws_api_gateway_stage" "main" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = var.stage

  tags = {
    Name        = "${var.project_name}-API-Stage-${var.stage}"
    Environment = var.stage
    Project     = var.project_name
  }
}

# --- Lambda Permissions for API Gateway ---
resource "aws_lambda_permission" "api_gw_auth_login" {
  statement_id  = "AllowAPIGatewayInvokeAuthLogin"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth_service.function_name
  principal     = "apigateway.amazonaws.com"

  # Construct source ARN for REST API
  source_arn = "${aws_api_gateway_rest_api.main.execution_arn}/*/${aws_api_gateway_method.auth_login_post.http_method}${aws_api_gateway_resource.auth_login.path}"
}

resource "aws_lambda_permission" "api_gw_auth_register" {
  statement_id  = "AllowAPIGatewayInvokeAuthRegister"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth_service.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/${aws_api_gateway_method.auth_register_post.http_method}${aws_api_gateway_resource.auth_register.path}"
}

resource "aws_lambda_permission" "api_gw_inventory_get" {
  statement_id  = "AllowAPIGatewayInvokeInventoryGet"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.inventory_service.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/${aws_api_gateway_method.inventory_items_get.http_method}${aws_api_gateway_resource.inventory_items.path}"
}

resource "aws_lambda_permission" "api_gw_inventory_post" {
  statement_id  = "AllowAPIGatewayInvokeInventoryPost"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.inventory_service.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/${aws_api_gateway_method.inventory_items_post.http_method}${aws_api_gateway_resource.inventory_items.path}"
}

resource "aws_lambda_permission" "api_gw_inventory_delete" {
  statement_id  = "AllowAPIGatewayInvokeInventoryDelete"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.inventory_service.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/${aws_api_gateway_method.inventory_item_delete.http_method}${aws_api_gateway_resource.inventory_item_id.path}"
}

resource "aws_lambda_permission" "api_gw_recipes_generate" {
  statement_id  = "AllowAPIGatewayInvokeRecipesGenerate"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.recipe_service.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/${aws_api_gateway_method.recipes_generate_get.http_method}${aws_api_gateway_resource.recipes_generate.path}"
}
