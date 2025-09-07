#!/usr/bin/env python3
"""
Quick connectivity test script to diagnose connection issues
Run this to test if httpx can connect to your target server
"""

import asyncio
import httpx
import time

async def test_connection():
    """Test different connection approaches"""

    base_url = "http://localhost:8003"
    endpoint = "/alert-history"

    # Test URLs
    test_urls = [
        f"{base_url}{endpoint}",
        f"http://127.0.0.1:8003{endpoint}",
        f"http://host.docker.internal:8003{endpoint}"  # For Docker environments
    ]

    headers = {
        "user-type": "admin",
        "username": "aniketmodi@polarisgrids.com",
        "project": "gp-admin",
        "Content-Type": "application/json"
    }

    print("🔍 Testing connectivity with different approaches...\n")

    for i, url in enumerate(test_urls, 1):
        print(f"Test {i}: {url}")
        try:
            start_time = time.time()

            # Test with different client configurations
            configs = [
                {"timeout": 10.0},
                {"timeout": 10.0, "verify": False},
                {"timeout": 10.0, "verify": False, "follow_redirects": True}
            ]

            for j, config in enumerate(configs, 1):
                try:
                    async with httpx.AsyncClient(**config) as client:
                        response = await client.get(url, headers=headers)
                        elapsed = time.time() - start_time
                        print(f"  ✅ Config {j}: SUCCESS - Status: {response.status_code}, Time: {elapsed:.2f}s")
                        print(f"     Response: {response.text[:100]}...")
                        break
                except Exception as e:
                    print(f"  ❌ Config {j}: FAILED - {str(e)}")
            else:
                print(f"  ❌ All configs failed for {url}")

        except Exception as e:
            print(f"  ❌ FAILED: {str(e)}")

        print()

    # Test basic socket connection
    print("🔍 Testing raw socket connection...")
    try:
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex(('localhost', 8003))
        sock.close()

        if result == 0:
            print("  ✅ Socket connection: SUCCESS - Port is open")
        else:
            print(f"  ❌ Socket connection: FAILED - Port might be closed (code: {result})")
    except Exception as e:
        print(f"  ❌ Socket test failed: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_connection())
