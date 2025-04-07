output "cloudfront_distribution_url" {
  description = "The domain name of the CloudFront distribution."
  value       = "https://${aws_cloudfront_distribution.s3_distribution.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "The ID of the CloudFront distribution."
  value       = aws_cloudfront_distribution.s3_distribution.id
}

output "s3_bucket_name" {
  description = "The name of the S3 bucket hosting the frontend."
  value       = aws_s3_bucket.frontend_bucket.bucket
}

output "s3_bucket_website_endpoint" {
  description = "The website endpoint for the S3 bucket."
  value       = aws_s3_bucket_website_configuration.frontend_config.website_endpoint
}
