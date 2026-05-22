import secrets
import string


def generate_meeting_id() -> str:
    """Zoom-style xxx-xxxx-xxx (10 digits, dash-separated)."""
    digits = "".join(secrets.choice(string.digits) for _ in range(10))
    return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"


def generate_token(length: int = 24) -> str:
    return secrets.token_urlsafe(length)
