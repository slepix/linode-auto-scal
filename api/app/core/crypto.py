import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from .config import settings


def _derive_key() -> bytes:
    key_material = settings.autoscaler_secret_key.encode()
    salt = b"linode-autoscaler-salt-v1"
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000)
    return kdf.derive(key_material)


def encrypt(plaintext: str) -> str:
    key = _derive_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.urlsafe_b64encode(nonce + ciphertext).decode()


def decrypt(ciphertext: str) -> str:
    key = _derive_key()
    try:
        data = base64.urlsafe_b64decode(ciphertext)
    except Exception:
        data = base64.b64decode(ciphertext)
    nonce = data[:12]
    ct = data[12:]
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, ct, None)
    return plaintext.decode()


def generate_api_key() -> str:
    return "sk-" + base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()
