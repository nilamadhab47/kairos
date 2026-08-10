#!/usr/bin/env python3
"""Probe ESPN public APIs across many endpoint families and report structure."""
import json
import urllib.request
import urllib.error
import sys

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

def get(url, timeout=10):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode()
            try:
                return r.status, json.loads(body)
            except Exception:
                return r.status, {"_raw_len": len(body)}
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        return 0, {"error": str(e)}

def enum_leagues(sport):
    url = f"https://sports.core.api.espn.com/v2/sports/{sport}/leagues?limit=200"
    code, data = get(url)
    if code != 200 or not data:
        return code, []
    items = data.get("items", [])
    slugs = []
    for it in items:
        ref = it.get("$ref", "")
        slug = ref.split("/")[-1].split("?")[0]
        slugs.append(slug)
    return code, slugs

print("=" * 70)
print("ESPN LEAGUE ENUMERATION")
print("=" * 70)
for sport in ["football", "basketball", "baseball", "hockey", "soccer", "cricket",
              "tennis", "racing", "mma", "golf", "rugby", "volleyball"]:
    code, slugs = enum_leagues(sport)
    print(f"\n{sport} ({code}) — {len(slugs)} leagues")
    for s in slugs[:30]:
        print(f"    {s}")
    if len(slugs) > 30:
        print(f"    ... +{len(slugs)-30} more")

print("\n" + "=" * 70)
print("ENDPOINT PATTERNS (using site.api.espn.com)")
print("=" * 70)

# Take a live event id to probe deep endpoints
code, sb = get("https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard")
event_id = sb["events"][0]["id"] if code == 200 and sb.get("events") else None
team_id = sb["events"][0]["competitions"][0]["competitors"][0]["team"]["id"] if event_id else None
print(f"\nSample MLB event id: {event_id}, team id: {team_id}")

patterns = [
    "scoreboard", "teams", "news", "standings", "rankings",
    "summary?event={E}", "playbyplay?event={E}",
    "teams/{T}", "teams/{T}/roster", "teams/{T}/schedule",
    "teams/{T}/statistics", "teams/{T}/injuries",
]
sport_leagues = [
    ("football", "nfl"), ("football", "college-football"),
    ("basketball", "nba"), ("basketball", "wnba"), ("basketball", "mens-college-basketball"),
    ("baseball", "mlb"), ("hockey", "nhl"),
    ("soccer", "eng.1"), ("soccer", "esp.1"), ("soccer", "ita.1"),
    ("soccer", "ger.1"), ("soccer", "fra.1"), ("soccer", "usa.1"),
    ("soccer", "uefa.champions"), ("soccer", "uefa.europa"),
    ("soccer", "fifa.world"), ("soccer", "conmebol.libertadores"),
    ("cricket", "8039"), ("cricket", "8048"),
    ("tennis", "atp"), ("tennis", "wta"),
    ("racing", "f1"),
]

results = {}
for sport, lg in sport_leagues:
    for pat in patterns:
        p = pat.replace("{E}", event_id or "0").replace("{T}", team_id or "1")
        url = f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{lg}/{p}"
        code, _ = get(url, timeout=6)
        results.setdefault((sport, lg), []).append((pat.split("?")[0].split("/")[0], code))

for (sport, lg), rows in results.items():
    ok = ",".join(f"{p}:{c}" for p, c in rows if c == 200)
    fail = ",".join(f"{p}:{c}" for p, c in rows if c != 200)
    print(f"\n{sport}/{lg}")
    print(f"  OK  : {ok}")
    if fail:
        print(f"  FAIL: {fail}")
