import asyncio
import httpx
import base64
import os

BASE_URL = "https://dpr-voice-log.preview.emergentagent.com"

async def test():
    # Login first
    async with httpx.AsyncClient(timeout=30.0) as client:
        login_resp = await client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "supervisor@example.com", "password": "supervisor123"}
        )
        print(f"Login: {login_resp.status_code}")
        token = login_resp.json().get("access_token")
        
        if not token:
            print("Login failed:", login_resp.json())
            return
        
        # Create a minimal valid audio (we'll just test the endpoint responds correctly)
        # In real test, would use actual audio file
        
        # Test with empty/invalid audio to see error handling
        test_data = base64.b64encode(b"test audio data - not valid").decode()
        
        stt_resp = await client.post(
            f"{BASE_URL}/api/v2/speech-to-text",
            json={"audio_data": test_data, "audio_format": "m4a"},
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"STT Response: {stt_resp.status_code}")
        print(f"STT Body: {stt_resp.text[:500]}")

asyncio.run(test())
