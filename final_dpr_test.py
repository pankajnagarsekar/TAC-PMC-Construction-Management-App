#!/usr/bin/env python3
"""
Final DPR Bug Fix Test - Focused on the 3 specific scenarios
"""

import asyncio
import aiohttp
import json
import base64
import time
from datetime import datetime, timedelta

BACKEND_URL = 'http://localhost:8001'

async def test_dpr_bug_fixes():
    """Test the 3 specific DPR bug fix scenarios"""
    
    async with aiohttp.ClientSession() as session:
        # Login
        login_data = {"email": "admin@example.com", "password": "admin123"}
        async with session.post(f"{BACKEND_URL}/api/auth/login", json=login_data) as response:
            if response.status != 200:
                print("❌ Login failed")
                return
            data = await response.json()
            token = data["access_token"]
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            print("✅ Login successful")
        
        # Get project
        async with session.get(f"{BACKEND_URL}/api/projects", headers=headers) as response:
            projects = await response.json()
            if not projects:
                print("❌ No projects found")
                return
            project_id = projects[0]["project_id"]
            print(f"✅ Found project: {project_id}")
        
        # Test 1: Edit Draft DPR (404 Fix)
        print("\n=== TEST 1: Edit Draft DPR (404 Fix) ===")
        
        # Create DPR with unique timestamp
        unique_date = (datetime.now() + timedelta(days=int(time.time()) % 365)).strftime("%Y-%m-%d")
        dpr_data = {
            "project_id": project_id,
            "dpr_date": unique_date,
            "progress_notes": "Initial notes",
            "weather_conditions": "Sunny"
        }
        
        async with session.post(f"{BACKEND_URL}/api/v2/dpr", json=dpr_data, headers=headers) as response:
            if response.status == 201:
                result = await response.json()
                dpr_id = result["dpr_id"]
                print(f"✅ DPR created: {dpr_id}")
                
                # Try to update it
                update_data = {"progress_notes": "Updated notes - testing fix"}
                async with session.put(f"{BACKEND_URL}/api/v2/dpr/{dpr_id}", json=update_data, headers=headers) as update_response:
                    if update_response.status == 200:
                        print("✅ TEST 1 PASSED: Draft DPR update works (404 fix successful)")
                    else:
                        error = await update_response.text()
                        print(f"❌ TEST 1 FAILED: Update failed with {update_response.status}: {error}")
            else:
                error = await response.text()
                print(f"❌ TEST 1 FAILED: DPR creation failed: {error}")
        
        # Test 2: AI Caption Generation
        print("\n=== TEST 2: AI Caption Generation ===")
        
        test_image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        caption_request = {"image_data": test_image}
        
        async with session.post(f"{BACKEND_URL}/api/v2/dpr/ai-caption", json=caption_request, headers=headers) as response:
            if response.status == 200:
                result = await response.json()
                note = result.get("note", "")
                confidence = result.get("confidence", 0)
                
                if "Mock caption" in note or "API key not configured" in note:
                    print("❌ TEST 2 FAILED: MOCK provider being used instead of EMERGENT")
                elif "Fallback caption" in note:
                    print("❌ TEST 2 FAILED: Fallback caption - EMERGENT provider has issues")
                elif confidence > 0.8:  # High confidence indicates real AI processing
                    print(f"✅ TEST 2 PASSED: EMERGENT provider working! Caption: {result['ai_caption']}")
                else:
                    print(f"⚠️ TEST 2 PARTIAL: EMERGENT provider responding but may have issues. Confidence: {confidence}")
            else:
                error = await response.text()
                print(f"❌ TEST 2 FAILED: AI caption API failed: {error}")
        
        # Test 3: DPR Full Workflow
        print("\n=== TEST 3: DPR Full Workflow ===")
        
        # Create another DPR with different unique date
        unique_date2 = (datetime.now() + timedelta(days=int(time.time()) % 365 + 1)).strftime("%Y-%m-%d")
        dpr_data2 = {
            "project_id": project_id,
            "dpr_date": unique_date2,
            "progress_notes": "Workflow test",
            "weather_conditions": "Clear"
        }
        
        async with session.post(f"{BACKEND_URL}/api/v2/dpr", json=dpr_data2, headers=headers) as response:
            if response.status == 201:
                result = await response.json()
                dpr_id2 = result["dpr_id"]
                print(f"✅ DPR created for workflow: {dpr_id2}")
                
                # Add 4 images
                images_added = 0
                for i in range(4):
                    image_data = {
                        "dpr_id": dpr_id2,
                        "image_data": test_image,
                        "caption": f"Construction photo {i+1}",
                        "activity_code": f"ACT{i+1:02d}"
                    }
                    
                    async with session.post(f"{BACKEND_URL}/api/v2/dpr/{dpr_id2}/images", json=image_data, headers=headers) as img_response:
                        if img_response.status == 201:
                            images_added += 1
                        else:
                            error = await img_response.text()
                            print(f"❌ Failed to add image {i+1}: {error}")
                            break
                
                if images_added == 4:
                    print("✅ TEST 3 PASSED: All 4 images added successfully to DPR")
                else:
                    print(f"❌ TEST 3 FAILED: Only {images_added}/4 images added")
            else:
                error = await response.text()
                print(f"❌ TEST 3 FAILED: DPR creation failed: {error}")
        
        print("\n" + "="*60)
        print("🏁 DPR BUG FIX TESTING COMPLETE")
        print("="*60)

if __name__ == "__main__":
    asyncio.run(test_dpr_bug_fixes())