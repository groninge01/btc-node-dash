export const history = Array.from({ length: 48 }, (_, i) => ({ time: `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, height: 973362 + i * 3 + Math.floor(i / 5), routed: 3000 + ((i * 17311 + 731) % 37000), queries: 45 + ((i * 17 + 11) % 75) }));
export const fees = [1,2,3,5,10,20,50,100].map((fee,i)=>({ fee: `${fee}`, transactions: [9200,15300,21000,14300,8700,4100,1800,400][i] }));
export const events = [
 {time:'2 min ago',title:'New block received',detail:'Block 973,515 · 2,314 transactions',service:'Bitcoin',color:'green'},
 {time:'12 min ago',title:'Channel balance updated',detail:'Remote balance increased by 12,400 sats',service:'Lightning',color:'blue'},
 {time:'24 min ago',title:'Index caught up',detail:'Electrs is synced with the chain tip',service:'Electrs',color:'blue'},
 {time:'38 min ago',title:'CoinJoin completed',detail:'5 participants · 0.042 BTC mixed',service:'JoinMarket',color:'purple'},
 {time:'1 hr ago',title:'Tor connection established',detail:'Bitcoin peer connected over an onion circuit',service:'Tor',color:'purple'},
 {time:'2 hrs ago',title:'Mempool activity increased',detail:'Transaction count increased by 18%',service:'Mempool',color:'orange'},
];
