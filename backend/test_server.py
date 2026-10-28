import io
import json
import tempfile
import unittest
import urllib.error
from unittest.mock import patch
import server

class CollectorTests(unittest.TestCase):
    def setUp(self):
        server.state.clear()

    def test_failed_source_clears_data_preserves_last_success_and_sanitizes_error(self):
        server.state['bitcoin']={'status':'ok','data':{'height':1},'lastSuccess':123}
        server.state['electrs']={'status':'ok','data':{'height':1}}
        with patch.dict(server.COLLECTORS,{'bitcoin':lambda:(_ for _ in ()).throw(RuntimeError('secret password'))}):
            server.collect('bitcoin')
        result=server.state['bitcoin']
        self.assertEqual(result['status'],'error')
        self.assertIsNone(result['data'])
        self.assertEqual(result['lastSuccess'],123)
        self.assertNotIn('secret',json.dumps(result))
        self.assertEqual(server.state['electrs']['status'],'ok')

    def test_jam_authentication_challenge_counts_as_reachable(self):
        error=urllib.error.HTTPError('http://jam',401,'Unauthorized',{},None)
        with patch('server.urllib.request.urlopen',side_effect=error):
            result=server.interface('http://jam')
        self.assertTrue(result['reachable'])
        self.assertTrue(result['requiresAuthentication'])
        self.assertEqual(result['httpStatus'],401)

    def test_server_failure_does_not_count_as_reachable(self):
        error=urllib.error.HTTPError('http://jam',500,'Error',{},None)
        with patch('server.urllib.request.urlopen',side_effect=error):
            with self.assertRaises(urllib.error.HTTPError):
                server.interface('http://jam')

    def test_bitcoin_batches_are_matched_by_id_not_response_order(self):
        with tempfile.NamedTemporaryFile(mode='w+') as config:
            config.write('rpcuser=test\nrpcpassword=private\n');config.flush()
            with patch('server.CONFIG',config.name),patch('server.request',return_value=[{'id':1,'result':2},{'id':0,'result':1}]) as request:
                self.assertEqual(server.rpc_batch([('getblockcount',[]),('getconnectioncount',[])]),[1,2])
                self.assertEqual(request.call_args.args[1][0]['method'],'getblockcount')

    def test_precise_fee_rates_are_preserved(self):
        fees={'fastestFee':1.605,'halfHourFee':0.868,'hourFee':0.371,'economyFee':0.2,'minimumFee':0.1}
        with patch('server.request',return_value=fees) as request:
            self.assertEqual(server.fees(),fees)
            self.assertTrue(request.call_args.args[0].endswith('/fees/precise'))

    def test_trend_converts_weight_to_vbytes_and_sorts_samples(self):
        samples=[{'added':1000,'mempool_byte_weight':8000000},{'added':600,'mempool_byte_weight':4000000}]
        result=server.statistics_trend(samples,1060)
        self.assertEqual(result['points'],[{'timestamp':600,'vbytes':1000000},{'timestamp':1000,'vbytes':2000000}])
        self.assertEqual(result['sampleTime'],1000)

    def test_trend_retains_latest_real_sample_per_five_minute_slot(self):
        samples=[{'added':1000,'mempool_byte_weight':400},{'added':1060,'mempool_byte_weight':800}]
        self.assertEqual(server.statistics_trend(samples,1100)['points'],[{'timestamp':1060,'vbytes':200}])

    def test_old_trend_samples_are_excluded(self):
        samples=[{'added':1,'mempool_byte_weight':400},{'added':100000,'mempool_byte_weight':800}]
        self.assertEqual(len(server.statistics_trend(samples,100060)['points']),1)

    def test_stale_trend_is_rejected(self):
        with self.assertRaises(RuntimeError):
            server.statistics_trend([{'added':1000,'mempool_byte_weight':4}],1181)

    def test_missing_trend_is_not_replaced_with_fake_data(self):
        self.assertEqual(server.statistics_trend([],1000),{'points':[],'sampleTime':None})

class ElectrsMonitoringTests(unittest.TestCase):
    def test_metrics_parse_method_and_mempool_totals(self):
        text='\n'.join(['electrs_rpc_duration_count{method="server.ping"} 2','electrs_rpc_duration_sum{method="server.ping"} 0.002','electrs_rpc_duration_count{method="blockchain.scripthash.get_history"} 3','electrs_rpc_duration_sum{method="blockchain.scripthash.get_history"} 0.06','electrs_mempool_txs_count{fee_rate="[0, 1)"} 10','electrs_mempool_txs_count{fee_rate="[1, 2)"} 20','electrs_mempool_txs_vsize{fee_rate="[0, 1)"} 1234'])
        result=server.parse_electrs_metrics(text)
        self.assertEqual(result['requests'],5)
        self.assertAlmostEqual(result['seconds'],0.062)
        self.assertEqual(result['mempoolCount'],30)
        self.assertEqual(result['mempoolVbytes'],1234)

    def test_batched_electrum_method_labels_are_supported(self):
        text='electrs_rpc_duration_count{method="blockchain.scripthash.subscribe:multi"} 4\nelectrs_rpc_duration_sum{method="blockchain.scripthash.subscribe:multi"} 0.008'
        self.assertEqual(server.parse_electrs_metrics(text)['requests'],4)

    def test_rate_and_latency_use_interval_deltas(self):
        previous={'timestamp':100,'identity':'same','requests':100,'seconds':1}
        current={'requests':130,'seconds':1.6}
        rate,mean=server.query_interval(previous,current,160,'same')
        self.assertEqual(rate,30)
        self.assertAlmostEqual(mean,20)

    def test_first_sample_or_restart_requires_new_baseline(self):
        sample={'requests':130,'seconds':1.6}
        previous={'timestamp':100,'identity':'old','requests':100,'seconds':1}
        self.assertEqual(server.query_interval({},sample,160,'new'),(None,None))
        self.assertEqual(server.query_interval(previous,sample,160,'new'),(None,None))

    def test_counter_reset_and_long_gap_do_not_make_fake_rates(self):
        previous={'timestamp':100,'identity':'same','requests':100,'seconds':1}
        self.assertEqual(server.query_interval(previous,{'requests':1,'seconds':0.1},160,'same'),(None,None))
        self.assertEqual(server.query_interval(previous,{'requests':200,'seconds':2},400,'same'),(None,None))

    def test_idle_interval_has_zero_rate_but_no_latency(self):
        previous={'timestamp':100,'identity':'same','requests':100,'seconds':1}
        self.assertEqual(server.query_interval(previous,previous,160,'same'),(0,None))

    def test_allocated_size_counts_hardlinked_files_once(self):
        import os
        with tempfile.TemporaryDirectory() as path:
            filename=os.path.join(path,'index')
            with open(filename,'wb') as f:f.write(b'x'*8192)
            os.link(filename,os.path.join(path,'second'))
            expected=(os.lstat(path).st_blocks+os.lstat(filename).st_blocks)*512
            self.assertEqual(server.allocated_size(path),expected)

class BlitzPoolTests(unittest.TestCase):
    def response(self,url):
        if url.endswith('/api/pool'):
            return {'totalHashRate':1.25e12,'totalMiners':999,'blocksFound':[{'minerAddress':'private'}]}
        if url.endswith('/api/info'):
            return {'userAgents':[{'count':2},{'count':1}],'highScores':[{'bestDifficulty':12345,'address':'private'}]}
        if url.endswith('/api/health'):
            return {'status':'healthy','checks':{'database':'connected','bitcoin':'connected','cache':'connected','tdp':None}}
        raise AssertionError(url)

    def test_pool_uses_active_sessions_and_filters_private_fields(self):
        with patch('server.request',side_effect=self.response):result=server.blitzpool_stats()
        self.assertEqual(result['hashrate'],1.25e12)
        self.assertEqual(result['miningSessions'],3)
        self.assertEqual(result['blocksFound'],1)
        self.assertEqual(result['bestShareDifficulty'],12345)
        self.assertIsNone(result['checks']['tdp'])
        self.assertNotIn('private',json.dumps(result))

    def test_cache_outage_is_not_reported_as_zero_hashrate(self):
        def response(url):
            data=self.response(url)
            if url.endswith('/api/health'):data['checks']['cache']='disconnected'
            if url.endswith('/api/pool'):data['totalHashRate']=0
            return data
        with patch('server.request',side_effect=response):result=server.blitzpool_stats()
        self.assertIsNone(result['hashrate'])
        self.assertIsNone(result['miningSessions'])
        self.assertEqual(result['health'],'degraded')

    def test_true_zero_hashrate_is_preserved_with_healthy_cache(self):
        def response(url):
            data=self.response(url)
            if url.endswith('/api/pool'):data['totalHashRate']=0
            return data
        with patch('server.request',side_effect=response):self.assertEqual(server.blitzpool_stats()['hashrate'],0)

    def test_empty_pool_history_stays_empty(self):
        with patch('server.request',return_value=[]):self.assertEqual(server.blitzpool_history(),{'points':[]})

class LndTests(unittest.TestCase):
    def setUp(self):
        server.state.clear()

    def test_state_is_read_without_wallet_authentication(self):
        with patch('server.lnd_request',return_value={'state':'LOCKED'}) as request:
            self.assertEqual(server.lnd_state(),{'state':'LOCKED'})
            request.assert_called_once_with('/v1/state')

    def test_locked_wallet_does_not_trigger_authenticated_node_query(self):
        server.state['lndState']={'status':'ok','lastSuccess':server.time.time(),'data':{'state':'LOCKED'}}
        with patch('server.lnd_request') as request:
            with self.assertRaises(RuntimeError):server.lnd_info()
            request.assert_not_called()

    def test_unlocked_info_uses_read_only_auth_and_filters_fields(self):
        server.state['lndState']={'status':'ok','lastSuccess':server.time.time(),'data':{'state':'SERVER_ACTIVE'}}
        response={'block_height':973000,'num_peers':0,'num_active_channels':0,'num_inactive_channels':2,'num_pending_channels':1,'synced_to_chain':True,'synced_to_graph':False,'identity_pubkey':'private','alias':'private'}
        with patch('server.lnd_request',return_value=response) as request:
            result=server.lnd_info()
            request.assert_called_once_with('/v1/getinfo',authenticated=True)
        self.assertEqual(result,{'height':973000,'peers':0,'activeChannels':0,'inactiveChannels':2,'pendingChannels':1,'chainSynced':True,'graphSynced':False})

    def test_missing_fields_are_unavailable_instead_of_fabricated_zeroes(self):
        server.state['lndState']={'status':'ok','lastSuccess':server.time.time(),'data':{'state':'SERVER_ACTIVE'}}
        with patch('server.lnd_request',return_value={}):
            with self.assertRaises(RuntimeError):server.lnd_info()

class JoinMarketTests(unittest.TestCase):
    def test_session_exposes_only_requested_status_flags(self):
        data={'maker_running':True,'coinjoin_in_process':False,'wallet_name':'private','nickname':'private','schedule':[[1,2]]}
        with patch('server.joinmarket_request',return_value=data) as request:
            self.assertEqual(server.joinmarket_session(),{'makerRunning':True,'coinjoinInProgress':False})
            request.assert_called_once_with('session')

    def test_invalid_session_cannot_be_reported_as_idle(self):
        with patch('server.joinmarket_request',return_value={}):
            with self.assertRaises(RuntimeError):server.joinmarket_session()

    def test_orderbook_exposes_counts_without_offer_details(self):
        data={'offers':[{'counterparty':'private'}]*3,'fidelitybonds':[{'proof':'private'}]*2}
        with patch('server.joinmarket_request',return_value=data):
            self.assertEqual(server.joinmarket_orderbook(),{'offers':3,'fidelityBonds':2})

    def test_empty_orderbook_counts_are_zero_not_unavailable(self):
        with patch('server.joinmarket_request',return_value={'offers':[],'fidelitybonds':[]}):
            self.assertEqual(server.joinmarket_orderbook(),{'offers':0,'fidelityBonds':0})

class ScheduleTests(unittest.TestCase):
    def setUp(self):
        server.state.clear()
        server.state['containers']={'data':{'tor':{'id':'same','startedAt':'start'}}}
        server.state['torVersion']={'status':'ok','lastSuccess':200000,'instance':'same|start'}

    def test_versions_are_not_due_during_the_daily_interval(self):
        self.assertFalse(server.version_due('torVersion',200060))
        self.assertFalse(server.version_due('torVersion',286399))

    def test_versions_are_due_after_one_day(self):
        self.assertTrue(server.version_due('torVersion',286400))

    def test_container_changes_refresh_versions_without_waiting_a_day(self):
        server.state['containers']['data']['tor']['id']='replacement'
        self.assertTrue(server.version_due('torVersion',200060))

    def test_failed_checks_retry_on_the_next_live_cycle(self):
        server.state['torVersion']['status']='error'
        self.assertTrue(server.version_due('torVersion',200060))

if __name__=='__main__':unittest.main()
