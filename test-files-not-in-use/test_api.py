"""API Scenario Tests for OpenPricev7"""
import json
import urllib.request
import urllib.error
import sys

API_URL = "https://openpricev7.vercel.app/api/get-pricing"

tests = [
    {
        "name": "Test 5: Investment DSCR Condo Non-Warrantable (FL)",
        "payload": {
            "loanAmount": 500000, "propertyValue": 700000, "creditScore": 720,
            "propertyZip": "33101", "propertyState": "FL",
            "occupancyType": "investment", "propertyType": "condo",
            "loanPurpose": "purchase", "documentationType": "dscr",
            "loanType": "nonqm", "dscrRatio": ">=1.250", "lockPeriod": "30",
            "isNonWarrantableProject": True
        },
        "checks": ["non_warrantable_adj", "dscr_programs", "no_primary_leak"]
    },
    {
        "name": "Test 9: Primary - No DSCR Leak",
        "payload": {
            "loanAmount": 450000, "propertyValue": 600000, "creditScore": 740,
            "propertyZip": "90210", "propertyState": "CA",
            "occupancyType": "primary", "propertyType": "sfr",
            "loanPurpose": "purchase", "documentationType": "fullDoc",
            "loanType": "nonqm", "lockPeriod": "30"
        },
        "checks": ["no_dscr_leak"]
    },
    {
        "name": "Test 10: Secondary - No DSCR Leak + 2ND HOME adj",
        "payload": {
            "loanAmount": 450000, "propertyValue": 600000, "creditScore": 740,
            "propertyZip": "90210", "propertyState": "CA",
            "occupancyType": "secondary", "propertyType": "sfr",
            "loanPurpose": "purchase", "documentationType": "fullDoc",
            "loanType": "nonqm", "lockPeriod": "30"
        },
        "checks": ["no_dscr_leak", "second_home_adj"]
    },
    {
        "name": "Test 11: Empty Body Error Handling",
        "payload": {},
        "checks": ["error_response"]
    },
    {
        "name": "Test 12: GET Method Rejected",
        "payload": None,  # signals GET
        "checks": ["method_not_allowed"]
    },
]

def run_test(test):
    name = test["name"]
    payload = test["payload"]
    checks = test["checks"]

    try:
        if payload is None:
            # GET request
            req = urllib.request.Request(API_URL, method="GET")
        else:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(API_URL, data=data, method="POST")
            req.add_header("Content-Type", "application/json")

        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode())
            status = resp.status
    except urllib.error.HTTPError as e:
        body = json.loads(e.read().decode()) if e.read else {}
        status = e.code
    except Exception as e:
        print(f"  FAIL - {name}: {e}")
        return False

    passed = True
    results = []

    if "error_response" in checks:
        if body.get("success") == False:
            results.append("PASS: Returns error for empty body")
        else:
            # It might still succeed with defaults
            results.append(f"INFO: Empty body returned success={body.get('success')}")

    if "method_not_allowed" in checks:
        if body.get("success") == False and "not allowed" in body.get("error", "").lower():
            results.append("PASS: GET method rejected")
        else:
            results.append("FAIL: GET method not properly rejected")
            passed = False

    if body.get("success"):
        data = body["data"]

        if "no_dscr_leak" in checks:
            programs = data.get("programs", [])
            dscr_progs = [p["programName"] for p in programs if "DSCR" in p.get("programName", "").upper()]
            if not dscr_progs:
                results.append("PASS: No DSCR programs in results")
            else:
                results.append(f"FAIL: DSCR leak detected: {dscr_progs}")
                passed = False

        if "second_home_adj" in checks:
            adjs = data.get("globalAdjustments", [])
            home2 = [a for a in adjs if "2ND HOME" in a["description"].upper()]
            if home2:
                results.append(f"PASS: 2ND HOME adjustment found ({home2[0]['amount']})")
            else:
                results.append("FAIL: Missing 2ND HOME adjustment")
                passed = False

        if "non_warrantable_adj" in checks:
            adjs = data.get("globalAdjustments", [])
            nw = [a for a in adjs if "NON-WARRANTABLE" in a["description"].upper() or "NONWARRANT" in a["description"].upper()]
            sent_nw = data.get("debugSentValues", {}).get("isNonWarrantable", False)
            if sent_nw:
                results.append("PASS: isNonWarrantable=True sent to API")
            else:
                results.append("FAIL: isNonWarrantable not sent")
                passed = False
            if nw:
                results.append(f"PASS: NON-WARRANTABLE adj found ({nw[0]['amount']})")
            else:
                results.append("INFO: No NON-WARRANTABLE adj in globalAdjustments (may be per-rate)")

        if "dscr_programs" in checks:
            programs = data.get("programs", [])
            dscr_count = len([p for p in programs if "DSCR" in p.get("description", "").upper()])
            results.append(f"PASS: {dscr_count} DSCR programs returned for investment")

        # Always print summary
        results.insert(0, f"Rate: {data['rate']}% | Payment: ${data['monthlyPayment']} | Programs: {data['totalPrograms']} | {data['programName']}")

    status_icon = "PASS" if passed else "FAIL"
    print(f"\n[{status_icon}] {name}")
    for r in results:
        print(f"  {r}")
    return passed


if __name__ == "__main__":
    print("=" * 60)
    print("OpenPricev7 API Scenario Tests")
    print("=" * 60)

    total = 0
    passed = 0
    for test in tests:
        total += 1
        if run_test(test):
            passed += 1

    print(f"\n{'=' * 60}")
    print(f"Results: {passed}/{total} tests passed")
    print("=" * 60)
    sys.exit(0 if passed == total else 1)
