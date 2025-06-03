# Grid3 TTS Proxy Setup Instructions

## The Problem
Grid3 tries to connect to `https://api.elevenlabs.io` (HTTPS on port 443) to validate API keys, but your proxy runs on `http://localhost:3000` (HTTP on port 3000).

## The Solution
You need to run the proxy server as **Administrator** so it can:
1. Bind to port 443 for HTTPS
2. Accept Grid3's connection attempts

## Steps to Fix Grid3 Connection

### 1. Stop Current Server
- Press `Ctrl+C` in the current server window to stop it

### 2. Run as Administrator
- **Right-click** on `start-proxy-admin.bat`
- Select **"Run as Administrator"**
- Click **"Yes"** when Windows asks for permission

### 3. Verify HTTPS is Working
The server should show:
```
✅ TTS Proxy HTTP server started on port 3000
✅ TTS Proxy HTTPS server started on port 443
```

### 4. Test Grid3 Connection
- Open Grid3
- Go to TTS settings
- Enter **any API key** (like "test-key" or "my-api-key")
- Press **"Connect"**
- It should now connect successfully!

## What This Does

1. **HTTP Server (port 3000)**: For testing and development
2. **HTTPS Server (port 443)**: For Grid3 compatibility
3. **Hosts File Redirect**: `api.elevenlabs.io` → `127.0.0.1`
4. **API Key Acceptance**: Any API key will work (proxy mode)

## Troubleshooting

### If HTTPS Still Fails
- Make sure you're running as Administrator
- Check Windows Firewall isn't blocking port 443
- Verify the hosts file redirect is active: `node manage-hosts.js status`

### If Grid3 Still Can't Connect
- Check the server logs for incoming requests
- Try restarting Grid3 after starting the proxy
- Ensure no other software is using port 443

## Success Indicators

✅ **Server logs show**: "HTTPS server started on port 443"  
✅ **Grid3 shows**: "Connected" status  
✅ **Voices appear**: 590+ voices from multiple engines  
✅ **TTS works**: Audio generation without hanging  

## Alternative (If Admin Mode Fails)

If you can't run as Administrator, you can try:
1. Change Grid3's API endpoint (if possible) to `http://localhost:3000`
2. Use a different port forwarding tool
3. Run Grid3 in a different mode that doesn't require HTTPS

---

**Once connected, Grid3 will have access to 590+ voices from Azure, OpenAI, ElevenLabs, and other engines!**
