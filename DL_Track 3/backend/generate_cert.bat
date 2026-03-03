@echo off
echo ========================================
echo  Generating Self-Signed SSL Certificate
echo ========================================
echo.

cd certs

echo Creating private key and certificate...
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=SG/ST=Singapore/L=Singapore/O=SENTINEL/OU=Development/CN=localhost"

echo.
echo ========================================
echo  Certificate generated successfully!
echo ========================================
echo.
echo Files created:
echo   - certs/cert.pem (certificate)
echo   - certs/key.pem (private key)
echo.
echo These certificates are valid for 365 days.
echo.
echo IMPORTANT: To trust this certificate in your browser:
echo 1. Open cert.pem in File Explorer
echo 2. Click "Install Certificate"
echo 3. Choose "Local Machine"
echo 4. Place in "Trusted Root Certification Authorities"
echo 5. Restart your browser
echo.
pause
