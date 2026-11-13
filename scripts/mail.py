#!/usr/bin/env python3
"""contact@gms-hub.com from the command line.

  python3 scripts/mail.py list [N]          newest N messages (default 20)
  python3 scripts/mail.py read ID           one message: headers + plain-text body
  python3 scripts/mail.py send TO SUBJECT   body from stdin; sends as contact@gms-hub.com

Mail lives in D1 table `inbox` (worker/src/inbox.js). Sending goes through the worker's
/internal/mail/send with the token in ~/.config/gms-hub/mail-token (also the worker secret MAIL_ADMIN_TOKEN).
"""
import email, email.header, email.policy, json, os, subprocess, sys, urllib.request

WORKER = 'https://gms-hub-votes.kwonth211.workers.dev'
WDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'worker')


def d1(sql):
    env = {k: v for k, v in os.environ.items() if k != 'CLOUDFLARE_API_TOKEN'}
    out = subprocess.run(['npx', '-y', 'wrangler@3.114.0', 'd1', 'execute', 'gms-hub-votes', '--remote', '--json', '--command', sql],
                         cwd=WDIR, env=env, capture_output=True, text=True, check=True).stdout
    return json.loads(out)[0]['results']


def dec(s):
    try:
        return str(email.header.make_header(email.header.decode_header(s or '')))
    except Exception:
        return s or ''


def body_of(raw):
    if raw.startswith('{'):
        return json.loads(raw).get('text', '')
    msg = email.message_from_string(raw, policy=email.policy.default)
    part = msg.get_body(preferencelist=('plain', 'html'))
    return (part.get_content() if part else '').strip(), msg


cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
if cmd == 'list':
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    for r in d1(f'SELECT id, at, mail_from, mail_to, subject FROM inbox ORDER BY id DESC LIMIT {n}'):
        print(f"{r['id']:>4}  {r['at']} UTC  {r['mail_from'][:40]:<40} → {r['mail_to'][:28]:<28}  {dec(r['subject'])}")
elif cmd == 'read':
    r = d1(f'SELECT * FROM inbox WHERE id = {int(sys.argv[2])}')[0]
    res = body_of(r['raw'] or '')
    if isinstance(res, tuple):
        text, msg = res
        print('From:', msg['From']); print('To:', msg['To']); print('Date:', msg['Date']); print('Subject:', msg['Subject'])
        print('Message-ID:', msg['Message-ID']); print()
        print(text)
    else:
        print('Sent to:', r['mail_to']); print('Subject:', r['subject']); print(); print(res)
elif cmd == 'send':
    to, subject = sys.argv[2], sys.argv[3]
    data = json.dumps({'to': to, 'subject': subject, 'text': sys.stdin.read()}).encode()
    token = open(os.path.expanduser('~/.config/gms-hub/mail-token')).read().strip()
    req = urllib.request.Request(WORKER + '/internal/mail/send', data=data, method='POST',
                                 headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    print(urllib.request.urlopen(req).read().decode())
else:
    print(__doc__)
