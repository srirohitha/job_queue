#!/usr/bin/env python3
"""
Quick test to verify the fixes for sleep logic and job processing
"""

import json
import time
import requests

# Test configuration
BASE_URL = "http://localhost:8000/api"

def test_job_processing():
    """Test job processing with timing verification"""
    
    # Login first
    login_data = {
        "username": "testuser",
        "password": "testpass123"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/auth/login/", json=login_data)
        if response.status_code != 200:
            print("Login failed, registering new user...")
            register_data = {
                "username": "testuser",
                "email": "test@example.com", 
                "password": "testpass123"
            }
            response = requests.post(f"{BASE_URL}/auth/register/", json=register_data)
            if response.status_code == 201:
                response = requests.post(f"{BASE_URL}/auth/login/", json=login_data)
        
        if response.status_code != 200:
            print("Authentication failed")
            return
            
        token = response.json()["token"]
        headers = {"Authorization": f"Token {token}"}
        print("✓ Authentication successful")
        
    except Exception as e:
        print(f"Authentication error: {e}")
        return

    # Test 1: JSON processing with sleep
    print("\n=== Testing JSON Processing (should take ~2 seconds) ===")
    json_data = {
        "label": "JSON Sleep Test",
        "input_mode": "json",
        "payload": {
            "rows": [
                {"name": "John Doe", "email": "john@example.com", "age": 25},
                {"name": "Jane Smith", "email": "jane@example.com", "age": 30}
            ]
        }
    }
    
    start_time = time.time()
    response = requests.post(f"{BASE_URL}/jobs/", json=json_data, headers=headers)
    elapsed_time = time.time() - start_time
    
    if response.status_code == 201:
        job = response.json()
        print(f"✓ JSON job created in {elapsed_time:.2f}s (expected ~2s)")
        print(f"  Job ID: {job['id']}")
        print(f"  Initial status: {job['status']} - {job['stage']}")
        
        # Wait a bit and check status
        time.sleep(3)
        check_response = requests.get(f"{BASE_URL}/jobs/{job['id']}/", headers=headers)
        if check_response.status_code == 200:
            updated_job = check_response.json()
            print(f"  Updated status: {updated_job['status']} - {updated_job['stage']}")
            print(f"  Progress: {updated_job['progress']}%")
    else:
        print(f"✗ JSON job failed: {response.status_code}")

    # Test 2: CSV processing with sleep
    print("\n=== Testing CSV Processing (should take ~0.2 seconds for 2 rows) ===")
    csv_content = """name,email,age
CSV User 1,user1@example.com,25
CSV User 2,user2@example.com,30"""
    
    files = {
        'csv_file': ('test.csv', csv_content, 'text/csv')
    }
    data = {
        'label': 'CSV Sleep Test',
        'input_mode': 'csv'
    }
    
    start_time = time.time()
    response = requests.post(f"{BASE_URL}/jobs/", data=data, files=files, headers=headers)
    elapsed_time = time.time() - start_time
    
    if response.status_code == 201:
        job = response.json()
        print(f"✓ CSV job created in {elapsed_time:.2f}s (expected ~0.2s)")
        print(f"  Job ID: {job['id']}")
        print(f"  Initial status: {job['status']} - {job['stage']}")
        
        # Wait a bit and check status
        time.sleep(1)
        check_response = requests.get(f"{BASE_URL}/jobs/{job['id']}/", headers=headers)
        if check_response.status_code == 200:
            updated_job = check_response.json()
            print(f"  Updated status: {updated_job['status']} - {updated_job['stage']}")
            print(f"  Progress: {updated_job['progress']}%")
    else:
        print(f"✗ CSV job failed: {response.status_code}")

    print("\n=== Test completed ===")
    print("Check the Celery worker logs to see the progression:")
    print("  1. VALIDATING -> PROCESSING -> FINALIZING -> DONE")
    print("  2. Sleep times should be applied correctly")

if __name__ == "__main__":
    test_job_processing()
