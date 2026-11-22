#!/usr/bin/env python3
"""Phone-size browser smoke test (390x844).
Usage: python3 tests/phone-smoke.py /path/to/YBDashboard_Backup.json
Serves the repo on :8765, restores the backup, then:
  - opens every tab and fails on any page error
  - on Pockets: opens EVERY pocket card and checks it is really visible (opacity 1, has height, shows its stats)
  - on Plan: checks it renders rows and no 'NaN' / 'undefined' text anywhere on visible tabs
Exit 0 = pass, 1 = fail. Known noise ignored: prayer-times fetch (CORS from localhost)."""
import sys, subprocess, time, os, json, socket
from playwright.sync_api import sync_playwright
BK = sys.argv[1] if len(sys.argv) > 1 else None
if not BK or not os.path.exists(BK): sys.exit('usage: phone-smoke.py <backup.json>')
repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with socket.socket() as _s:
    if _s.connect_ex(('127.0.0.1', 8765)) == 0: sys.exit('port 8765 is already in use: stop it first, otherwise this test would run against the wrong server')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--directory', repo], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
if srv.poll() is not None: sys.exit('test server failed to start')
fails, errs = [], []
tabs, res = [], []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 844})
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(3500)
        pg.evaluate("loginSuccess('Test')"); pg.wait_for_timeout(1200)
        pg.set_input_files("input[type=file][onchange*='restoreData']", BK); pg.wait_for_timeout(2500)
        pg.reload(); pg.wait_for_timeout(3500); pg.evaluate("loginSuccess('Test')"); pg.wait_for_timeout(1500)
        tabs = pg.evaluate("[...document.querySelectorAll('.page')].map(x=>x.id.replace('page-',''))")
        for t in tabs:
            pg.evaluate("goToTab(%s)" % json.dumps(t)); pg.wait_for_timeout(700)
            active = pg.evaluate("(document.querySelector('.page.active')||{}).id")
            if active != 'page-' + t:
                fails.append('tab %s did not open (active page is %s)' % (t, active)); continue
            bad = pg.evaluate("""(()=>{const el=document.querySelector('.page.active'); const tx=el?el.innerText:''; return /\\bNaN\\b|undefined|\\[object/.test(tx) ? tx.match(/.{0,30}(NaN|undefined|\\[object).{0,30}/)[0] : ''})()""")
            if bad: fails.append('tab %s shows bad text: %s' % (t, bad.replace('\n', ' ')))
        pg.evaluate("goToTab('savings')"); pg.wait_for_timeout(1200)
        res = pg.evaluate("""(async()=>{
          const out=[];
          for(const c of document.querySelectorAll('.fund-card')){
            const name=c.querySelector('.fund-name').textContent;
            const btn=c.querySelector('.collapse-btn'), wrap=c.querySelector('.fund-body-wrap');
            if(wrap.classList.contains('collapsed')) btn.click();
            await new Promise(r=>setTimeout(r,700));
            const cs=getComputedStyle(wrap), h=wrap.getBoundingClientRect().height;
            const txt=wrap.innerText||'';
            out.push({name, opacity:cs.opacity, height:Math.round(h), hasStats:/AVAILABLE|SAVED/i.test(txt)});
            if(!wrap.classList.contains('collapsed')) btn.click();
            await new Promise(r=>setTimeout(r,500));
            out[out.length-1].reCollapsed = getComputedStyle(wrap).opacity==='0' || wrap.classList.contains('collapsed');
          }
          return out;})()""")
        if not res: fails.append('no pocket cards found')
        for r in res:
            ok = r['opacity'] == '1' and r['height'] > 40 and r['hasStats']
            print(('  ok   ' if ok else '  FAIL ') + 'pocket opens visibly: %s (opacity %s, height %s)' % (r['name'], r['opacity'], r['height']))
            if not ok: fails.append('pocket card not visible when opened: ' + r['name'])
            if not r['reCollapsed']: fails.append('pocket card did not collapse again: ' + r['name'])
        pg.evaluate("goToTab('plan')"); pg.wait_for_timeout(1200)
        rows = pg.evaluate("document.querySelector('#page-plan').innerText.length")
        if rows < 200: fails.append('Plan tab looks empty')
        b.close()
finally:
    srv.terminate()
    try: srv.wait(timeout=5)
    except Exception: srv.kill()
errs = [e for e in errs if 'prayer' not in e.lower()]
for e in errs: fails.append('page error: ' + e[:120])
print('\n' + ('❌ FAILED:\n  - ' + '\n  - '.join(fails) if fails else '✅ phone smoke test clean (%d tabs, %d pockets)' % (len(tabs), len(res))))
sys.exit(1 if fails else 0)
