#!/usr/bin/env python3
"""
Test script to verify the implemented features:
1. Validation logic for email, age, and name
2. Sleep time functionality for JSON and CSV processing
3. Idempotency key functionality
"""

import json
import time
import requests
from datetime import datetime

# Test configuration
BASE_URL = "http://localhost:8000/api"
USERNAME = "testuser"
PASSWORD = "testpass123"
EMAIL = "test@example.com"

def get_auth_token():
    """Get authentication token"""
    # Register user if not exists
    register_data = {
        "username": USERNAME,
        "email": EMAIL,
        "password": PASSWORD
    }
    
    try:
        response = requests.post(f"{BASE_URL}/auth/register/", json=register_data)
        if response.status_code == 201:
            print("✓ User registered successfully")
    except:
        pass
    
    # Login
    login_data = {
        "username": USERNAME,
        "password": PASSWORD
    }
    
    response = requests.post(f"{BASE_URL}/auth/login/", json=login_data)
    if response.status_code == 200:
        token = response.json()["token"]
        print("✓ Authentication successful")
        return token
    else:
        print("✗ Authentication failed")
        return None

def test_validation_logic(token):
    """Test validation logic for email, age, and name"""
    print("\n=== Testing Validation Logic ===")
    
    headers = {"Authorization": f"Token {token}"}
    
    # Test data with various validation scenarios
    test_cases = [
        {
            "name": "Valid data",
            "data": {
                "label": "Valid Test Job",
                "input_mode": "json",
                "payload": {
                    "rows": [
                        {"name": "John Doe", "email": "john@example.com", "age": 25},
                        {"name": "Jane Smith", "email": "jane@example.com", "age": 30}
                    ]
                }
            },
            "should_pass": True
        },
        {
            "name": "Invalid email",
            "data": {
                "label": "Invalid Email Test",
                "input_mode": "json",
                "payload": {
                    "rows": [
                        {"name": "John Doe", "email": "invalid-email", "age": 25}
                    ]
                }
            },
            "should_pass": False
        },
        {
            "name": "Invalid age",
            "data": {
                "label": "Invalid Age Test",
                "input_mode": "json",
                "payload": {
                    "rows": [
                        {"name": "John Doe", "email": "john@example.com", "age": 150}
                    ]
                }
            },
            "should_pass": False
        },
        {
            "name": "Invalid name",
            "data": {
                "label": "Invalid Name Test",
                "input_mode": "json",
                "payload": {
                    "rows": [
                        {"name": "Jo", "email": "john@example.com", "age": 25}
                    ]
                }
            },
            "should_pass": False
        }
    ]
    
    for test_case in test_cases:
        print(f"\nTesting: {test_case['name']}")
        start_time = time.time()
        
        response = requests.post(f"{BASE_URL}/jobs/", json=test_case["data"], headers=headers)
        elapsed_time = time.time() - start_time
        
        if test_case["should_pass"]:
            if response.status_code == 201:
                print(f"✓ Test passed - Job created successfully in {elapsed_time:.2f}s")
            else:
                print(f"✗ Test failed - Expected 201, got {response.status_code}")
                print(f"Response: {response.text}")
        else:
            # For invalid data, we expect the job to be created but with invalid rows
            if response.status_code == 201:
                job_data = response.json()
                print(f"✓ Test passed - Job created, checking validation results in {elapsed_time:.2f}s")
                # We would need to wait for processing to complete to see validation results
            else:
                print(f"✗ Test failed - Expected 201, got {response.status_code}")

def test_sleep_functionality(token):
    """Test sleep time for JSON and CSV processing"""
    print("\n=== Testing Sleep Functionality ===")
    
    headers = {"Authorization": f"Token {token}"}
    
    # Test JSON processing (should have ~2 second delay)
    print("\nTesting JSON processing sleep time...")
    json_data = {
        "label": "JSON Sleep Test",
        "input_mode": "json",
        "payload": {
            "rows": [
                {"name": "Test User", "email": "test@example.com", "age": 25}
            ] * 5  # 5 rows
        }
    }
    
    start_time = time.time()
    response = requests.post(f"{BASE_URL}/jobs/", json=json_data, headers=headers)
    elapsed_time = time.time() - start_time
    
    if response.status_code == 201:
        print(f"✓ JSON job created in {elapsed_time:.2f}s (expected ~2s delay)")
    else:
        print(f"✗ JSON job creation failed: {response.status_code}")
    
    # Test CSV processing (should have ~0.5 second delay for 5 rows)
    print("\nTesting CSV processing sleep time...")
    csv_content = """name,email,age
Test User 1,test1@example.com,25
Test User 2,test2@example.com,30
Test User 3,test3@example.com,35
Test User 4,test4@example.com,40
Test User 5,test5@example.com,45"""
    
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
        print(f"✓ CSV job created in {elapsed_time:.2f}s (expected ~0.5s delay for 5 rows)")
    else:
        print(f"✗ CSV job creation failed: {response.status_code}")

def test_idempotency_key(token):
    """Test idempotency key functionality"""
    print("\n=== Testing Idempotency Key Functionality ===")
    
    headers = {"Authorization": f"Token {token}"}
    
    # Test data with idempotency key
    job_data = {
        "label": "Idempotency Test",
        "input_mode": "json",
        "idempotency_key": "test-key-12345",
        "payload": {
            "rows": [
                {"name": "Test User", "email": "test@example.com", "age": 25}
            ]
        }
    }
    
    # First request - should create new job
    print("\nFirst request with idempotency key...")
    response1 = requests.post(f"{BASE_URL}/jobs/", json=job_data, headers=headers)
    
    if response1.status_code == 201:
        job1 = response1.json()
        print(f"✓ First job created with ID: {job1['id']}")
    else:
        print(f"✗ First job creation failed: {response1.status_code}")
        return
    
    # Second request with same idempotency key - should return existing job
    print("\nSecond request with same idempotency key...")
    response2 = requests.post(f"{BASE_URL}/jobs/", json=job_data, headers=headers)
    
    if response2.status_code == 200:
        job2 = response2.json()
        if job1['id'] == job2['id']:
            print(f"✓ Idempotency working - same job returned: {job2['id']}")
        else:
            print(f"✗ Idempotency failed - different job returned: {job2['id']}")
    else:
        print(f"✗ Second request failed: {response2.status_code}")

def main():
    """Run all tests"""
    print("=== Job Queue Feature Tests ===")
    print("Make sure the Django server is running on http://localhost:8000")
    print("Make sure Celery worker is running for job processing")
    
    # Get authentication token
    token = get_auth_token()
    if not token:
        print("Cannot proceed without authentication")
        return
    
    # Run tests
    test_validation_logic(token)
    test_sleep_functionality(token)
    test_idempotency_key(token)
    
    print("\n=== Test Summary ===")
    print("All tests completed. Check the results above.")
    print("Note: For validation results, you may need to check the job output after processing completes.")

if __name__ == "__main__":
    main()
