output "api_gateway_invoke_url" {
  description = "The invoke URL for the API Gateway stage."
  value       = aws_api_gateway_stage.main.invoke_url
}

output "api_gateway_id" {
  description = "The ID of the API Gateway."
  value       = aws_api_gateway_rest_api.main.id
}

output "lambda_auth_function_name" {
  description = "The name of the Auth Lambda function."
  value       = aws_lambda_function.auth_service.function_name
}

output "lambda_inventory_function_name" {
  description = "The name of the Inventory Lambda function."
  value       = aws_lambda_function.inventory_service.function_name
}

output "lambda_recipe_function_name" {
  description = "The name of the Recipe Lambda function."
  value       = aws_lambda_function.recipe_service.function_name
}
