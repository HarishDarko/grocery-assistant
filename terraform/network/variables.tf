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
