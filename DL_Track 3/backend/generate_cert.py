#!/usr/bin/env python3
"""
Generate self-signed SSL certificate for local development
"""
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from datetime import datetime, timedelta
import os
import sys

# Set UTF-8 encoding for Windows console
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

import ipaddress

# Create certs directory if it doesn't exist
os.makedirs("certs", exist_ok=True)

# Generate private key
print("Generating private key...")
private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=4096,
)

# Generate certificate
print("Generating certificate...")
subject = issuer = x509.Name([
    x509.NameAttribute(NameOID.COUNTRY_NAME, "SG"),
    x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Singapore"),
    x509.NameAttribute(NameOID.LOCALITY_NAME, "Singapore"),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, "SENTINEL"),
    x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, "Development"),
    x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
])

cert = x509.CertificateBuilder().subject_name(
    subject
).issuer_name(
    issuer
).public_key(
    private_key.public_key()
).serial_number(
    x509.random_serial_number()
).not_valid_before(
    datetime.utcnow()
).not_valid_after(
    datetime.utcnow() + timedelta(days=365)
).add_extension(
    x509.SubjectAlternativeName([
        x509.DNSName("localhost"),
        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
    ]),
    critical=False,
).sign(private_key, hashes.SHA256())

# Write certificate
print("Writing certificate to certs/cert.pem...")
with open("certs/cert.pem", "wb") as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))

# Write private key
print("Writing private key to certs/key.pem...")
with open("certs/key.pem", "wb") as f:
    f.write(private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption()
    ))

print()
print("Certificate generated successfully!")
print()
print("Files created:")
print("  - certs/cert.pem (certificate)")
print("  - certs/key.pem (private key)")
print()
print("These certificates are valid for 365 days.")
print()
print("IMPORTANT: To trust this certificate in your browser:")
print("  1. Open 'certs/cert.pem' in File Explorer")
print("  2. Click 'Install Certificate'")
print("  3. Choose 'Local Machine'")
print("  4. Place in 'Trusted Root Certification Authorities'")
print("  5. Restart your browser")
print()
input("Press Enter to exit...")
