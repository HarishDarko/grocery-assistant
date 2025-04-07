terraform {
  backend "s3" {
    # Replace with your actual bucket name
    bucket = "grocery-assistant-tfstate-capstone" 
    key    = "prod/terraform.tfstate"
    region = "us-east-1"

    # Replace with your actual DynamoDB table name
    dynamodb_table = "grocery-assistant-tf-locks" 
    encrypt        = true
  }
}
