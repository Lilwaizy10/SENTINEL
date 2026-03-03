# SENTINEL HTTPS Setup Guide

## SSL Certificate Generated

Your self-signed SSL certificate has been created successfully!

**Files:**
- `backend/certs/cert.pem` - SSL Certificate
- `backend/certs/key.pem` - Private Key

**Validity:** 365 days

---

## How to Start with HTTPS

### Option 1: Double-click `start-https.bat`
This will automatically start both backend and frontend with HTTPS.

### Option 2: Manual Start
```bash
# Terminal 1 - Backend (HTTPS)
cd backend
python main.py

# Terminal 2 - Frontend (HTTPS)
cd frontend
npm start
```

---

## Access the Application

- **Frontend:** https://localhost:3000
- **Backend API:** https://localhost:8443
- **API Docs:** https://localhost:8443/docs

---

## Browser Security Warning

When you first access https://localhost:3000 or https://localhost:8443, you will see a security warning:

**Chrome/Edge:**
1. Click "Advanced"
2. Click "Proceed to localhost (unsafe)"

**Firefox:**
1. Click "Advanced"
2. Click "Accept the Risk and Continue"

**This is normal and expected** for self-signed certificates on localhost.

---

## Trust the Certificate (Optional)

To avoid security warnings, install the certificate:

1. Open `backend/certs/cert.pem` in File Explorer
2. Click "Install Certificate"
3. Choose "Local Machine"
4. Select "Place all certificates in the following store"
5. Click "Browse" and select "Trusted Root Certification Authorities"
6. Click "OK" → "Next" → "Finish"
7. **Restart your browser**

---

## Benefits of HTTPS

1. **Geolocation works** - Browsers require HTTPS for location access
2. **Accurate GPS** - Get real GPS coordinates instead of IP-based location
3. **Secure connection** - All data is encrypted

---

## Troubleshooting

### "Connection refused" error
- Make sure backend is running on https://localhost:8443
- Check if certificates exist in `backend/certs/`

### Geolocation still not working
- Make sure you're accessing via **https://** not http://
- Check browser location permissions
- Wait 5-15 seconds for GPS to lock

### Certificate expired
- Run `python generate_cert.py` again to create new certificates

---

## Ports Used

| Service | Port | Protocol |
|---------|------|----------|
| Frontend | 3000 | HTTPS |
| Backend API | 8443 | HTTPS |
| WebSocket | 8443 | WSS |

---

## Regenerate Certificates

If needed, regenerate certificates:
```bash
cd backend
python generate_cert.py
```
