#!/bin/bash

# OpenVoiceProxy Deployment Script for DigitalOcean App Platform
# This script helps prepare and deploy OpenVoiceProxy to DigitalOcean

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command_exists "doctl"; then
        print_error "doctl (DigitalOcean CLI) is not installed"
        print_status "Install it from: https://docs.digitalocean.com/reference/doctl/how-to/install/"
        exit 1
    fi
    
    if ! command_exists "git"; then
        print_error "git is not installed"
        exit 1
    fi
    
    if ! command_exists "node"; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command_exists "npm"; then
        print_error "npm is not installed"
        exit 1
    fi
    
    print_success "All prerequisites are installed"
}

# Validate environment variables
validate_environment() {
    print_status "Validating environment variables..."
    
    local required_vars=(
        "ADMIN_API_KEY"
    )
    
    local optional_vars=(
        "AZURE_SPEECH_KEY"
        "AZURE_SPEECH_REGION"
        "ELEVENLABS_API_KEY"
        "OPENAI_API_KEY"
        "AWS_ACCESS_KEY_ID"
        "AWS_SECRET_ACCESS_KEY"
        "AWS_REGION"
        "GOOGLE_APPLICATION_CREDENTIALS_JSON"
    )
    
    local missing_required=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_required+=("$var")
        fi
    done
    
    if [[ ${#missing_required[@]} -gt 0 ]]; then
        print_error "Missing required environment variables:"
        for var in "${missing_required[@]}"; do
            echo "  - $var"
        done
        print_status "Set these variables and try again"
        exit 1
    fi
    
    local configured_engines=()
    
    if [[ -n "$AZURE_SPEECH_KEY" && -n "$AZURE_SPEECH_REGION" ]]; then
        configured_engines+=("Azure Speech Services")
    fi
    
    if [[ -n "$ELEVENLABS_API_KEY" ]]; then
        configured_engines+=("ElevenLabs")
    fi
    
    if [[ -n "$OPENAI_API_KEY" ]]; then
        configured_engines+=("OpenAI")
    fi
    
    if [[ -n "$AWS_ACCESS_KEY_ID" && -n "$AWS_SECRET_ACCESS_KEY" ]]; then
        configured_engines+=("AWS Polly")
    fi
    
    if [[ -n "$GOOGLE_APPLICATION_CREDENTIALS_JSON" ]]; then
        configured_engines+=("Google Cloud TTS")
    fi
    
    print_success "Environment validation complete"
    print_status "Configured TTS engines: ${configured_engines[*]:-eSpeak (fallback only)}"
}

# Create or update DigitalOcean app
deploy_to_digitalocean() {
    print_status "Deploying to DigitalOcean App Platform..."
    
    # Check if app already exists
    local app_name="openvoiceproxy"
    local app_exists=$(doctl apps list --format Name --no-header | grep -x "$app_name" || true)
    
    if [[ -n "$app_exists" ]]; then
        print_status "App '$app_name' already exists, updating..."
        doctl apps update "$app_name" --spec .do/app.yaml
    else
        print_status "Creating new app '$app_name'..."
        doctl apps create --spec .do/app.yaml
    fi
    
    print_success "Deployment initiated"
    print_status "Monitor deployment progress with: doctl apps list"
}

# Set environment variables in DigitalOcean
set_environment_variables() {
    print_status "Setting environment variables in DigitalOcean..."
    
    local app_name="openvoiceproxy"
    
    # Get app ID
    local app_id=$(doctl apps list --format ID,Name --no-header | grep "$app_name" | awk '{print $1}')
    
    if [[ -z "$app_id" ]]; then
        print_error "Could not find app '$app_name'"
        return 1
    fi
    
    print_status "Found app ID: $app_id"
    
    # Note: Environment variables should be set through the DigitalOcean dashboard
    # or using the doctl apps update command with a modified spec file
    print_warning "Environment variables should be set through the DigitalOcean dashboard"
    print_status "Go to: https://cloud.digitalocean.com/apps/$app_id/settings"
}

# Create initial admin API key
create_admin_key() {
    print_status "Creating initial admin API key..."
    
    if [[ -z "$ADMIN_API_KEY" ]]; then
        print_error "ADMIN_API_KEY environment variable is not set"
        return 1
    fi
    
    print_success "Admin API key is configured"
    print_status "You can access the admin interface at: https://your-app-url/admin"
}

# Main deployment function
main() {
    echo "🚀 TTS Proxy Deployment Script"
    echo "================================"
    
    check_prerequisites
    validate_environment
    
    # Ask for confirmation
    echo ""
    read -p "Do you want to proceed with deployment? (y/N): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Deployment cancelled"
        exit 0
    fi
    
    deploy_to_digitalocean
    set_environment_variables
    create_admin_key
    
    echo ""
    print_success "Deployment script completed!"
    echo ""
    print_status "Next steps:"
    echo "1. Monitor deployment: doctl apps list"
    echo "2. Set environment variables in DigitalOcean dashboard"
    echo "3. Access admin interface to create API keys"
    echo "4. Test the TTS endpoints"
    echo ""
    print_status "Documentation: https://github.com/willwade/TTSElevenLabsProxy/blob/main/README.md"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "TTS Proxy Deployment Script"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --check        Only check prerequisites and environment"
        echo ""
        echo "Environment Variables:"
        echo "  Required:"
        echo "    ADMIN_API_KEY                    Admin API key for management interface"
        echo ""
        echo "  Optional (TTS Engines):"
        echo "    AZURE_SPEECH_KEY                 Azure Speech Services API key"
        echo "    AZURE_SPEECH_REGION              Azure Speech Services region"
        echo "    ELEVENLABS_API_KEY               ElevenLabs API key"
        echo "    OPENAI_API_KEY                   OpenAI API key"
        echo "    AWS_ACCESS_KEY_ID                AWS access key ID"
        echo "    AWS_SECRET_ACCESS_KEY            AWS secret access key"
        echo "    AWS_REGION                       AWS region"
        echo "    GOOGLE_APPLICATION_CREDENTIALS_JSON  Google Cloud credentials JSON"
        exit 0
        ;;
    --check)
        check_prerequisites
        validate_environment
        print_success "All checks passed!"
        exit 0
        ;;
    "")
        main
        ;;
    *)
        print_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac
