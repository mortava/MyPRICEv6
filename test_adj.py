import json, urllib.request

API = "https://openpricev7.vercel.app/api/get-pricing"

payload = {
    "loanAmount": 600000, "propertyValue": 800000, "creditScore": 740,
    "propertyZip": "90120", "propertyState": "CA",
    "occupancyType": "primary", "propertyType": "sfr",
    "loanPurpose": "purchase", "documentationType": "fullDoc",
    "loanType": "nonqm", "lockPeriod": "30"
}

req = urllib.request.Request(API, json.dumps(payload).encode(), {"Content-Type": "application/json"}, method="POST")
resp = urllib.request.urlopen(req, timeout=30)
d = json.loads(resp.read())["data"]

print("=== FULL DOC PRIMARY ===")
print(f"Program: {d['programName']}")
print(f"Rate: {d['rate']}")
print()
print("=== PER-RATE ADJUSTMENTS (shown to user) ===")
for p in d["programs"]:
    for ro in p["rateOptions"][:3]:
        adjs = ro.get("adjustments") or []
        print(f"  Rate {ro['rate']}:")
        for a in adjs:
            print(f"    {a['amount']:+.3f}  {a['description']}")
        if not adjs:
            print("    (none)")
print()
print("=== GLOBAL ADJUSTMENTS ===")
for a in (d.get("globalAdjustments") or []):
    print(f"  {a['amount']:+.3f}  {a['description']}")
print()
raw = d.get("debugAdjustmentsSection", "")
print("=== RAW ADJUSTMENTS XML (first 1200 chars) ===")
print(raw[:1200])
