# -*- coding: utf-8 -*-
# Checks one or more rewritten guides (data/guides/<slug>.<ko|en>.html) against the bar set on 2026-11-26 for the AdSense
# review: length, pictures, tables, FAQ, links that resolve to indexed pages, local pictures that exist, banned wording.
# Usage: python3 scripts/guide-check.py hunter fighter ...   (run from the repo root; needs a built dist/ for links)
import re, sys, os, html, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITEMAP = open(os.path.join(ROOT, 'dist/sitemap.xml'), encoding='utf-8').read() if os.path.exists(os.path.join(ROOT, 'dist/sitemap.xml')) else ''
INDEXED = set(re.sub(r'^https://gms-hub\.com', '', u) for u in re.findall(r'<loc>([^<]+)</loc>', SITEMAP))
KO_BAN = r'비교해요|비교하세요|비교한 뒤|견줘|시험해요|시험하세요|검토|후보|기준점|조건부|관측|가정|근거|표본|확인하세요|확인해요|확인해야|확실한 자료|편집 제안|보장하지|유튜브|영상에서|공략들|한국 공략|후기예요|디시|레딧|meowdb|maplestory\.io'
EN_BAN = r'(?i)\bcompar\w*|\bcandidate|\bconsider\w*|\bobserved|\bbenchmark|\bverify|\bYouTube|\bReddit|\bmeowdb|\bKorean guides\b|\bmay\b'

def text_of(h):
    h = re.sub(r'(?s)<table.*?</table>', lambda m: ' ' + re.sub(r'<[^>]+>', ' ', m.group(0)) + ' ', h)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', h))).strip()

bad_total = 0
for slug in sys.argv[1:]:
    for lang in ('ko', 'en'):
        f = os.path.join(ROOT, 'data/guides', f'{slug}.{lang}.html')
        if not os.path.exists(f):
            print(f'{slug}.{lang}: MISSING'); bad_total += 1; continue
        h = open(f, encoding='utf-8').read()
        t = text_of(h)
        size = len(t.replace(' ', '')) if lang == 'ko' else len(re.findall(r"[A-Za-z0-9']+", t))
        need = 4000 if lang == 'ko' else 1300
        imgs = re.findall(r'<img [^>]*src="([^"]+)"', h)
        missing_img = [s for s in imgs if s.startswith('/') and not os.path.exists(os.path.join(ROOT, s.lstrip('/').split('?')[0]))]
        no_alt = len(re.findall(r'<img (?![^>]*\balt=")[^>]*>', h))
        tables = len(re.findall(r'<table', h))
        h2 = re.findall(r'<h2>(.*?)</h2>', h)
        faq = any(re.search(r'자주 묻는 질문|FAQ|Frequently asked|Common questions', x, re.I) for x in h2)
        h3 = len(re.findall(r'<h3>', h))
        links = re.findall(r'href="(/[^"#?]*)', h)
        dead = [l for l in links if l not in INDEXED and not os.path.exists(os.path.join(ROOT, 'dist', l.strip('/'), 'index.html'))]
        noidx = [l for l in links if l not in INDEXED and l not in dead]
        wrong_lang = [l for l in links if not l.startswith(f'/{lang}/') and not l.startswith('/assets/')]
        ban = sorted(set(m.group(0) for m in re.finditer(KO_BAN if lang == 'ko' else EN_BAN, t)))
        macro_bad = [m for m in re.findall(r'\{\{([^}]*)\}\}', h) if not re.fullmatch(r'price:\d+', m)]
        long_p = sum(1 for p in re.findall(r'(?s)<p>(.*?)</p>', h) if len(re.findall(r'[.!?。]|요\.|다\.', text_of(p))) > 5)
        problems = []
        if size < need: problems.append(f'too short ({size} < {need})')
        if len(imgs) < 4: problems.append(f'pictures {len(imgs)} < 4')
        if missing_img: problems.append(f'missing picture files {missing_img[:3]}')
        if no_alt: problems.append(f'{no_alt} <img> without alt')
        if tables < 2: problems.append(f'tables {tables} < 2')
        if not faq or h3 < 4: problems.append('FAQ section (<h2> + 4+ <h3> questions) missing')
        if dead: problems.append(f'dead links {dead[:4]}')
        if noidx: problems.append(f'links to noindex pages {noidx[:4]}')
        if wrong_lang: problems.append(f'links to the other language {wrong_lang[:3]}')
        if ban: problems.append(f'banned words {ban}')
        if macro_bad: problems.append(f'unknown macros {macro_bad}')
        if long_p: problems.append(f'{long_p} paragraphs over 5 sentences')
        bad_total += bool(problems)
        print(f"{slug}.{lang}: {size}{'자' if lang == 'ko' else ' words'}, pictures {len(imgs)}, tables {tables}, h2 {len(h2)}, FAQ {'yes' if faq else 'no'} ({h3} h3), links {len(links)}"
              + ('  OK' if not problems else '\n   ✖ ' + '\n   ✖ '.join(problems)))
sys.exit(1 if bad_total else 0)
