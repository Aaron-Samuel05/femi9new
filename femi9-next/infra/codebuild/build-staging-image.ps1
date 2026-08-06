$env:AWS_SHARED_CREDENTIALS_FILE = 'C:\Users\saiad\.aws\credentials'
$env:AWS_CONFIG_FILE = 'C:\Users\saiad\.aws\config'
$env:AWS_PROFILE = 'femi9-deploy'

$awsCli = 'C:\Program Files\Amazon\AWSCLIV2\aws.exe'
$repo = '851725383246.dkr.ecr.ap-south-1.amazonaws.com/femi9-staging-app'
$tag = 'e19b785'

& $awsCli ecr get-login-password --region ap-south-1 |
  docker login --username AWS --password-stdin $repo

docker build `
  --build-arg NEXT_PUBLIC_SITE_URL='https://d24too9me3angh.cloudfront.net' `
  --build-arg NEXT_PUBLIC_RAZORPAY_KEY_ID='rzp_test_staging_demo' `
  --build-arg NEXT_PUBLIC_SENTRY_DSN='' `
  -t "${repo}:$tag" .

if ($LASTEXITCODE -eq 0) {
  docker push "${repo}:$tag"
}
