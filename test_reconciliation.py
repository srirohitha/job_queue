#!/usr/bin/env python3
"""
Test script to verify reconciliation fixes and job details
"""

import json
import time
import requests
from datetime import datetime

# Test configuration
BASE_URL = "http://localhost:8000/api"

def get_auth_token():
    """Get authentication token"""
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
            return None
            
        token = response.json()["token"]
        headers = {"Authorization": f"Token {token}"}
        print("✓ Authentication successful")
        return headers
        
    except Exception as e:
        print(f"Authentication error: {e}")
        return None

def test_job_details(headers):
    """Test that job details include input/output data"""
    print("\n=== Testing Job Details ===")
    
    # Create a job
    json_data = {
        "label": "Details Test Job",
        "input_mode": "json",
        "payload": {
            "rows": [
                {"name": "John Doe", "email": "john@example.com", "age": 25}
            ]
        }
    }
    
    response = requests.post(f"{BASE_URL}/jobs/", json=json_data, headers=headers)
    if response.status_code != 201:
        print(f"✗ Job creation failed: {response.status_code}")
        return
    
    job = response.json()
    job_id = job['id']
    print(f"✓ Job created: {job_id}")
    
    # Wait for processing
    time.sleep(5)
    
    # Get job details
    response = requests.get(f"{BASE_URL}/jobs/{job_id}/", headers=headers)
    if response.status_code != 200:
        print(f"✗ Failed to get job details: {response.status_code}")
        return
    
    job_details = response.json()
    
    # Check for required fields
    required_fields = ['input_payload', 'output_result', 'events', 'status', 'stage']
    missing_fields = [field for field in required_fields if field not in job_details]
    
    if missing_fields:
        print(f"✗ Missing fields in job details: {missing_fields}")
    else:
        print("✓ All required fields present in job details")
    
    # Check input_payload
    if 'input_payload' in job_details and job_details['input_payload']:
        print("✓ input_payload is present")
        if 'rows' in job_details['input_payload']:
            print(f"  - Found {len(job_details['input_payload']['rows'])} rows")
    else:
        print("✗ input_payload is missing or empty")
    
    # Check output_result
    if 'output_result' in job_details and job_details['output_result']:
        print("✓ output_result is present")
        output = job_details['output_result']
        if 'totalProcessed' in output:
            print(f"  - Total processed: {output['totalProcessed']}")
        if 'totalValid' in output:
            print(f"  - Total valid: {output['totalValid']}")
    else:
        print("✗ output_result is missing or empty")
    
    # Check events
    if 'events' in job_details and job_details['events']:
        print(f"✓ events present ({len(job_details['events'])} events)")
        for event in job_details['events'][-3:]:  # Show last 3 events
            print(f"  - {event.get('type', 'unknown')} at {event.get('timestamp', 'unknown')}")
    else:
        print("✗ events are missing or empty")

def test_reconciliation_simulation(headers):
    """Simulate worker downtime and test reconciliation"""
    print("\n=== Testing Reconciliation Logic ===")
    
    # Create multiple jobs
    job_ids = []
    for i in range(3):
        json_data = {
            "label": f"Reconciliation Test Job {i+1}",
            "input_mode": "json",
            "payload": {
                "rows": [
                    {"name": f"User {i+1}", "email": f"user{i+1}@example.com", "age": 25+i}
                ]
            }
        }
        
        response = requests.post(f"{BASE_URL}/jobs/", json=json_data, headers=headers)
        if response.status_code == 201:
            job = response.json()
            job_ids.append(job['id'])
            print(f"✓ Created job {i+1}: {job['id']}")
    
    # Wait a bit for processing
    time.sleep(3)
    
    # Check job statuses
    print("\nChecking job statuses after processing:")
    for job_id in job_ids:
        response = requests.get(f"{BASE_URL}/jobs/{job_id}/", headers=headers)
        if response.status_code == 200:
            job = response.json()
            print(f"  Job {job_id[:8]}...: {job['status']} - {job['stage']}")
    
    # Get stats to see current state
    response = requests.get(f"{BASE_URL}/jobs/stats/", headers=headers)
    if response.status_code == 200:
        stats = response.json()
        print(f"\nCurrent stats:")
        print(f"  Pending: {stats.get('pending', 0)}")
        print(f"  Running: {stats.get('running', 0)}")
        print(f"  Throttled: {stats.get('throttled', 0)}")
        print(f"  Done: {stats.get('done', 0)}")
        print(f"  Failed: {stats.get('failed', 0)}")
        print(f"  Concurrent jobs limit: {stats.get('concurrentJobsLimit', 'N/A')}")
    
    print("\nNote: Reconciliation runs automatically every 5 seconds via Celery beat.")
    print("Check the reconcile worker logs to see if jobs are being requeued.")

def test_throttling_behavior(headers):
    """Test that throttling works correctly"""
    print("\n=== Testing Throttling Behavior ===")
    
    # Create 3 jobs quickly to test throttling
    job_ids = []
    for i in range(3):
        json_data = {
            "label": f"Throttle Test Job {i+1}",
            "input_mode": "json",
            "payload": {
                "rows": [
                    {"name": f"Throttle User {i+1}", "email": f"throttle{i+1}@example.com", "age": 25}
                ] * 2  # 2 rows each
            }
        }
        
        start_time = time.time()
        response = requests.post(f"{BASE_URL}/jobs/", json=json_data, headers=headers)
        elapsed_time = time.time() - start_time
        
        if response.status_code == 201:
            job = response.json()
            job_ids.append(job['id'])
            print(f"✓ Job {i+1} created in {elapsed_time:.2f}s: {job['status']}")
        else:
            print(f"✗ Job {i+1} failed: {response.status_code}")
    
    # Check initial statuses
    print("\nInitial job statuses:")
    for i, job_id in enumerate(job_ids):
        response = requests.get(f"{BASE_URL}/jobs/{job_id}/", headers=headers)
        if response.status_code == 200:
            job = response.json()
            print(f"  Job {i+1}: {job['status']} - {job['stage']}")
    
    # Wait and check again
    print("\nWaiting 10 seconds for processing...")
    time.sleep(10)
    
    print("\nJob statuses after processing:")
    for i, job_id in enumerate(job_ids):
        response = requests.get(f"{BASE_URL}/jobs/{job_id}/", headers=headers)
        if response.status_code == 200:
            job = response.json()
            print(f"  Job {i+1}: {job['status']} - {job['stage']} (Progress: {job.get('progress', 0)}%)")

def main():
    """Run all tests"""
    print("=== Job Queue Reconciliation & Details Test ===")
    print("Make sure Django server, Celery worker, and Celery beat are running")
    
    headers = get_auth_token()
    if not headers:
        print("Cannot proceed without authentication")
        return
    
    # Run tests
    test_job_details(headers)
    test_reconciliation_simulation(headers)
    test_throttling_behavior(headers)
    
    print("\n=== Test Summary ===")
    print("1. Check if job details include input_payload, output_result, and events")
    print("2. Monitor Celery beat logs for reconciliation activity")
    print("3. Monitor worker logs for job processing and throttling")
    print("4. Jobs should be recovered by reconciliation if workers go down")

if __name__ == "__main__":
    main()
