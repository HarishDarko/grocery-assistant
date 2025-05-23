terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0" # Use a recent version
    }
  }
  required_version = ">= 1.0"
}

provider "aws" {
  region = var.aws_region
}
