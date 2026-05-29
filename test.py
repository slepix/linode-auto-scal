import os
import time
import uuid
import requests

# --- Configuration ---
AUTOSCALER_URL = os.getenv("AUTOSCALER_URL", "https://autoscaler.dev.cloud-instances.eu/api")
AUTOSCALER_KEY = os.getenv("AUTOSCALER_KEY", "")
GROUP_NAME = "groupname"

BASE_URL = f"{AUTOSCALER_URL}/v1/groups/{GROUP_NAME}"
HEADERS = {
    "Authorization": f"Bearer {AUTOSCALER_KEY}",
    "Content-Type": "application/json"
}

# --- Monitoring & Helper Functions ---

def log_response(step_name, response):
    """Cleanly log the outcome of each test step."""
    print(f"[{step_name}] Status Code: {response.status_code}")
    try:
        print(f"[{step_name}] Response Body: {response.json()}")
    except ValueError:
        print(f"[{step_name}] Response Body: {response.text}")
    print("-" * 60)

def wait_for_active_requests():
    """Polls the /status API until any active, in-flight scaling events complete."""
    print("🔍 Checking for active, in-flight scaling requests...")
    while True:
        response = requests.get(f"{BASE_URL}/status", headers=HEADERS)
        if response.status_code != 200:
            print(f"⚠️ Could not fetch status tracking ({response.status_code}).")
            break

        data = response.json()
        active_request = data.get("active_scale_request")

        if active_request is None:
            print("✅ No active scaling requests in-flight. Moving forward.")
            break

        print(f"⏳ Event {active_request.get('id') if isinstance(active_request, dict) else active_request} is still processing. Waiting 10s...")
        time.sleep(10)

def wait_for_cooldown(action_type="up"):
    """Polls the /cooldown API until the group is completely out of its cooldown window."""
    # First, make sure the task isn't still executing
    wait_for_active_requests()

    print(f"🔍 Checking scale-{action_type} cooldown status...")
    while True:
        response = requests.get(f"{BASE_URL}/cooldown", headers=HEADERS)
        if response.status_code != 200:
            print(f"⚠️ Could not fetch cooldown status ({response.status_code}). Proceeding anyway.")
            break

        data = response.json()
        in_cooldown = data.get(f"scale_{action_type}_in_cooldown", False)
        remaining = data.get(f"scale_{action_type}_remaining_seconds", 0)

        if not in_cooldown or remaining <= 0:
            print(f"✅ Cooldown for scale-{action_type} is clear! Proceeding.")
            break

        print(f"⏳ Active cooldown: {remaining}s remaining. Sleeping for {min(remaining + 1, 15)}s...")
        time.sleep(min(remaining + 1, 15))

def check_health_and_metrics():
    """Hits ancillary monitoring endpoints to verify they don't 500 under load."""
    print("\n📊 Collecting Supplementary Infrastructure Metrics...")

    drift = requests.get(f"{BASE_URL}/drift", headers=HEADERS)
    print(f"   -> Drift Status: {drift.status_code}")

    nb = requests.get(f"{BASE_URL}/nodebalancer", headers=HEADERS)
    print(f"   -> NodeBalancer Status: {nb.status_code}")

# --- Core Test Scenarios ---

def test_baseline_status():
    print("\n🚀 Scenario 1: Fetching Baseline Status & Capacity")

    status_resp = requests.get(f"{BASE_URL}/status", headers=HEADERS)
    log_response("Baseline Status", status_resp)

    capacity_resp = requests.get(f"{BASE_URL}/capacity", headers=HEADERS)
    log_response("Baseline Capacity", capacity_resp)

def test_scale_up():
    print("\n🚀 Scenario 2: Execution - Scale Up by Amount")
    wait_for_cooldown("up")

    url = f"{BASE_URL}/scale-up"
    payload = {"amount": 1, "reason": "Stability test - scaling up"}

    response = requests.post(url, headers=HEADERS, json=payload)
    log_response("Scale Up Execution", response)

    if response.status_code in [200, 201, 202]:
        wait_for_cooldown("up")

def test_idempotency():
    print("\n🚀 Scenario 3: Idempotent Request Safeguards")
    # Make sure prior execution cooldown is clear before running the execution race test
    wait_for_cooldown("up")

    url = f"{BASE_URL}/scale-up"
    idempotency_key = f"stability-{uuid.uuid4()}"
    payload = {"amount": 1, "reason": "Stability test - testing idempotency"}

    idempotent_headers = HEADERS.copy()
    idempotent_headers["Idempotency-Key"] = idempotency_key

    print("-> Dispatching initial request...")
    resp1 = requests.post(url, headers=idempotent_headers, json=payload)
    log_response("Idempotency Flight 1", resp1)

    print("-> Dispatching duplicate request instantly...")
    resp2 = requests.post(url, headers=idempotent_headers, json=payload)
    log_response("Idempotency Flight 2", resp2)

    wait_for_cooldown("up")

def test_scale_down_specific_instance():
    print("\n🚀 Scenario 4: Targeted Scale Down (Using Live Instance Data)")
    wait_for_cooldown("down")

    print("-> Discovering active instances...")
    inst_resp = requests.get(f"{BASE_URL}/instances", headers=HEADERS)

    if inst_resp.status_code != 200 or not inst_resp.json():
        print("⚠️ No active instances returned or endpoint failed. Skipping dynamic targeted removal.")
        return

    instances = inst_resp.json()
    try:
        # FIX: Swapped out internal string .get("id") for the external provider integer .get("linode_id")
        target_id = instances[0].get("linode_id")
    except (IndexError, AttributeError):
        target_id = None

    if not target_id:
        print("⚠️ Could not parse a valid numeric Linode ID from list. Skipping.")
        return

    print(f"-> Targeting active Linode ID: {target_id} for removal")
    url = f"{BASE_URL}/scale-down"
    payload = {
        "amount": 1,
        "instance_ids": [int(target_id)],  # Forced casting ensures it passes validation
        "reason": "Stability test - target instance teardown"
    }

    response = requests.post(url, headers=HEADERS, json=payload)
    log_response("Targeted Scale Down", response)

    if response.status_code in [200, 201, 202]:
        wait_for_cooldown("down")

def test_audit_logs():
    print("\n🚀 Scenario 5: Fetching Event Audit Trails")
    url = f"{BASE_URL}/events"
    params = {"limit": 10, "offset": 0}

    response = requests.get(url, headers=HEADERS, params=params)
    log_response("Scale Events Log", response)

    print("\n🚀 Scenario 6: Fetching Historic Instances (Including Deleted)")
    url = f"{BASE_URL}/instances"
    response = requests.get(url, headers=HEADERS, params={"include_deleted": "true"})
    log_response("All Instances History", response)

# --- Execution ---

if __name__ == "__main__":
    print("============================================================")
    print("     Starting Advanced Autoscaler Stability Test Engine     ")
    print(f"     Targeting: {BASE_URL}")
    print("============================================================")

    start_time = time.time()
    try:
        test_baseline_status()
        test_scale_up()
        test_idempotency()
        test_scale_down_specific_instance()
        check_health_and_metrics()
        test_audit_logs()

        duration = round(time.time() - start_time, 2)
        print(f"\n✅ Stability Suite Completed Successfully in {duration} seconds!")

    except Exception as e:
        print(f"\n❌ Test pipeline interrupted due to unhandled error: {e}")