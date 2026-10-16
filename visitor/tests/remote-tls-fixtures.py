"""Generate temporary test trust with the bundled cryptography runtime."""
import datetime
import ipaddress
import pathlib
import sys
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID

directory = pathlib.Path(sys.argv[1])
now = datetime.datetime.now(datetime.timezone.utc)
ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Isolated HEAT test CA")])
def builder(subject, public_key):
    return (x509.CertificateBuilder().subject_name(subject).issuer_name(ca_name)
            .public_key(public_key).serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(minutes=1))
            .not_valid_after(now + datetime.timedelta(days=1)))
def save(name, key, certificate):
    (directory / (name + ".key")).write_bytes(key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption()))
    (directory / (name + ".pem")).write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
ca = builder(ca_name, ca_key.public_key()).add_extension(
    x509.BasicConstraints(ca=True, path_length=None), critical=True).sign(ca_key, hashes.SHA256())
save("ca", ca_key, ca)
for name in ["server", "player", "toast", "rogue"]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)])
    value = builder(subject, key.public_key()).add_extension(
        x509.BasicConstraints(ca=False, path_length=None), critical=True)
    server = name in ["server", "player"]
    value = value.add_extension(x509.ExtendedKeyUsage([
        ExtendedKeyUsageOID.SERVER_AUTH if server else ExtendedKeyUsageOID.CLIENT_AUTH]), critical=False)
    if server:
        value = value.add_extension(x509.SubjectAlternativeName([
            x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
    save(name, key, value.sign(ca_key, hashes.SHA256()))
