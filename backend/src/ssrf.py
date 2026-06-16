"""
What this file does: Provides assert_safe_url() to block SSRF targets — private CIDRs,
link-local, loopback, and cloud metadata endpoints — before any outbound request is sent.
"""

import ipaddress
import socket
from urllib.parse import urlparse
import os

# CSV of hostnames/IPs allowed even if they resolve to private space (e.g. "host.docker.internal")
_ALLOWLIST = {
    h.strip()
    for h in os.environ.get("SSRF_ALLOWLIST", "host.docker.internal,localhost,127.0.0.1").split(",")
    if h.strip()
}

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),   # link-local / AWS metadata
    ipaddress.ip_network("::1/128"),           # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),          # IPv6 ULA
]

_METADATA_HOSTS = {
    "169.254.169.254",   # AWS / GCP / Azure IMDS
    "metadata.google.internal",
}


def _is_private_ip(ip_str: str) -> bool:
    """What it does: Return True when the IP string falls in a blocked network range."""
    try:
        addr = ipaddress.ip_address(ip_str)
        return any(addr in net for net in _BLOCKED_NETWORKS)
    except ValueError:
        return True  # unparseable → block


def assert_safe_url(url: str) -> None:
    """
    What it does: Raise ValueError when the URL resolves to a blocked (SSRF-risk) destination.
    Args:
        url: Fully-qualified URL string to validate before sending an outbound request.
    Raises:
        ValueError: When the host is in the metadata blocklist, resolves to a private/link-local
                    IP, or the hostname cannot be resolved.
    Notes:
        - Hosts in SSRF_ALLOWLIST env var bypass the private-IP check (default: localhost variants).
    """
    parsed = urlparse(url)
    host = parsed.hostname or ""

    if not host:
        raise ValueError(f"SSRF guard: empty host in URL '{url}'")

    if host in _METADATA_HOSTS:
        raise ValueError(f"SSRF guard: metadata endpoint blocked — {host}")

    if host in _ALLOWLIST:
        return

    try:
        resolved_ip = socket.gethostbyname(host)
    except socket.gaierror:
        raise ValueError(f"SSRF guard: cannot resolve host '{host}'")

    if _is_private_ip(resolved_ip):
        raise ValueError(f"SSRF guard: '{host}' resolves to private IP {resolved_ip} — blocked")
