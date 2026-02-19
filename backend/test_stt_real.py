import asyncio
import httpx
import base64
import os

# Generate a real audio file using gTTS (text-to-speech) to test STT
async def create_test_audio():
    try:
        from gtts import gTTS
        import io
        
        # Create Hindi audio
        tts = gTTS(text="मेरा नाम है और आज मौसम अच्छा है", lang='hi')
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        return audio_buffer.read()
    except Exception as e:
        print(f"Could not create test audio: {e}")
        return None

BASE_URL = "https://dpr-voice-log.preview.emergentagent.com"

async def test():
    # Login first
    async with httpx.AsyncClient(timeout=60.0) as client:
        login_resp = await client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "supervisor@example.com", "password": "supervisor123"}
        )
        print(f"Login: {login_resp.status_code}")
        token = login_resp.json().get("access_token")
        
        if not token:
            print("Login failed:", login_resp.json())
            return
        
        # Create real audio for testing
        audio_bytes = await create_test_audio()
        if not audio_bytes:
            print("Skipping STT test - no test audio available")
            return
            
        print(f"Audio bytes length: {len(audio_bytes)}")
        test_data = base64.b64encode(audio_bytes).decode()
        
        stt_resp = await client.post(
            f"{BASE_URL}/api/v2/speech-to-text",
            json={"audio_data": test_data, "audio_format": "mp3"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=60.0
        )
        print(f"STT Response: {stt_resp.status_code}")
        print(f"STT Body: {stt_resp.text}")

asyncio.run(test())
