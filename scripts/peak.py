#!/usr/bin/env python3
"""The site's record of pages open at once (internal).

  python3 scripts/peak.py     -> record, when it happened (KST) and the count right now

The worker keeps one value (worker/src/presence.js: the highest real count and its time) and only rewrites it when the
record is beaten. Token: ~/.config/gms-hub/mail-token (worker secret MAIL_ADMIN_TOKEN).
"""
import datetime, json, os, urllib.request

WORKER = 'https://gms-hub-votes.kwonth211.workers.dev'
token = open(os.path.expanduser('~/.config/gms-hub/mail-token')).read().strip()
req = urllib.request.Request(f'{WORKER}/internal/presence-peak', headers={'Authorization': f'Bearer {token}', 'User-Agent': 'gms-hub-scripts'})
d = json.load(urllib.request.urlopen(req, timeout=20))
at = '-'
if d.get('at'):
    t = datetime.datetime.fromisoformat(d['at'].replace('Z', '+00:00')).astimezone(datetime.timezone(datetime.timedelta(hours=9)))
    at = t.strftime('%Y-%m-%d %H:%M:%S KST')
print(f"record: {d['peak']} pages open at once ({at})")
print(f"now:    {d['now']}")
