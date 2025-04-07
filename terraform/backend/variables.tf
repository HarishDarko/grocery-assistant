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

variable "vpc_id" {
  description = "The ID of the VPC."
  type        = string
}

variable "private_subnet_ids" {
  description = "A list of private subnet IDs."
  type        = list(string)
}

variable "lambda_sg_id" {
  description = "The ID of the Lambda security group."
  type        = string
}

variable "secrets_manager_arn" {
  description = "The ARN of the Secrets Manager secret containing application secrets."
  type        = string
}

variable "lambda_memory_size" {
  description = "Memory size for Lambda functions."
  type        = number
  default     = 512 # Increased default memory
}

variable "lambda_timeout" {
  description = "Timeout for Lambda functions in seconds."
  type        = number
  default     = 30 # Increased default timeout
}

variable "lambda_runtime" {
  description = "Runtime for Lambda functions."
  type        = string
  default     = "python3.12"
}

variable "allowed_origin_url" {
  description = "The URL of the frontend origin allowed for CORS requests (e.g., CloudFront URL)."
  type        = string
}
