# OpenVoiceProxy - DigitalOcean App Platform Deployment Guide

This guide walks you through deploying OpenVoiceProxy to DigitalOcean App Platform with proper security, key management, and monitoring.

## 🚀 Quick Start

1. **Clone and prepare the repository**
2. **Set up environment variables**
3. **Deploy to DigitalOcean App Platform**
4. **Configure API keys and TTS engines**
5. **Test the deployment**

## 📋 Prerequisites

- [DigitalOcean Account](https://www.digitalocean.com/)
- [DigitalOcean CLI (doctl)](https://docs.digitalocean.com/reference/doctl/how-to/install/)
- [Node.js](https://nodejs.org/) (v16 or later)
- [Git](https://git-scm.com/)
- At least one TTS service API key (Azure, ElevenLabs, OpenAI, etc.)

## 🔧 Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ADMIN_API_KEY` | Admin API key for management interface | `tts_admin_key_here` |

### Optional TTS Engine Variables

| Variable | Description | Required For |
|----------|-------------|--------------|
| `AZURE_SPEECH_KEY` | Azure Speech Services API key | Azure TTS |
| `AZURE_SPEECH_REGION` | Azure Speech Services region | Azure TTS |
| `ELEVENLABS_API_KEY` | ElevenLabs API key | ElevenLabs TTS |
| `OPENAI_API_KEY` | OpenAI API key | OpenAI TTS |
| `AWS_ACCESS_KEY_ID` | AWS access key ID | AWS Polly |
| `AWS_SECRET_ACCESS_KEY` | AWS secret access key | AWS Polly |
| `AWS_REGION` | AWS region | AWS Polly |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Google Cloud credentials (JSON string) | Google Cloud TTS |

### Optional Configuration Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `CORS_ORIGIN` | `*` | CORS origin for API requests |
| `RATE_LIMIT_REQUESTS` | `100` | Rate limit requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in milliseconds |
| `MAX_REQUEST_SIZE` | `10mb` | Maximum request body size |
| `TRUST_PROXY` | `true` | Trust proxy headers (required for DigitalOcean) |

## 🚀 Deployment Steps

### Step 1: Prepare Your Repository

1. **Fork or clone this repository**
   ```bash
   git clone https://github.com/willwade/OpenVoiceProxy.git
   cd OpenVoiceProxy
   ```

2. **Install dependencies locally (for testing)**
   ```bash
   cd tts-proxy
   npm install
   ```

### Step 2: Set Up Environment Variables

1. **Create a `.env` file for local testing** (optional)
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

2. **Set environment variables for deployment**
   ```bash
   export ADMIN_API_KEY="your_secure_admin_key_here"
   export AZURE_SPEECH_KEY="your_azure_key"
   export AZURE_SPEECH_REGION="westeurope"
   # Add other TTS service keys as needed
   ```

### Step 3: Deploy to DigitalOcean

#### Option A: Using the Deployment Script (Recommended)

1. **Make the deployment script executable**
   ```bash
   chmod +x scripts/deploy.sh
   ```

2. **Run the deployment script**
   ```bash
   ./scripts/deploy.sh
   ```

#### Option B: Manual Deployment

1. **Install DigitalOcean CLI**
   ```bash
   # macOS
   brew install doctl
   
   # Linux
   wget https://github.com/digitalocean/doctl/releases/download/v1.94.0/doctl-1.94.0-linux-amd64.tar.gz
   tar xf doctl-1.94.0-linux-amd64.tar.gz
   sudo mv doctl /usr/local/bin
   ```

2. **Authenticate with DigitalOcean**
   ```bash
   doctl auth init
   ```

3. **Create the app**
   ```bash
   doctl apps create --spec .do/app.yaml
   ```

### Step 4: Configure Environment Variables in DigitalOcean

1. **Go to your DigitalOcean Apps dashboard**
2. **Select your TTS Proxy app**
3. **Go to Settings → Environment Variables**
4. **Add all required environment variables**
5. **Deploy the changes**

### Step 5: Set Up Database (Automatic)

The PostgreSQL database is automatically created and configured through the `app.yaml` specification. The application will:

- Create necessary tables on first startup
- Handle database migrations automatically
- Fall back to file-based storage if database is unavailable

## 🔑 API Key Management

### Creating the First Admin Key

After deployment, you need to create your first admin API key:

1. **Access your app's console** (through DigitalOcean dashboard)
2. **Run the admin key creation script**
   ```bash
   cd tts-proxy
   npx tsx scripts/create-admin-key.ts
   ```
3. **Save the generated API key securely**

### Using the Admin Interface

1. **Access the admin interface**
   ```
   https://your-app-name.ondigitalocean.app/admin
   ```

2. **Log in with your admin API key**

3. **Create additional API keys for your applications**

## 🔒 Security Features

### Authentication
- **API Key Authentication**: All endpoints require valid API keys
- **Admin Keys**: Special keys for management operations
- **Rate Limiting**: Configurable rate limits per API key

### Security Headers
- **CORS Protection**: Configurable CORS origins
- **XSS Protection**: Prevents cross-site scripting
- **Content Security Policy**: Restricts resource loading
- **HTTPS Enforcement**: Automatic HTTPS in production

### Request Validation
- **Input Sanitization**: Validates all incoming requests
- **Size Limits**: Prevents oversized requests
- **IP Filtering**: Optional IP allowlist/blocklist

## 📊 Monitoring and Logging

### Health Check Endpoints

| Endpoint | Description |
|----------|-------------|
| `/health` | Basic health check with system info |
| `/ready` | Readiness check for load balancers |
| `/metrics` | Application metrics and statistics |

### Logging

- **Structured JSON Logging**: Easy to parse and analyze
- **Request Tracking**: Unique request IDs for tracing
- **Error Tracking**: Automatic error capture and reporting
- **Performance Metrics**: Response times and throughput

### Monitoring Setup

1. **DigitalOcean Monitoring** (built-in)
   - CPU, memory, and network usage
   - Application logs
   - Uptime monitoring

2. **Custom Metrics** (via `/metrics` endpoint)
   - Request counts and error rates
   - TTS engine usage
   - API key usage statistics

## 🧪 Testing Your Deployment

### 1. Health Check
```bash
curl https://your-app-name.ondigitalocean.app/health
```

### 2. API Key Test
```bash
curl -H "X-API-Key: your_api_key" \
     https://your-app-name.ondigitalocean.app/v1/voices
```

### 3. TTS Test
```bash
curl -X POST \
     -H "X-API-Key: your_api_key" \
     -H "Content-Type: application/json" \
     -d '{"text": "Hello, world!", "voice_settings": {"stability": 0.5}}' \
     https://your-app-name.ondigitalocean.app/v1/text-to-speech/local-voice-1/stream/with-timestamps
```

## 🔧 Troubleshooting

### Common Issues

1. **App won't start**
   - Check environment variables are set correctly
   - Verify database connection
   - Check application logs in DigitalOcean dashboard

2. **TTS engines not working**
   - Verify API keys are correct
   - Check TTS service quotas and limits
   - Review engine-specific error messages

3. **Authentication failures**
   - Ensure API keys are created and active
   - Check API key format and headers
   - Verify admin key is set correctly

### Debugging

1. **Check application logs**
   ```bash
   doctl apps logs your-app-id
   ```

2. **Monitor metrics**
   ```bash
   curl https://your-app-name.ondigitalocean.app/metrics
   ```

3. **Test individual components**
   - Use the admin interface to check API keys
   - Test each TTS engine separately
   - Verify database connectivity

## 📈 Scaling and Performance

### Horizontal Scaling
- Increase instance count in `app.yaml`
- DigitalOcean handles load balancing automatically

### Vertical Scaling
- Upgrade instance size in `app.yaml`
- Monitor memory and CPU usage

### Database Scaling
- Upgrade database size as needed
- Consider connection pooling for high traffic

## 🔄 Updates and Maintenance

### Updating the Application
1. **Push changes to your repository**
2. **DigitalOcean will automatically deploy** (if auto-deploy is enabled)
3. **Or manually trigger deployment**
   ```bash
   doctl apps create-deployment your-app-id
   ```

### Database Maintenance
- **Automatic backups** are enabled by default
- **Point-in-time recovery** available
- **Monitor database performance** through DigitalOcean dashboard

### Security Updates
- **Keep dependencies updated** regularly
- **Monitor security advisories**
- **Review and rotate API keys** periodically

## 📞 Support

- **GitHub Issues**: [Report bugs and feature requests](https://github.com/willwade/TTSElevenLabsProxy/issues)
- **Documentation**: [Full API documentation](README.md)
- **DigitalOcean Support**: [App Platform documentation](https://docs.digitalocean.com/products/app-platform/)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
