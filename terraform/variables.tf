variable "aws_region" {
  description = "The AWS region to deploy resources in."
  type        = string
  default     = "us-east-1"
}

variable "stage" {
  description = "The deployment stage (e.g., prod, dev)."
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "The name of the project."
  type        = string
  default     = "GroceryAssistant"
}

variable "secrets_manager_arn" {
  description = "The ARN of the Secrets Manager secret containing application secrets."
  type        = string
  # No default value, this must be provided
}
