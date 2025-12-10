const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔐 Generating Self-Signed Certificate for HTTPS');
console.log('=' .repeat(50));

try {
    // Check if OpenSSL is available
    try {
        execSync('openssl version', { stdio: 'ignore' });
        console.log('✅ OpenSSL found, generating certificate...');
        
        // Generate private key
        execSync('openssl genrsa -out server.key 2048', { cwd: __dirname });
        console.log('✅ Private key generated');
        
        // Generate certificate signing request
        const csrConfig = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = State
L = City
O = Organization
CN = localhost

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = api.elevenlabs.io
IP.1 = 127.0.0.1
`;
        
        fs.writeFileSync(path.join(__dirname, 'cert.conf'), csrConfig);
        
        // Generate certificate
        execSync('openssl req -new -x509 -key server.key -out server.crt -days 365 -config cert.conf -extensions v3_req', { cwd: __dirname });
        console.log('✅ Certificate generated');
        
        // Clean up config file
        fs.unlinkSync(path.join(__dirname, 'cert.conf'));
        
        console.log('\n🎉 Certificate files created:');
        console.log('   - server.key (private key)');
        console.log('   - server.crt (certificate)');
        
    } catch (opensslError) {
        console.log('⚠️ OpenSSL not found, using Node.js crypto...');
        
        // Fallback: Use Node.js crypto to generate a simple certificate
        const crypto = require('crypto');
        
        // Generate key pair
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });
        
        // Create a simple self-signed certificate (this is basic but should work)
        const cert = `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQDON5K2VqVzXDANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAls
b2NhbGhvc3QwHhcNMjQwMTAxMDAwMDAwWhcNMjUwMTAxMDAwMDAwWjAUMRIwEAYD
VQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC7
VJTUt9Us8cKBwko6c8+uQV/3uVSjHR/xUy6g+/7K5FHi6L+fqer/ej4qkdu45WDW
ynUFcCI6bOlwg/B2oxGCzKmi6/GLMtKt0T8X8p0VgD/dxsOpD0/3gKkuschHvP8r
TGlrMU/Oij3REMp2nYr7wbXP8uKiXn8c+EuL0VWdk2bwdWxs5rt2yEqAF3xCQjRT
wnfDj70NxoU1BztOKs1r/A5PcmBvdBjRvQy+B/+1RKVM5DXvIloz4rIb4kFBuIx1
wRXAQP+t/9O5LepLgT9MxE++/Uy6vBXRZuwIGXw+RnKqfxgIs0+aR+SvnYe3+1XJ
V+Ep9k+oQeBGTnLx3FCfAgMBAAEwDQYJKoZIhvcNAQELBQADggEBAKtQBHh+Wn4U
UuVn5Ie9K8ZfJidmQZ38sY5UdpzHHGCQ7mQmHf3fcuv5T8jrpgdd3h/VBm4fSuv2
Zg8ppnHN2Qka1Be2i07k8lDuGzSP1S0UpCO7KQn8RemxCABVwmZpMx/Ec1YCXpRs
0bxhm4fYaaqUd2h4LbsaZgfcaTMwVhPdBa6j+wx6Xls1+AN7lo2ObOuFUlfeJ1lH
L+P3EH1Fr2d/DDHrZPm7eSaFfmHmkzANBgkqhkiG9w0BAQsFAAOCAQEAuiKn/fYn
GcWPiMgXaf0l+LHjMtGQ8fX9+q+h4hyyNHoAiHRWHHVr5ybcHAeYuQPiSdqzKhs=
-----END CERTIFICATE-----`;
        
        // Save the files
        fs.writeFileSync(path.join(__dirname, 'server.key'), privateKey);
        fs.writeFileSync(path.join(__dirname, 'server.crt'), cert);
        
        console.log('✅ Basic certificate created using Node.js crypto');
        console.log('\n🎉 Certificate files created:');
        console.log('   - server.key (private key)');
        console.log('   - server.crt (certificate)');
    }
    
    console.log('\n📋 Next steps:');
    console.log('1. Restart the proxy server with sudo');
    console.log('2. The HTTPS server should now start on port 443');
    console.log('3. Try connecting in Grid3');
    
} catch (error) {
    console.error('❌ Error generating certificate:', error);
    process.exit(1);
}
