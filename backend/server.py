"""Fixed, read-only collectors. Credentials and upstream responses stay server-side."""
import base64
import concurrent.futures
import json
import math
import os
import re
import socket
import ssl
import stat
import sqlite3
import threading
import time
from datetime import datetime
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

INTERVAL = int(os.getenv('POLL_SECONDS', '60'))
CONFIG = os.getenv('BITCOIN_CONFIG', '/run/bitcoin.conf')
DB = os.getenv('DATABASE', '/state/dashboard.sqlite3')
RPC_URL = os.getenv('BITCOIN_RPC', 'http://bitcoin:8332')
DOCKER_URL = os.getenv('DOCKER_PROXY', 'http://homepage-dockerproxy:2375')
MEMPOOL_URL = os.getenv('MEMPOOL_URL', 'http://mempool-web:8080')
BLITZPOOL_URL = 'http://blitzpool-api:3334'
state = {}
lock = threading.Lock()
stop = threading.Event()
CONTAINERS = {'bitcoin': 'bitcoin', 'lightning': 'lnd', 'joinmarket': 'joinmarket-jam', 'tor': 'tor', 'mempool': 'mempool-mempool-api-1', 'electrs': 'electrs-electrs-1', 'rtl': 'rtl', 'blitzpool':'blitzpool-api'}

def request(url, payload=None, headers=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=6) as res:
        return json.load(res)

def rpc_batch(calls):
    config = {}
    with open(CONFIG) as f:
        for line in f:
            if '=' in line and not line.lstrip().startswith('#'):
                k, v = line.strip().split('=', 1)
                config[k] = v
    token = base64.b64encode(f"{config['rpcuser']}:{config['rpcpassword']}".encode()).decode()
    response = request(RPC_URL, [{'jsonrpc':'2.0','id':i,'method':method,'params':params} for i,(method,params) in enumerate(calls)], {'Authorization':f'Basic {token}', 'Content-Type':'application/json'})
    result = sorted(response, key=lambda x:x['id'])
    if any(x.get('error') for x in result):
        raise RuntimeError('RPC query failed')
    return [x['result'] for x in result]

def bitcoin():
    chain, net, pool = rpc_batch([('getblockchaininfo',[]),('getnetworkinfo',[]),('getmempoolinfo',[])])
    return {'height':chain['blocks'],'headers':chain['headers'],'progress':chain['verificationprogress']*100,'initialSync':chain['initialblockdownload'],'chainBytes':chain['size_on_disk'],'pruned':chain['pruned'],'peers':net['connections'],'inbound':net['connections_in'],'outbound':net['connections_out'],'onionProxy':next((x['proxy'] for x in net['networks'] if x['name']=='onion'),None),'onionReachable':next((x['reachable'] for x in net['networks'] if x['name']=='onion'),False),'mempoolCount':pool['size'],'mempoolVbytes':pool['bytes'],'mempoolMemory':pool['usage'],'blockTime':chain['time'],'hash':chain['bestblockhash']}

history_cache = {}

def block_history():
    chain, = rpc_batch([('getblockchaininfo',[])])
    if history_cache.get('hash') == chain['bestblockhash']:
        return trim_history(history_cache['rows'])
    heights = list(range(max(0, chain['blocks']-288),chain['blocks']+1))
    hashes = rpc_batch([('getblockhash',[h]) for h in heights])
    headers = rpc_batch([('getblockheader',[h]) for h in hashes])
    # Keep the preceding point to show the height at the start of the window.
    rows = [{'timestamp':h['time'],'height':h['height']} for h in headers]
    history_cache.update(hash=chain['bestblockhash'],rows=rows)
    return trim_history(rows)

def trim_history(rows):
    cutoff=time.time()-86400
    before = [x for x in rows if x['timestamp'] < cutoff]
    return (before[-1:] + [x for x in rows if x['timestamp'] >= cutoff])

def electrum_call(method, params):
    with socket.create_connection(('electrs',50001),timeout=6) as conn:
        conn.settimeout(6)
        conn.sendall((json.dumps({'id':1,'method':method,'params':params})+'\n').encode())
        reply=json.loads(conn.makefile('rb').readline(1024*1024))
    if reply.get('error'):
        raise RuntimeError('Electrum query failed')
    return reply['result']

def electrs():
    result=electrum_call('blockchain.headers.subscribe',[])
    if not isinstance(result.get('height'),int):
        raise RuntimeError('Invalid Electrum response')
    return {'height':result['height']}

def allocated_size(path):
    total=0
    seen=set()
    pending=[path]
    while pending:
        entry=pending.pop()
        try:
            info=os.lstat(entry)
        except FileNotFoundError:
            if entry==path:raise
            continue # Compaction may delete a file during the read-only snapshot.
        identity=(info.st_dev,info.st_ino)
        if identity in seen:continue
        seen.add(identity)
        total+=info.st_blocks*512
        if stat.S_ISDIR(info.st_mode):
            with os.scandir(entry) as children:
                pending.extend(child.path for child in children)
    return total

def electrs_db_size():
    return {'bytes':allocated_size('/electrs-db')}

def parse_electrs_metrics(text):
    methods={}
    mempool_count=0
    mempool_bytes=0
    for line in text.splitlines():
        match=re.fullmatch(r'electrs_rpc_duration_(count|sum)\{([^}]+)\}\s+([0-9.eE+-]+)',line)
        if match:
            method=re.search(r'method="([a-zA-Z0-9_.:]+)"',match[2])
            value=float(match[3])
            if not method or not math.isfinite(value) or value<0:raise RuntimeError('Invalid RPC metrics')
            row=methods.setdefault(method[1],{'count':0,'seconds':0})
            row['count' if match[1]=='count' else 'seconds']=value
        for name,kind in [('electrs_mempool_txs_count','count'),('electrs_mempool_txs_vsize','bytes')]:
            if line.startswith(name+'{'):
                value=float(line.rsplit(' ',1)[1])
                if not math.isfinite(value) or value<0:raise RuntimeError('Invalid mempool metrics')
                if kind=='count':mempool_count+=value
                else:mempool_bytes+=value
    if not methods:raise RuntimeError('RPC metrics unavailable')
    return {'requests':sum(row['count'] for row in methods.values()),'seconds':sum(row['seconds'] for row in methods.values()),'methods':methods,'mempoolCount':mempool_count,'mempoolVbytes':mempool_bytes}

def query_interval(previous, current, now, identity):
    if not previous or previous.get('identity')!=identity:return None,None
    elapsed=now-previous['timestamp']
    count=current['requests']-previous['requests']
    seconds=current['seconds']-previous['seconds']
    if elapsed<=0 or elapsed>180 or count<0 or seconds<0:return None,None
    return count*60/elapsed,seconds*1000/count if count else None

electrs_metrics_previous={}

def electrs_metrics():
    with urllib.request.urlopen('http://electrs:4224/metrics',timeout=6) as response:
        parsed=parse_electrs_metrics(response.read(2*1024*1024).decode())
    now=time.time()
    with lock:
        container=(state.get('containers',{}).get('data') or {}).get('electrs')
    identity=(container['id']+'|'+str(container['startedAt'])) if container else None
    if identity is None:raise RuntimeError('Indexer identity unavailable')
    rate,mean=query_interval(electrs_metrics_previous,parsed,now,identity)
    electrs_metrics_previous.update(timestamp=now,identity=identity,requests=parsed['requests'],seconds=parsed['seconds'])
    return {'queriesPerMinute':rate,'meanMs':mean,'requestsTotal':parsed['requests'],'methods':parsed['methods'],'mempoolCount':parsed['mempoolCount'],'mempoolVbytes':parsed['mempoolVbytes'],'history':[]}

def electrs_version():
    result=electrum_call('server.version',['NodeStack','1.4'])
    match=re.search(r'\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?',result[0])
    if not match:
        raise RuntimeError('Version unavailable')
    return {'version':match.group(0)}

def bitcoin_version():
    net,=rpc_batch([('getnetworkinfo',[])])
    return {'version':net['subversion'].strip('/').replace('Satoshi:','Bitcoin Core ')}

def fees():
    data = request(MEMPOOL_URL+'/api/v1/fees/precise')
    keys=['fastestFee','halfHourFee','hourFee','economyFee','minimumFee']
    if any(not isinstance(data.get(key),(int,float)) or data[key]<0 for key in keys):
        raise RuntimeError('Invalid fee response')
    return {key:data[key] for key in keys}

def mempool_version():
    data=request(MEMPOOL_URL+'/api/v1/backend-info')
    return {'version':data.get('version')}

def statistics_trend(samples, now):
    if not isinstance(samples,list):
        raise RuntimeError('Invalid statistics response')
    rows=[]
    for sample in samples:
        timestamp=sample.get('added')
        weight=sample.get('mempool_byte_weight')
        if not isinstance(timestamp,(int,float)) or not isinstance(weight,(int,float)) or weight<0:
            raise RuntimeError('Invalid statistics sample')
        if now-86400<=timestamp<=now+60:
            rows.append({'timestamp':timestamp,'vbytes':weight/4})
    if not rows:
        return {'points':[],'sampleTime':None}
    rows.sort(key=lambda row:row['timestamp'])
    if now-rows[-1]['timestamp']>180:
        raise RuntimeError('Statistics sample is stale')
    # Retain the last actual sample in each five-minute slot for a compact chart.
    slots={int(row['timestamp']//300):row for row in rows}
    return {'points':list(slots.values()),'sampleTime':rows[-1]['timestamp']}

def mempool_trend():
    return statistics_trend(request(MEMPOOL_URL+'/api/v1/statistics/24h'),time.time())

metadata_versions = {}

def containers():
    data = request(DOCKER_URL+'/containers/json?all=1')
    def inspect(item):
        key,name=item
        row=next((r for r in data if '/'+name in r.get('Names',[])),None)
        if row is None:
            return key,None
        detail=request(DOCKER_URL+'/containers/'+row['Id']+'/json')
        runtime=detail['State']
        labels=detail.get('Config',{}).get('Labels') or {}
        tag=row['Image'].rsplit(':',1)[-1] if ':' in row['Image'] else None
        cached=metadata_versions.get(key,{})
        if cached.get('id')!=row['Id'] or time.time()-cached.get('checkedAt',0)>=86400:
            version=labels.get('server-version') or labels.get('org.opencontainers.image.version') or (tag if tag not in ('latest',None) else None)
            metadata_versions[key]={'id':row['Id'],'checkedAt':time.time(),'version':version}
        else:
            version=cached['version']
        return key,{'state':row['State'],'status':row['Status'],'image':row['Image'],'version':version,'startedAt':runtime.get('StartedAt'),'health':runtime.get('Health',{}).get('Status'),'restartCount':detail.get('RestartCount',0),'id':row['Id'][:12]}
    with concurrent.futures.ThreadPoolExecutor(max_workers=7) as executor:
        return dict(executor.map(inspect,CONTAINERS.items()))

def blitzpool_stats():
    paths=['/api/pool','/api/info','/api/health']
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        pool,info,health=list(executor.map(lambda path:request(BLITZPOOL_URL+path),paths))
    rate=pool.get('totalHashRate')
    agents=info.get('userAgents')
    blocks=pool.get('blocksFound')
    if not isinstance(rate,(int,float)) or isinstance(rate,bool) or not math.isfinite(rate) or rate<0 or not isinstance(agents,list) or not isinstance(blocks,list):
        raise RuntimeError('Invalid pool statistics')
    if any(not isinstance(row.get('count'),int) or row['count']<0 for row in agents):
        raise RuntimeError('Invalid session count')
    checks={key:health.get('checks',{}).get(key) for key in ['database','bitcoin','cache','tdp']}
    # The API falls back to zero hashrate during a cache outage; do not show that as real zero.
    live=checks['cache']=='connected'
    best=[row['bestDifficulty'] for row in info.get('highScores',[]) if isinstance(row.get('bestDifficulty'),(int,float)) and math.isfinite(row['bestDifficulty']) and row['bestDifficulty']>=0]
    return {'hashrate':rate if live else None,'miningSessions':sum(row['count'] for row in agents) if live else None,'blocksFound':len(blocks),'bestShareDifficulty':max(best) if best else None,'health':'healthy' if health.get('status')=='healthy' and live else 'degraded','checks':checks}

def blitzpool_history():
    rows=request(BLITZPOOL_URL+'/api/info/chart?range=1d')
    if not isinstance(rows,list):
        raise RuntimeError('Invalid pool history')
    points=[]
    now=time.time()
    for row in rows:
        stamp=datetime.fromisoformat(row['label'].replace('Z','+00:00')).timestamp()
        rate=row['data']
        if not isinstance(rate,(int,float)) or isinstance(rate,bool) or not math.isfinite(rate) or rate<0:
            raise RuntimeError('Invalid historical hashrate')
        if now-86400<=stamp<=now:
            points.append({'timestamp':stamp,'hashrate':rate})
    return {'points':sorted(points,key=lambda point:point['timestamp'])}

def blitzpool_version():
    version=request(BLITZPOOL_URL+'/api/info/version').get('version')
    if not isinstance(version,str) or not version:
        raise RuntimeError('Invalid pool version')
    return {'version':version}

def lnd_request(path, authenticated=False):
    context=ssl.create_default_context(cafile='/run/lnd/tls.cert')
    headers={}
    if authenticated:
        with open('/run/lnd/dashboard.macaroon','rb') as source:
            headers['Grpc-Metadata-macaroon']=source.read().hex()
    req=urllib.request.Request('https://lnd:8080'+path,headers=headers)
    with urllib.request.urlopen(req,timeout=6,context=context) as response:
        return json.load(response)

def lnd_state():
    data=lnd_request('/v1/state')
    valid={'NON_EXISTING','LOCKED','UNLOCKED','RPC_ACTIVE','SERVER_ACTIVE','WAITING_TO_START'}
    if data.get('state') not in valid:
        raise RuntimeError('Invalid LND state')
    return {'state':data['state']}

def lnd_info():
    with lock:
        status=state.get('lndState',{})
        ready=(status.get('status')=='ok' and status.get('data',{}).get('state') in ('RPC_ACTIVE','SERVER_ACTIVE') and time.time()-status.get('lastSuccess',0)<=180)
    if not ready:
        raise RuntimeError('LND is not ready')
    data=lnd_request('/v1/getinfo',authenticated=True)
    fields={'height':'block_height','peers':'num_peers','activeChannels':'num_active_channels','inactiveChannels':'num_inactive_channels','pendingChannels':'num_pending_channels'}
    result={}
    for name,key in fields.items():
        value=data.get(key)
        if not isinstance(value,int) or isinstance(value,bool) or value<0:
            raise RuntimeError('Invalid LND node information')
        result[name]=value
    for name,key in [('chainSynced','synced_to_chain'),('graphSynced','synced_to_graph')]:
        if not isinstance(data.get(key),bool):
            raise RuntimeError('Invalid LND sync state')
        result[name]=data[key]
    return result

def joinmarket_request(path):
    # Only Jam HTTP Basic authentication; no wallet password or wallet JWT.
    config={}
    with open('/run/jam.env') as source:
        for line in source:
            if '=' in line and not line.lstrip().startswith('#'):
                key,value=line.strip().split('=',1)
                value=value.strip()
                if len(value)>=2 and value[0]==value[-1] and value[0] in ('"',"'"):
                    value=value[1:-1]
                config[key.strip()]=value
    password=config['JAM_PASSWORD']
    token=base64.b64encode(('jam:'+password).encode()).decode()
    return request('http://joinmarket-jam:80/api/v1/'+path,headers={'Authorization':'Basic '+token})

def joinmarket_session():
    data=joinmarket_request('session')
    if not all(isinstance(data.get(key),bool) for key in ['maker_running','coinjoin_in_process']):
        raise RuntimeError('Invalid session response')
    return {'makerRunning':data['maker_running'],'coinjoinInProgress':data['coinjoin_in_process']}

def joinmarket_orderbook():
    data=joinmarket_request('obwatch/orderbook.json')
    if not all(isinstance(data.get(key),list) for key in ['offers','fidelitybonds']):
        raise RuntimeError('Invalid orderbook response')
    return {'offers':len(data['offers']),'fidelityBonds':len(data['fidelitybonds'])}

def interface(url):
    try:
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req,timeout=6) as res:
            res.read(1024)
            return {'reachable':True,'httpStatus':res.status,'requiresAuthentication':False}
    except urllib.error.HTTPError as error:
        # A responding authentication challenge is reachable, not authenticated.
        if error.code in (401,403):
            return {'reachable':True,'httpStatus':error.code,'requiresAuthentication':True}
        raise

def tor_proxy():
    with socket.create_connection(('tor',9050),timeout=6) as conn:
        conn.settimeout(6)
        conn.sendall(b'\x05\x01\x00')
        if conn.recv(2) != b'\x05\x00':
            raise RuntimeError('SOCKS handshake failed')
    return {'healthy':True,'endpoint':'tor:9050'}

tor_version_cache = {}

def tor_version():
    # Cache the runtime announcement only for the same container instance.
    detail=request(DOCKER_URL+'/containers/tor/json')
    identity=detail['Id']
    if identity in tor_version_cache:
        return {'version':tor_version_cache[identity]}
    with urllib.request.urlopen(DOCKER_URL+'/containers/'+identity+'/logs?stdout=1&stderr=1&tail=1000',timeout=6) as response:
        text=response.read(2*1024*1024).decode('utf-8',errors='replace')
    matches=re.findall(r'Tor (\d+\.\d+\.\d+\.\d+(?:[-\w]*)?) running on',text)
    if not matches:
        raise RuntimeError('Runtime version announcement unavailable')
    tor_version_cache.clear()
    tor_version_cache[identity]=matches[-1]
    return {'version':matches[-1]}

COLLECTORS = {'bitcoin':bitcoin,'blitzpool':blitzpool_stats,'blitzpoolHistory':blitzpool_history,'blitzpoolVersion':blitzpool_version,'lndState':lnd_state,'lndInfo':lnd_info,'blockHistory':block_history,'electrs':electrs,'electrsMetrics':electrs_metrics,'electrsDbSize':electrs_db_size,'fees':fees,'mempoolVersion':mempool_version,'mempoolTrend':mempool_trend,'containers':containers,'rtl':lambda:interface('http://rtl:3000'),'jam':lambda:interface('http://joinmarket-jam:80'),'joinmarketSession':joinmarket_session,'joinmarketOrderbook':joinmarket_orderbook,'tor':tor_proxy,'torVersion':tor_version,'electrsVersion':electrs_version,'bitcoinVersion':bitcoin_version}

VERSION_SOURCES={'blitzpoolVersion':'blitzpool','bitcoinVersion':'bitcoin','electrsVersion':'electrs','mempoolVersion':'mempool','torVersion':'tor'}
DAILY_SOURCES={**VERSION_SOURCES,'electrsDbSize':'electrs'}
VERSION_SECONDS=86400

def version_identity(name):
    row=(state.get('containers',{}).get('data') or {}).get(DAILY_SOURCES[name])
    return (row['id']+'|'+str(row['startedAt'])) if row else None

def version_due(name, now):
    previous=state.get(name,{})
    identity=version_identity(name)
    return (previous.get('status')!='ok' or now-previous.get('lastSuccess',0)>=VERSION_SECONDS
            or (identity is not None and identity!=previous.get('instance')))

def collect(name):
    now = time.time()
    try:
        data = COLLECTORS[name]()
        with lock:
            state[name] = {'status':'ok','checkedAt':now,'lastSuccess':time.time(),'data':data}
            if name in DAILY_SOURCES:
                state[name]['instance']=version_identity(name)
    except Exception:
        # Never return exception strings: upstream errors can contain sensitive URLs.
        with lock:
            old = state.get(name,{})
            state[name] = {'status':'error','checkedAt':now,'lastSuccess':old.get('lastSuccess'),'data':None,'error':'Source unavailable'}

def event(db, title, detail, service, color='green'):
    db.execute('INSERT INTO events(timestamp,title,detail,service,color) VALUES(?,?,?,?,?)',(time.time(),title,detail,service,color))

def loop():
    os.makedirs(os.path.dirname(DB),exist_ok=True)
    db = sqlite3.connect(DB)
    db.execute('CREATE TABLE IF NOT EXISTS events(timestamp REAL,title TEXT,detail TEXT,service TEXT,color TEXT)')
    db.execute('CREATE TABLE IF NOT EXISTS electrs_activity(timestamp REAL PRIMARY KEY, queries REAL, mean_ms REAL)')
    event(db,'Monitoring started',f'Dashboard collector started; live checks every {INTERVAL} seconds','dashboard','blue')
    db.commit()
    previous = {}
    tick = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=9) as executor:
        while not stop.is_set():
            started=time.monotonic()
            collect('containers')
            collect('lndState')
            with lock:
                names=[n for n in COLLECTORS if n not in ('containers','lndState') and (n not in DAILY_SOURCES or version_due(n,time.time()))]
            list(executor.map(collect,names))
            with lock:
                current = json.loads(json.dumps(state))
            b = current.get('bitcoin',{})
            if b.get('status')=='ok':
                height=b['data']['height']
                if previous.get('height') is not None and height!=previous['height']:
                    event(db,'Chain tip changed',f'Bitcoin height {height:,}','bitcoind')
                previous['height']=height
            for name in COLLECTORS:
                status=current.get(name,{}).get('status')
                if name in previous and previous[name]!=status:
                    event(db,'Source recovered' if status=='ok' else 'Source unavailable',f'{name} monitoring check changed',name,'green' if status=='ok' else 'orange')
                previous[name]=status
            c=current.get('containers',{})
            if c.get('status')=='ok':
                for name,row in c['data'].items():
                    value=None if row is None else (row['id'],row['state'],row['startedAt'],row['health'])
                    key='container:'+name
                    if key in previous and previous[key]!=value:
                        event(db,'Container state changed',f'{name}: {row["state"] if row else "missing"}',name,'blue')
                    previous[key]=value
            metric=current.get('electrsMetrics',{})
            if metric.get('status')=='ok' and metric['data']['queriesPerMinute'] is not None:
                db.execute('INSERT OR REPLACE INTO electrs_activity VALUES(?,?,?)',(metric['checkedAt'],metric['data']['queriesPerMinute'],metric['data']['meanMs']))
            db.execute('DELETE FROM electrs_activity WHERE timestamp < ?',(time.time()-86400,))
            activity=db.execute('SELECT timestamp,queries FROM electrs_activity ORDER BY timestamp').fetchall()
            with lock:
                if state.get('electrsMetrics',{}).get('status')=='ok':
                    state['electrsMetrics']['data']['history']=[{'timestamp':row[0],'queries':row[1]} for row in activity]
            db.execute('DELETE FROM events WHERE timestamp < ?',(time.time()-7*86400,))
            db.commit()
            rows=db.execute('SELECT timestamp,title,detail,service,color FROM events ORDER BY timestamp DESC LIMIT 100').fetchall()
            with lock:
                state['events']=[dict(zip(['timestamp','title','detail','service','color'],r)) for r in rows]
                state['collectedAt']=time.time()
            tick+=1
            stop.wait(max(0,INTERVAL-(time.monotonic()-started)))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ('/api/status','/health'):
            self.send_error(404)
            return
        with lock:
            payload = {'sources':{k:v for k,v in state.items() if k in COLLECTORS},'events':state.get('events',[]),'collectedAt':state.get('collectedAt'),'pollSeconds':INTERVAL,'versionPollSeconds':VERSION_SECONDS} if self.path=='/api/status' else {'ok':True}
        body=json.dumps(payload).encode()
        self.send_response(200)
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self,*args):
        pass

if __name__=='__main__':
    threading.Thread(target=loop,daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0',8000),Handler).serve_forever()
