variable "aws_region" {
  description = "The AWS region to deploy resources in."
  type        = string
}

variable "stage" {
  description = "The deployment stage (e.g., prod, dev)."
  type        = string
}

variable "project_name" {
  description = "The name of the project."
  type        = string
}

variable "api_gateway_invoke_url" {
  description = "The invoke URL of the API Gateway stage."
  type        = string
}

variable "frontend_bucket_name" {
  description = "Optional: Specify a custom name for the frontend S3 bucket. If not provided, a unique name will be generated."
  type        = string
  default     = null
}
