# --- Random ID for unique bucket name ---
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# --- S3 Bucket for Frontend ---
resource "aws_s3_bucket" "frontend_bucket" {
  # Use provided name or generate a unique one
  bucket = var.frontend_bucket_name == null ? "${lower(var.project_name)}-frontend-${var.stage}-${random_id.bucket_suffix.hex}" : var.frontend_bucket_name

  tags = {
    Name        = "${var.project_name}-frontend-bucket-${var.stage}"
    Environment = var.stage
    Project     = var.project_name
  }
}

# --- S3 Bucket Ownership Controls ---
resource "aws_s3_bucket_ownership_controls" "frontend_controls" {
  bucket = aws_s3_bucket.frontend_bucket.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# --- S3 Bucket Public Access Block ---
# Allow public access for website hosting, but CloudFront will use OAI
resource "aws_s3_bucket_public_access_block" "frontend_access_block" {
  bucket = aws_s3_bucket.frontend_bucket.id

  block_public_acls       = false # Must be false for website hosting ACLs
  block_public_policy     = false # Allow bucket policy for public read
  ignore_public_acls      = false # Must be false for website hosting ACLs
  restrict_public_buckets = false # Allow public access via bucket policy/ACLs
}

# --- S3 Bucket Website Configuration ---
resource "aws_s3_bucket_website_configuration" "frontend_config" {
  bucket = aws_s3_bucket.frontend_bucket.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html" # Optional: redirect errors to index.html for SPA
  }

  depends_on = [aws_s3_bucket_public_access_block.frontend_access_block]
}

# --- S3 Bucket Policy for Public Read (Needed for Website Hosting) ---
data "aws_iam_policy_document" "s3_public_read" {
  statement {
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend_bucket.arn}/*"]
  }
}

resource "aws_s3_bucket_policy" "frontend_policy" {
  bucket = aws_s3_bucket.frontend_bucket.id
  policy = data.aws_iam_policy_document.s3_public_read.json

  depends_on = [
    aws_s3_bucket_public_access_block.frontend_access_block,
    aws_s3_bucket_ownership_controls.frontend_controls
  ]
}

# --- CloudFront Origin Access Identity (OAI) ---
# Allows CloudFront to securely access the S3 bucket
resource "aws_cloudfront_origin_access_identity" "oai" {
  comment = "OAI for ${aws_s3_bucket.frontend_bucket.id}"
}

# --- Update S3 Bucket Policy to allow OAI access ---
data "aws_iam_policy_document" "s3_oai_policy" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend_bucket.arn}/*"]

    principals {
      type        = "AWS"
      identifiers = [aws_cloudfront_origin_access_identity.oai.iam_arn]
    }
  }

  # Keep the public read statement if direct S3 website access is also desired
  # If only CloudFront access is needed, remove the statement below
  statement {
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend_bucket.arn}/*"]
    # Optional: Add condition to only allow public access if referred by CloudFront?
  }
}

resource "aws_s3_bucket_policy" "frontend_oai_policy" {
  bucket = aws_s3_bucket.frontend_bucket.id
  policy = data.aws_iam_policy_document.s3_oai_policy.json

  depends_on = [
    aws_s3_bucket_public_access_block.frontend_access_block,
    aws_s3_bucket_ownership_controls.frontend_controls,
    aws_cloudfront_origin_access_identity.oai # Ensure OAI exists before applying policy
  ]
}


# --- CloudFront Distribution ---
resource "aws_cloudfront_distribution" "s3_distribution" {
  origin {
    domain_name = aws_s3_bucket.frontend_bucket.bucket_regional_domain_name # Use regional domain name for OAI
    origin_id   = aws_s3_bucket.frontend_bucket.id

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.oai.cloudfront_access_identity_path
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "CloudFront distribution for ${var.project_name} frontend"
  default_root_object = "index.html"

  # logging_config {
  #   include_cookies = false
  #   bucket          = "your-cloudfront-logs-bucket.s3.amazonaws.com" # Create a separate bucket for logs
  #   prefix          = "cloudfront-logs/"
  # }

  # aliases = ["yourdomain.com", "www.yourdomain.com"] # Uncomment if using custom domain

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = aws_s3_bucket.frontend_bucket.id

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600 # Cache for 1 hour
    max_ttl                = 86400 # Cache for 1 day
  }

  # # Optional: Custom error response to redirect 404s to index.html for SPAs
  # custom_error_response {
  #   error_caching_min_ttl = 10
  #   error_code            = 404
  #   response_code         = 200
  #   response_page_path    = "/index.html"
  # }
  # custom_error_response {
  #   error_caching_min_ttl = 10
  #   error_code            = 403
  #   response_code         = 200
  #   response_page_path    = "/index.html"
  # }

  price_class = "PriceClass_100" # Use PriceClass_100 for cost savings (US, Canada, Europe)

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    # Or configure ACM certificate for custom domain:
    # acm_certificate_arn = "your-acm-certificate-arn"
    # ssl_support_method = "sni-only"
    # minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name        = "${var.project_name}-cloudfront-${var.stage}"
    Environment = var.stage
    Project     = var.project_name
  }

  depends_on = [aws_s3_bucket_policy.frontend_oai_policy] # Ensure bucket policy allows OAI
}

# --- Resource to update frontend config ---
# This uses a local-exec provisioner to update the config file.
# Requires `jq` to be installed on the machine running Terraform.
# Alternatively, handle this update step in the CI/CD pipeline.

# resource "null_resource" "update_frontend_config" {
#   triggers = {
#     api_url = var.api_gateway_invoke_url
#     # Add other triggers if config depends on more outputs
#   }

#   provisioner "local-exec" {
#     # Adjust path to config.js and jq command as needed
#     command = <<EOT
#       CONFIG_FILE="../../frontend/js/config.js"
#       API_URL="${self.triggers.api_url}"
      
#       # Check if jq is installed
#       if ! command -v jq &> /dev/null; then
#         echo "jq could not be found, skipping config update."
#         exit 0
#       fi

#       # Check if config file exists
#       if [ ! -f "$CONFIG_FILE" ]; then
#         echo "Config file $CONFIG_FILE not found, skipping update."
#         exit 0
#       fi

#       echo "Updating $CONFIG_FILE with API URL: $API_URL"
      
#       # Use a temporary file to avoid issues with in-place editing
#       TMP_FILE=$(mktemp)

#       # This assumes the config file has a specific structure.
#       # It replaces the value of API_GATEWAY_INVOKE_URL.
#       # Adjust the sed command based on the actual file content.
#       sed "s|const API_GATEWAY_INVOKE_URL = '.*';|const API_GATEWAY_INVOKE_URL = '${API_URL}';|" "$CONFIG_FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$CONFIG_FILE"

#       echo "Config file updated."
#     EOT
#     interpreter = ["bash", "-c"]
#   }

#   depends_on = [aws_api_gateway_stage.main] # Ensure API Gateway is deployed
# }
