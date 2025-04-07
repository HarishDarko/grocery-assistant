// Deploy script for S3 and CloudFront
// Usage: node deploy.js [environment]

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const environment = process.argv[2] || 'production';
const config = JSON.parse(fs.readFileSync('./deploy-config.json', 'utf8'));

console.log(`Deploying frontend to ${environment} environment...`);

// 1. Upload to S3
console.log(`Uploading to S3 bucket: ${config.s3.bucket}`);

// HTML files with no caching
execSync(`aws s3 sync . s3://${config.s3.bucket} --exclude "*" --include "*.html" --cache-control "max-age=0,no-cache,no-store,must-revalidate" --acl public-read`, { stdio: 'inherit' });

// Static assets with long-term caching
const staticFiles = config.cache.static.files.map(pattern => `--include "${pattern}"`).join(' ');
execSync(`aws s3 sync . s3://${config.s3.bucket} --exclude "*" ${staticFiles} --cache-control "max-age=${config.cache.static.maxAge}" --acl public-read`, { stdio: 'inherit' });

// All other files
execSync(`aws s3 sync . s3://${config.s3.bucket} --exclude "*.html" ${staticFiles.replace(/--include/g, '--exclude')} --acl public-read`, { stdio: 'inherit' });

// 2. Create CloudFront invalidation
if (config.cloudfront.distributionId) {
    console.log(`Creating CloudFront invalidation for distribution: ${config.cloudfront.distributionId}`);
    
    // Invalidate everything to ensure fresh content
    execSync(`aws cloudfront create-invalidation --distribution-id ${config.cloudfront.distributionId} --paths "/*"`, { stdio: 'inherit' });
}

console.log('Deployment complete!');
console.log(`Your site should be available at: https://${config.cloudfront.domain}`); 