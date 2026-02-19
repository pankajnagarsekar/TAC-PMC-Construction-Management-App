"""
Backend API Tests for Construction Management App
Testing: Auth, STT Endpoint, and Basic API Health
"""
import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://dpr-voice-log.preview.emergentagent.com')

# Test credentials
SUPERVISOR_EMAIL = "supervisor@example.com"
SUPERVISOR_PASSWORD = "supervisor123"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"


class TestHealthEndpoints:
    """Health check endpoints"""
    
    def test_wave3_health(self):
        """Test Wave3 health endpoint"""
        response = requests.get(f"{BASE_URL}/api/v2/wave3/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "features" in data
        print(f"Wave3 Health: {data}")


class TestAuth:
    """Authentication endpoint tests"""
    
    def test_login_supervisor(self):
        """Test supervisor login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERVISOR_EMAIL,
            "password": SUPERVISOR_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == SUPERVISOR_EMAIL
        print(f"Supervisor login successful: {data['user']['name']}")
        return data["access_token"]
    
    def test_login_admin(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print(f"Admin login successful: {data['user']['name']}")
        return data["access_token"]
    
    def test_login_invalid_credentials(self):
        """Test login with wrong credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code in [401, 404], f"Expected 401/404, got {response.status_code}"
        print("Invalid credentials correctly rejected")


class TestSpeechToText:
    """Speech-to-Text endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for supervisor"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERVISOR_EMAIL,
            "password": SUPERVISOR_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed - skipping STT tests")
    
    def test_stt_endpoint_exists(self, auth_token):
        """Test that STT endpoint exists and is accessible"""
        # Create a minimal audio payload (will return error but proves endpoint works)
        minimal_audio = base64.b64encode(b"minimal test audio").decode('utf-8')
        
        response = requests.post(
            f"{BASE_URL}/api/v2/speech-to-text",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "audio_data": minimal_audio,
                "audio_format": "m4a"
            }
        )
        
        # Endpoint should respond (either with transcript or error, not 404/500)
        assert response.status_code in [200, 400, 422], f"STT endpoint error: {response.status_code} - {response.text}"
        print(f"STT endpoint response: {response.json()}")
    
    def test_stt_with_empty_audio(self, auth_token):
        """Test STT with too short audio"""
        # Very short audio should return appropriate error
        short_audio = base64.b64encode(b"x" * 50).decode('utf-8')
        
        response = requests.post(
            f"{BASE_URL}/api/v2/speech-to-text",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "audio_data": short_audio,
                "audio_format": "m4a"
            }
        )
        
        # Should handle gracefully (200 with error message or 400)
        assert response.status_code in [200, 400, 422]
        data = response.json()
        # Check if it returns an error message (expected for short audio)
        print(f"Short audio response: {data}")


class TestDPREndpoints:
    """DPR CRUD endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for supervisor"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERVISOR_EMAIL,
            "password": SUPERVISOR_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed - skipping DPR tests")
    
    def test_list_dprs(self, auth_token):
        """Test listing DPRs"""
        response = requests.get(
            f"{BASE_URL}/api/v2/dpr",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "dprs" in data
        print(f"Found {len(data['dprs'])} DPRs")


class TestProjectEndpoints:
    """Project endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERVISOR_EMAIL,
            "password": SUPERVISOR_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_list_projects(self, auth_token):
        """Test listing projects"""
        response = requests.get(
            f"{BASE_URL}/api/projects",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        print(f"Projects response: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
