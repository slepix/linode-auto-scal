import os
import time
import uuid
import json
import csv
from datetime import datetime
import requests

# --- Configuration via Environment Variables ---
AUTOSCALER_URL = os.getenv("AUTOSCALER_URL", "https://autoscaler.dev.cloud-instances.eu/api")
AUTOSCALER_KEY = os.getenv("AUTOSCALER_KEY", "your_api_key_here")
GROUP_NAME = os.getenv("GROUP_NAME", "kaltura")

# Stability Test Loop Duration Configuration (Default: 15 minutes)
TEST_DURATION_MINUTES = float(os.getenv("TEST_DURATION_MINUTES", "15"))
REPORT_FILENAME = os.getenv("REPORT_FILENAME", f"stability_report_{int(time.time())}.json")

BASE_URL = f"{AUTOSCALER_URL}/v1/groups/{GROUP_NAME}"
HEADERS = {
    "Authorization": f"Bearer {AUTOSCALER_KEY}",
    "Content-Type": "application/json"
}

# Global test metrics repository
test_results = {
    "metadata": {
        "target_url": BASE_URL,
        "group_name": GROUP_NAME,
        "started_at": "",
        "ended_at": "",
        "configured_duration_minutes": TEST_DURATION_MINUTES,
        "total_iterations_completed": 0,
        "summary": {"total_requests": 0, "passed": 0, "failed": 0}
    },
    "history": []
}

def log_and_record(scenario_name, action, response=None, status="PASS", error_msg=None, execution_time=0.0):
    """Logs results directly to standard output and archives metrics to the telemetry database."""
    timestamp = datetime.utcnow().isoformat() + "Z"
    status_code = response.status_code if response is not None else None
    
    # Try to extract message details safely
    resp_body = None
    if response is not None:
        try:
            resp_body = response.json()
        except ValueError:
            resp_body = response.text

    # Print to console
    print(f"[{scenario_name} - {action}] Status: {status} | Code: {status_code} | Latency: {execution_time:.2f}s")
    if error_msg:
        print(f"   ⚠️ Details: {error_msg}")
    
    # Track metrics
    test_results["metadata"]["summary"]["total_requests"] += 1
    if status == "PASS":
        test_results["metadata"]["summary"]["passed"] += 1
    else:
        test_results["metadata"]["summary"]["failed"] += 1

    # Record history log entry
    test_results["history"].append({
        "timestamp": timestamp,
        "scenario": scenario_name,
        "action": action,
        "status": status,
        "status_code": status_code,
        "latency_seconds": round(execution_time, 3),
        "response_payload": resp_body,
        "error": error_msg
    })

def export_results():
    """Writes final structured records to disk in JSON and summary CSV format."""
    test_results["metadata"]["ended_at"] = datetime.utcnow().isoformat() + "Z"
    
    # Save detailed JSON log
    with open(REPORT_FILENAME, "w") as f:
        json.dump(test_results, f, indent=2)
    print(f"\n📝 Detailed JSON stability telemetry report written to: {REPORT_FILENAME}")
    
    # Save summary flat CSV file for quick reporting/plotting dashboards
    csv_filename = REPORT_FILENAME.replace(".json", ".csv")
    try:
        with open(csv_filename, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["Timestamp", "Scenario", "Action", "Status", "StatusCode", "LatencySeconds", "Error"])
            for log in test_results["history"]:
                writer.writerow([
                    log["timestamp"], log["scenario"], log["action"], 
                    log["status"], log["status_code"], log["latency_seconds"], log["error"]
                ])
        print(f"📊 Summary CSV dashboard metrics file written to: {csv_filename}")
    except Exception as e:
        print(f"⚠️ Failed to write summary CSV: {e}")

def wait_for_active_requests(scenario_name):
    """Polls the /status API until any active, in-flight scaling events complete."""
    print("🔍 Checking for active, in-flight scaling requests...")
    while True:
        start_poll = time.time()
        try:
            response = requests.get(f"{BASE_URL}/status", headers=HEADERS)
            latency = time.time() - start_poll
            
            if response.status_code != 200:
                log_and_record(scenario_name, "Poll Status Error", response, "FAIL", "Failed to retrieve group status lifecycle", latency)
                break
                
            data = response.json()
            active_request = data.get("active_scale_request")
            
            if active_request is None:
                print("✅ No active scaling requests in-flight. Moving forward.")
                break
                
            req_id = active_request.get('id') if isinstance(active_request, dict) else active_request
            print(f"⏳ Event {req_id} is still processing. Waiting 10s...")
            time.sleep(10)
        except Exception as e:
            print(f"⚠️ Network error while tracking active tasks: {e}")
            time.sleep(5)

def wait_for_cooldown(scenario_name, action_type="up"):
    """Polls the /cooldown API until the group is completely out of its cooldown window."""
    # First ensure nothing is mutating actively
    wait_for_active_requests(scenario_name)
    
    print(f"🔍 Checking scale-{action_type} cooldown status...")
    while True:
        start_poll = time.time()
        try:
            response = requests.get(f"{BASE_URL}/cooldown", headers=HEADERS)
            latency = time.time() - start_poll
            
            if response.status_code != 200:
                log_and_record(scenario_name, f"Poll Cooldown Error ({action_type})", response, "FAIL", "Failed to reach cooldown metrics endpoint", latency)
                break
                
            data = response.json()
            in_cooldown = data.get(f"scale_{action_type}_in_cooldown", False)
            remaining = data.get(f"scale_{action_type}_remaining_seconds", 0)
            
            if not in_cooldown or remaining <= 0:
                print(f"✅ Cooldown for scale-{action_type} is clear! Proceeding.")
                break
                
            print(f"⏳ Active cooldown: {remaining}s remaining. Sleeping for {min(remaining + 1, 15)}s...")
            time.sleep(min(remaining + 1, 15))
        except Exception as e:
            print(f"⚠️ Network error while polling cooldown tables: {e}")
            time.sleep(5)

# --- Core Scenarios ---

def test_baseline_status():
    scenario = "Baseline Status Checks"
    
    # 1. Status Check
    t0 = time.time()
    try:
        resp = requests.get(f"{BASE_URL}/status", headers=HEADERS)
        latency = time.time() - t0
        status = "PASS" if resp.status_code == 200 else "FAIL"
        log_and_record(scenario, "Get Group Status", resp, status, None if status == "PASS" else "Non-200 Status Code", latency)
    except Exception as e:
        log_and_record(scenario, "Get Group Status", None, "FAIL", str(e), time.time() - t0)

    # 2. Capacity Check
    t0 = time.time()
    try:
        resp = requests.get(f"{BASE_URL}/capacity", headers=HEADERS)
        latency = time.time() - t0
        status = "PASS" if resp.status_code == 200 else "FAIL"
        log_and_record(scenario, "Get Capacity Matrix", resp, status, None if status == "PASS" else "Non-200 Capacity Code", latency)
    except Exception as e:
        log_and_record(scenario, "Get Capacity Matrix", None, "FAIL", str(e), time.time() - t0)

def test_scale_up():
    scenario = "Scale Up Verification"
    wait_for_cooldown(scenario, "up")
    
    t0 = time.time()
    payload = {"amount": 1, "reason": "Stability soaking loop testing - scale up"}
    try:
        resp = requests.post(f"{BASE_URL}/scale-up", headers=HEADERS, json=payload)
        latency = time.time() - t0
        status = "PASS" if resp.status_code in [200, 201, 202] else "FAIL"
        log_and_record(scenario, "Trigger Scale Up", resp, status, None if status == "PASS" else f"Unexpected response code: {resp.status_code}", latency)
    except Exception as e:
        log_and_record(scenario, "Trigger Scale Up", None, "FAIL", str(e), time.time() - t0)

def test_idempotency():
    scenario = "Idempotency Isolation Guardrails"
    wait_for_cooldown(scenario, "up")
    
    idempotency_key = f"stability-soak-{uuid.uuid4()}"
    payload = {"amount": 1, "reason": "Stability test - testing concurrent idempotency integrity"}
    id_headers = HEADERS.copy()
    id_headers["Idempotency-Key"] = idempotency_key
    
    # Request 1
    t0 = time.time()
    try:
        resp1 = requests.post(f"{BASE_URL}/scale-up", headers=id_headers, json=payload)
        latency1 = time.time() - t0
        status1 = "PASS" if resp1.status_code in [200, 201, 202] else "FAIL"
        log_and_record(scenario, "Idempotent Request 1", resp1, status1, None if status1 == "PASS" else "Failed first leg flight execution", latency1)
    except Exception as e:
        log_and_record(scenario, "Idempotent Request 1", None, "FAIL", str(e), time.time() - t0)

    # Request 2 (Instant consecutive duplication dispatch)
    t0 = time.time()
    try:
        resp2 = requests.post(f"{BASE_URL}/scale-up", headers=id_headers, json=payload)
        latency2 = time.time() - t0
        # If Request 1 is processing, an API may return either a duplicate 202, a cached response, 
        # or a 409/422 if it blocks it. Based on your system layout, a 409 is a valid block response.
        status2 = "PASS" if resp2.status_code in [200, 201, 202, 409] else "FAIL"
        log_and_record(scenario, "Idempotent Duplicate Request 2", resp2, status2, None if status2 == "PASS" else f"Unexpected status: {resp2.status_code}", latency2)
    except Exception as e:
        log_and_record(scenario, "Idempotent Duplicate Request 2", None, "FAIL", str(e), time.time() - t0)

def test_scale_down_specific_instance():
    scenario = "Surgical Instance Deletion"
    wait_for_cooldown(scenario, "down")
    
    print("-> Pulling cluster layout mappings to target a node...")
    t0 = time.time()
    try:
        inst_resp = requests.get(f"{BASE_URL}/instances", headers=HEADERS)
        if inst_resp.status_code != 200 or not inst_resp.json():
            log_and_record(scenario, "Discover Active Nodes", inst_resp, "FAIL", "Failed to read layout maps or empty cluster", time.time() - t0)
            return
            
        instances = inst_resp.json()
        target_id = instances[0].get("linode_id")
        
        if not target_id:
            log_and_record(scenario, "Parse Targets", inst_resp, "FAIL", "Could not locate a numeric Provider/Linode ID inside structural map", time.time() - t0)
            return
            
        print(f"-> Surgical strike target discovered: Linode Unit ID {target_id}")
        payload = {
            "amount": 1,
            "instance_ids": [int(target_id)],
            "reason": "Stability soaking runner - targeted surgical removal test"
        }
        
        t_down = time.time()
        resp = requests.post(f"{BASE_URL}/scale-down", headers=HEADERS, json=payload)
        latency = time.time() - t_down
        status = "PASS" if resp.status_code in [200, 201, 202] else "FAIL"
        log_and_record(scenario, "Execute Targeted Scale Down", resp, status, None if status == "PASS" else f"Failed teardown target. Code: {resp.status_code}", latency)
        
    except Exception as e:
        log_and_record(scenario, "Targeted Scale Down Exception Pipeline", None, "FAIL", str(e), time.time() - t0)

def check_health_and_metrics():
    scenario = "Telemetry System Stability"
    
    # Drift
    t0 = time.time()
    try:
        resp = requests.get(f"{BASE_URL}/drift", headers=HEADERS)
        log_and_record(scenario, "Collect Configuration Drift Reports", resp, "PASS" if resp.status_code == 200 else "FAIL", None, time.time() - t0)
    except Exception as e:
        log_and_record(scenario, "Collect Configuration Drift Reports", None, "FAIL", str(e), time.time() - t0)
        
    # NodeBalancer
    t0 = time.time()
    try:
        resp = requests.get(f"{BASE_URL}/nodebalancer", headers=HEADERS)
        log_and_record(scenario, "Query Load Balancer Sync Mappings", resp, "PASS" if resp.status_code == 200 else "FAIL", None, time.time() - t0)
    except Exception as e:
        log_and_record(scenario, "Query Load Balancer Sync Mappings", None, "FAIL", str(e), time.time() - t0)

    # Event Logs
    t0 = time.time()
    try:
        resp = requests.get(f"{BASE_URL}/events?limit=5", headers=HEADERS)
        log_and_record(scenario, "Fetch Audit Trace Logs", resp, "PASS" if resp.status_code == 200 else "FAIL", None, time.time() - t0)
    except Exception as e:
        log_and_record(scenario, "Fetch Audit Trace Logs", None, "FAIL", str(e), time.time() - t0)

# --- Main Driver Core ---

if __name__ == "__main__":
    print("============================================================")
    print("     Starting Advanced Autoscaler Stability & Soak Suite    ")
    print(f"     Target Group: {GROUP_NAME}")
    print(f"     Target Run Duration: {TEST_DURATION_MINUTES} Minutes")
    print("============================================================")
    
    start_time = time.time()
    test_results["metadata"]["started_at"] = datetime.utcnow().isoformat() + "Z"
    duration_seconds = TEST_DURATION_MINUTES * 60
    iteration = 1
    
    try:
        while True:
            elapsed_seconds = time.time() - start_time
            if elapsed_seconds >= duration_seconds:
                print(f"\n⏱️ Configured run duration reached ({round(elapsed_seconds/60, 2)} / {TEST_DURATION_MINUTES} minutes).")
                break
                
            rem_min = round((duration_seconds - elapsed_seconds) / 60, 1)
            print(f"\n🔄 Starting Soak Iteration Loop #{iteration} [{rem_min} minutes remaining on test window]")
            print("-" * 75)
            
            test_baseline_status()
            test_scale_up()
            test_idempotency()
            test_scale_down_specific_instance()
            check_health_and_metrics()
            
            test_results["metadata"]["total_iterations_completed"] = iteration
            iteration += 1
            time.sleep(2)  # Cool off breather space between comprehensive testing rounds
            
        print("\n✅ Completed stability soaking lifecycle window safely.")
        
    except KeyboardInterrupt:
        print("\n🛑 Test pipeline early-termination flag triggered by Operator (Ctrl+C).")
    except Exception as fatal_error:
        print(f"\n💥 Fatal stability runner exception occurred: {fatal_error}")
    finally:
        print("\n============================================================")
        print("     Test Complete: Initiating Metrics Serialization       ")
        print("============================================================")
        export_results()
        
        summary = test_results["metadata"]["summary"]
        print(f"   Total API Requests Dispatched: {summary['total_requests']}")
        print(f"   Successful Checks (PASS):      {summary['passed']}")
        print(f"   Failed Checks/Violations (FAIL): {summary['failed']}")
        print("============================================================")