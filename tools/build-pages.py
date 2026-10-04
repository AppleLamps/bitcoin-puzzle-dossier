#!/usr/bin/env python3
"""Generate the static entry pages and the per-puzzle pages from index.html and the puzzle data.

Run from the repo root:  python3 tools/build-pages.py
Outputs: case-file/index.html, ledger/index.html, cracker/index.html, puzzle/N/index.html (1..256), sitemap.xml
"""
import re, os, json, html, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://bitcoin-puzzle-dossier.vercel.app'
TODAY = datetime.date.today().isoformat()
os.chdir(ROOT)
index = open('index.html', encoding='utf-8').read()

# ---------- data ----------
addresses = re.search(r'`\s*(.*?)\s*`', open('js/addresses.js').read(), re.S).group(1).split()
pd = open('js/puzzle-data.js').read()
later = {int(k): v for k, v in re.findall(r"(\d+):'([^']+)'", re.search(r'laterSolveDates = \{(.*?)\};', pd, re.S).group(1))}
balances = {int(k): v for k, v in re.findall(r"(\d+):'([^']+)'", re.search(r'openBalances = \{(.*?)\};', pd, re.S).group(1))}
late_solved = set(int(x) for x in re.search(r'lateSolved = \[(.*?)\]', pd).group(1).split(','))
def solve_date(n):
    if 3 <= n <= 28: return '15 Jan 2015'
    if 29 <= n <= 33: return '16 Jan 2015'
    if 34 <= n <= 36: return '17 Jan 2015'
    if n == 37: return '18 Jan 2015'
    if n == 38: return '19 Jan 2015'
    if n == 39: return '21 Jan 2015'
    if 40 <= n <= 46: return '30 Jan 2015'
    if 47 <= n <= 50: return '01 Sep 2015'
    return later.get(n, '')
def state(n):
    if n <= 2: return 'preused'
    if n <= 70 or n in late_solved: return 'solved'
    if n <= 160: return 'open'
    return 'retired'
def has_pub(n): return 65 <= n <= 160 and n % 5 == 0
def iso(d):
    if not d: return ''
    return datetime.datetime.strptime(d, '%d %b %Y').date().isoformat()
labels = {'open': 'OPEN', 'solved': 'SOLVED', 'preused': 'PRE-USED', 'retired': 'RETIRED'}

# ---------- entry pages (tab preselected, unique metadata) ----------
def entry_page(page, path, title, desc, h1_hint):
    s = index
    s = s.replace('<title>' + re.search(r'<title>(.*?)</title>', s).group(1) + '</title>', '<title>' + html.escape(title) + '</title>')
    s = re.sub(r'<meta name="description" content="[^"]*" />', '<meta name="description" content="%s" />' % html.escape(desc, quote=True), s)
    s = re.sub(r'<link rel="canonical" href="[^"]*" />', '<link rel="canonical" href="%s%s" />' % (SITE, path), s)
    s = re.sub(r'<meta property="og:url" content="[^"]*" />', '<meta property="og:url" content="%s%s" />' % (SITE, path), s)
    s = re.sub(r'<meta property="og:title" content="[^"]*" />', '<meta property="og:title" content="%s" />' % html.escape(title, quote=True), s)
    s = re.sub(r'<meta name="twitter:title" content="[^"]*" />', '<meta name="twitter:title" content="%s" />' % html.escape(title, quote=True), s)
    s = re.sub(r'<meta property="og:description" content="[^"]*" />', '<meta property="og:description" content="%s" />' % html.escape(desc, quote=True), s)
    s = re.sub(r'<meta name="twitter:description" content="[^"]*" />', '<meta name="twitter:description" content="%s" />' % html.escape(desc, quote=True), s)
    # show the right tab before scripts run (also for crawlers that do not execute JS)
    s = s.replace('<section id="home" class="page-view home-page">', '<section id="home" class="page-view home-page" hidden>')
    s = s.replace('<div id="dossier" class="page-view">', '<div id="dossier" class="page-view"%s>' % ('' if page == 'dossier' else ' hidden'))
    s = s.replace('<section id="ledger" class="page-view ledger-page" hidden>', '<section id="ledger" class="page-view ledger-page"%s>' % ('' if page == 'ledger' else ' hidden'))
    s = s.replace('<section id="cracker" class="page-view cracker-page" hidden>', '<section id="cracker" class="page-view cracker-page"%s>' % ('' if page == 'cracker' else ' hidden'))
    s = s.replace('  <script src="/js/addresses.js"></script>', '  <script>window.DEFAULT_PAGE = %s;</script>\n  <script src="/js/addresses.js"></script>' % json.dumps(page))
    # breadcrumb
    crumb = json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Bitcoin Puzzle Dossier", "item": SITE + "/"},
        {"@type": "ListItem", "position": 2, "name": h1_hint, "item": SITE + path}]})
    s = s.replace('  <link rel="stylesheet" href="/css/styles.css" />', '  <script type="application/ld+json">%s</script>\n  <link rel="stylesheet" href="/css/styles.css" />' % crumb)
    os.makedirs(path.strip('/'), exist_ok=True)
    open(path.strip('/') + '/index.html', 'w', encoding='utf-8').write(s)
    return path

pages = [
    entry_page('dossier', '/case-file/', 'Who Created the Bitcoin Puzzle? Investigative Case File on the 2015 Puzzle Transaction',
               'A sourced investigation into the creator of the 2015 Bitcoin Puzzle Transaction: the saatoshi_rising claim, the key-control proof, the funding trail, timeline, competing theories and open questions.', 'Case file'),
    entry_page('ledger', '/ledger/', 'Bitcoin Puzzle Addresses: All 256 Puzzles with Key Ranges, Balances and Solve Status',
               'Every Bitcoin puzzle address from the 2015 transaction with its private-key range in hex, current balance, solve date and public-key status. Search by puzzle number or address.', 'Puzzle ledger'),
    entry_page('cracker', '/cracker/', 'Bitcoin Puzzle Cracker: Brute-Force Any Puzzle in Your Browser',
               'A real secp256k1 brute-force engine that runs in Web Workers on your device. Pick a Bitcoin puzzle, benchmark your CPU, stop and resume, and see the private key the moment it is found.', 'Web cracker'),
]

# ---------- per-puzzle pages ----------
head_tpl = open('index.html').read()
topline = re.search(r'    <div class="topline">.*?\n    </div>\n', index, re.S).group(0)
puzzle_tpl = '''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="light dark" />
  <title>{title}</title>
  <meta name="description" content="{desc}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="{url}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Bitcoin Puzzle Dossier" />
  <meta property="og:url" content="{url}" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{desc}" />
  <meta property="og:image" content="{site}/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@lamps_apple" />
  <meta name="twitter:creator" content="@lamps_apple" />
  <meta name="twitter:title" content="{title}" />
  <meta name="twitter:description" content="{desc}" />
  <meta name="twitter:image" content="{site}/og-image.png" />
  <meta name="twitter:label1" content="Status" />
  <meta name="twitter:data1" content="{status_word}" />
  <meta name="twitter:label2" content="Prize" />
  <meta name="twitter:data2" content="{balance} BTC" />
  <script type="application/ld+json">{ld}</script>
  <link rel="stylesheet" href="/css/styles.css" />
</head>
<body>
  <div class="shell">
{topline}
    <section class="page-view puzzle-page">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Bitcoin Puzzle</a> › <a href="/ledger/">Ledger</a> › <span>Puzzle #{n}</span></nav>
      <header class="ledger-hero">
        <div>
          <div class="section-index">BITCOIN PUZZLE #{n} · {bits}-BIT · <span class="state state-{state}">{status_word}</span>{pubtag}</div>
          <h1>Bitcoin Puzzle #{n}</h1>
          <p>{lede}</p>
        </div>
        <aside class="ledger-explain">
          <b class="mono">PRIZE</b>
          <p class="num">{balance} BTC</p>
          <p>{prize_note}</p>
        </aside>
      </header>
      <div class="puzzle-facts">
        <dl class="modal-facts">
          <dt>Address</dt><dd class="mono"><a class="source-link" href="https://mempool.space/address/{address}" target="_blank" rel="noopener">{address} ↗</a></dd>
          <dt>Private key range (hex)</dt><dd class="mono">{lo_hex}<br>→ {hi_hex}</dd>
          <dt>Private key range (math)</dt><dd class="mono">[2^{lo_exp}, 2^{bits})</dd>
          <dt>Keys in range</dt><dd class="mono">{keyspace} <small>(2^{lo_exp})</small></dd>
          <dt>Original prize</dt><dd class="mono">{original} BTC on 15 Jan 2015</dd>
          <dt>Public key</dt><dd>{pub_text}</dd>
          <dt>Record</dt><dd>{record}</dd>
        </dl>
      </div>
      <div class="puzzle-body">
        <h2>{h2}</h2>
        {body}
        <p class="puzzle-actions">{actions}</p>
        <nav class="puzzle-nav" aria-label="Neighbouring puzzles">{prev}{next}</nav>
      </div>
    </section>
  </div>
  <script src="/js/donate.js"></script>
</body>
</html>
'''
def fmt_int(x): return format(x, ',')
puzzle_urls = []
for n in range(1, 257):
    addr = addresses[n - 1]; st = state(n); bits = n
    lo = 1 << (n - 1); hi = (1 << n) - 1
    bal = balances.get(n, '0.00000000')
    pub = has_pub(n); sd = solve_date(n)
    url = '%s/puzzle/%d/' % (SITE, n)
    status_word = labels[st]
    if st == 'open':
        title = 'Bitcoin Puzzle #%d: %s BTC unsolved, address %s, key range 2^%d to 2^%d' % (n, bal.rstrip('0').rstrip('.'), addr[:10] + '…', n - 1, n)
        desc = 'Bitcoin puzzle %d is unsolved and holds %s BTC at %s. The private key lies in [2^%d, 2^%d). %s' % (n, bal, addr, n - 1, n, 'Its public key was exposed in 2019, so Pollard’s kangaroo applies.' if pub else 'Only the address is known, so it needs brute force.')
        lede = 'Still unsolved. The private key for this puzzle is an integer between 2^%d and 2^%d − 1, and whoever finds it can sweep %s BTC from %s.' % (n - 1, n, bal, addr)
        prize_note = 'Balance at the 21 Aug 2026 chain re-read. Spend fast if you find the key: solved puzzle transactions have been front-run in the mempool.'
        h2 = 'How to attempt Bitcoin puzzle #%d' % n
        if pub:
            body = '<p>The creator published this puzzle’s public key in 2019, which turns the search into a bounded discrete logarithm. Pollard’s kangaroo solves a %d-bit interval in about 2^%d group operations, far fewer than the 2^%d key tests a blind search would need. JeanLucPons’ CUDA Kangaroo is the standard tool; puzzles #130 and #135 were cracked this way by large GPU pools.</p>' % (n, (n + 1) // 2, n - 2)
        else:
            body = '<p>Only the address is known, so a solver has to walk the interval: multiply the secp256k1 generator by each candidate key, hash the compressed public key with SHA-256 and RIPEMD-160, and compare with the address’s hash160. On average that is 2^%d tests, about %s. A single high-end GPU running BitCrack or keyhunt manages roughly a billion tests per second.</p>' % (n - 2, '{:.2e}'.format(2 ** (n - 2)))
        actions = '<a class="btn-primary btn-link" href="/cracker/#crack-%d">Try cracking #%d in your browser</a> <a class="btn-secondary btn-link" href="/#attempt">How solvers really attack it</a>' % (n, n)
        record = ('Public key exposed · kangaroo' if pub else 'Address only · brute force')
    elif st == 'solved':
        title = 'Bitcoin Puzzle #%d: solved %s, address %s, key range 2^%d to 2^%d' % (n, sd, addr[:10] + '…', n - 1, n)
        desc = 'Bitcoin puzzle %d (%s) was solved on %s. Its private key lay in [2^%d, 2^%d). Original prize %.3f BTC.' % (n, addr, sd, n - 1, n, n / 1000)
        lede = 'Solved and swept on %s. The private key for this %d-bit puzzle was found inside [2^%d, 2^%d) and the balance was moved out.' % (sd, n, n - 1, n)
        prize_note = 'Nothing left to win here. Solved puzzles are the easiest way to prove a cracking engine works, because the real key is reachable.'
        h2 = 'Why puzzle #%d still matters' % n
        body = '<p>A solved puzzle is a benchmark. Running a cracker against it should recover the real private key, which is how you tell genuine code from a toy. Puzzle #%d needs about 2^%d key tests on average%s.</p>' % (n, n - 2, ', which the in-browser engine on this site finishes in seconds' if n <= 24 else ('' if n > 32 else ', within reach of a laptop in minutes'))
        actions = '<a class="btn-primary btn-link" href="/cracker/#crack-%d">Re-solve #%d in your browser</a> <a class="btn-secondary btn-link" href="/ledger/">All 256 puzzle addresses</a>' % (n, n)
        record = 'Swept %s%s' % (sd, ' · public key exposed' if pub else '')
    elif st == 'preused':
        title = 'Bitcoin Puzzle #%d: address %s was already in use before the puzzle' % (n, addr)
        desc = 'Bitcoin puzzle %d at %s had a tiny key (%d) and was already spent before the 2015 puzzle transaction. It is not counted as a solve.' % (n, addr, lo if n == 1 else 3)
        lede = 'A %d-bit key is trivial, and this address was already in use before the puzzle was funded, so its emptying is not counted as a solve.' % n
        prize_note = 'Not a real puzzle in practice. Kept in the ledger for completeness.'
        h2 = 'About puzzle #%d' % n
        body = '<p>The first two puzzles have private keys 1 and 3. Both addresses existed on chain before January 2015, so the puzzle record starts at #3.</p>'
        actions = '<a class="btn-secondary btn-link" href="/ledger/">All 256 puzzle addresses</a>'
        record = 'Known before puzzle · not a solve'
    else:
        title = 'Bitcoin Puzzle #%d: retired by the creator in 2017, address %s' % (n, addr)
        desc = 'Bitcoin puzzle %d at %s was swept by the creator on 11 July 2017 and no longer holds a prize. Key range [2^%d, 2^%d).' % (n, addr, n - 1, n)
        lede = 'Retired. The creator swept puzzles 161 to 256 on 11 July 2017 and moved the funds into the lower puzzles, so this address holds nothing.' 
        prize_note = 'Empty since 2017. Listed so searches for the address still find an answer.'
        h2 = 'Why puzzle #%d was retired' % n
        body = '<p>Puzzles above 160 would never be solved with foreseeable hardware, so the creator reclaimed their coins and used them to raise the prizes on the solvable range. The key for this address is still unknown; it just no longer matters.</p>'
        actions = '<a class="btn-secondary btn-link" href="/ledger/">All 256 puzzle addresses</a> <a class="btn-secondary btn-link" href="/case-file/">Who did this and why</a>'
        record = 'Creator sweep · 11 Jul 2017'
    pub_text = ('Exposed by the creator in 2019' if pub else 'Not published; only the address is known') if n <= 160 else 'Not published'
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebPage", "@id": url + "#webpage", "url": url, "name": title, "description": desc, "isPartOf": {"@id": SITE + "/#website"}, "dateModified": TODAY},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Bitcoin Puzzle", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Puzzle ledger", "item": SITE + "/ledger/"},
            {"@type": "ListItem", "position": 3, "name": "Puzzle #%d" % n, "item": url}]},
        {"@type": "Thing", "name": "Bitcoin Puzzle #%d" % n, "identifier": addr, "description": desc, "url": url}]}
    prev = '<a href="/puzzle/%d/">← Puzzle #%d</a>' % (n - 1, n - 1) if n > 1 else '<span></span>'
    nxt = '<a href="/puzzle/%d/">Puzzle #%d →</a>' % (n + 1, n + 1) if n < 256 else '<span></span>'
    out = puzzle_tpl.format(title=html.escape(title), desc=html.escape(desc, quote=True), url=url, site=SITE, status_word=status_word, balance=bal,
        ld=json.dumps(ld, ensure_ascii=False), topline=topline.rstrip('\n'), n=n, bits=bits, state=st, pubtag=(' · PUBLIC KEY EXPOSED' if pub and n <= 160 else ''),
        lede=lede, prize_note=prize_note, address=addr, lo_hex=format(lo, 'x'), hi_hex=format(hi, 'x'), lo_exp=n - 1, keyspace=fmt_int(lo), original='%.3f' % (n / 1000),
        pub_text=pub_text, record=record, h2=h2, body=body, actions=actions, prev=prev, next=nxt)
    os.makedirs('puzzle/%d' % n, exist_ok=True)
    open('puzzle/%d/index.html' % n, 'w', encoding='utf-8').write(out)
    puzzle_urls.append((url, '0.6' if st == 'open' else '0.4'))

# ---------- sitemap ----------
urls = [(SITE + '/', '1.0'), (SITE + '/ledger/', '0.9'), (SITE + '/cracker/', '0.9'), (SITE + '/case-file/', '0.8')] + puzzle_urls
sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u, pr in urls:
    sm.append('  <url><loc>%s</loc><lastmod>%s</lastmod><changefreq>weekly</changefreq><priority>%s</priority></url>' % (u, TODAY, pr))
sm.append('</urlset>')
open('sitemap.xml', 'w').write('\n'.join(sm) + '\n')
print('built', len(pages), 'entry pages,', len(puzzle_urls), 'puzzle pages, sitemap with', len(urls), 'urls')
