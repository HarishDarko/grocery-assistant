output "api_gateway_invoke_url" {
  description = "The invoke URL for the API Gateway stage."
  value       = module.backend.api_gateway_invoke_url
}

output "cloudfront_distribution_url" {
  description = "The domain name of the CloudFront distribution."
  value       = module.frontend.cloudfront_distribution_url
}

output "frontend_s3_bucket_name" {
  description = "The name of the S3 bucket hosting the frontend."
  value       = module.frontend.s3_bucket_name
}
