import { useEffect, useState } from "react";
export type Source<T> = {
  status: "ok" | "error";
  checkedAt: number;
  lastSuccess: number | null;
  data: T | null;
  error?: string;
};
export type BitcoinData = {
  height: number;
  headers: number;
  progress: number;
  initialSync: boolean;
  chainBytes: number;
  pruned: boolean;
  version: string;
  peers: number;
  inbound: number;
  outbound: number;
  onionProxy: string | null;
  onionReachable: boolean;
  mempoolCount: number;
  mempoolVbytes: number;
  mempoolMemory: number;
  blockTime: number;
  hash: string;
};
export type Container = {
  state: string;
  status: string;
  image: string;
  version: string | null;
  startedAt: string | null;
  health: string | null;
  restartCount: number;
  id: string;
};
export type Snapshot = {
  sources: {
    mempoolVersion?: Source<{version:string|null}>;
    bitcoin?: Source<BitcoinData>;
    electrs?: Source<{ height: number }>;
    electrsDbSize?: Source<{bytes:number}>;
    electrsMetrics?: Source<{queriesPerMinute:number|null;meanMs:number|null;requestsTotal:number;methods:Record<string,{count:number;seconds:number}>;mempoolCount:number;mempoolVbytes:number;history:{timestamp:number;queries:number}[]}>;
    electrsVersion?: Source<{version:string}>;
    bitcoinVersion?: Source<{version:string}>;
    fees?: Source<{
      fastestFee: number;
      halfHourFee: number;
      hourFee: number;
      economyFee: number;
      minimumFee: number;
    }>;
    mempoolTrend?: Source<{points: {timestamp:number; vbytes:number}[]; sampleTime:number|null}>;
    blockHistory?: Source<{ timestamp: number; height: number }[]>;
    containers?: Source<Record<string, Container | null>>;
    rtl?: Source<{
      reachable: boolean;
      httpStatus: number;
      requiresAuthentication: boolean;
    }>;
    blitzpool?: Source<{hashrate:number|null;miningSessions:number|null;blocksFound:number;bestShareDifficulty:number|null;health:string;checks:Record<string,string|null>}>;
    blitzpoolHistory?: Source<{points:{timestamp:number;hashrate:number}[]}>;
    blitzpoolVersion?: Source<{version:string}>;
    lndState?: Source<{state:string}>;
    lndInfo?: Source<{height:number;peers:number;activeChannels:number;inactiveChannels:number;pendingChannels:number;chainSynced:boolean;graphSynced:boolean}>;
    joinmarketSession?: Source<{makerRunning:boolean;coinjoinInProgress:boolean}>;
    joinmarketOrderbook?: Source<{offers:number;fidelityBonds:number}>;
    jam?: Source<{
      reachable: boolean;
      httpStatus: number;
      requiresAuthentication: boolean;
    }>;
    torVersion?: Source<{version:string}>;
    tor?: Source<{ healthy: boolean; endpoint: string }>;
  };
  events: {
    timestamp: number;
    title: string;
    detail: string;
    service: string;
    color: string;
  }[];
  collectedAt: number | null;
  pollSeconds: number;
};
export function useLive() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [connected, setConnected] = useState(false),
    [loading, setLoading] = useState(true),
    [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function update() {
      try {
        const response = await fetch("/api/status", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw Error();
        const data = await response.json();
        if (active) {
          setSnapshot(data);
          setConnected(true);
        }
      } catch {
        if (active) setConnected(false);
      } finally {
        if (active) setLoading(false);
      }
    }
    void update();
    const timer = setInterval(update, 60000),
      clock = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      clearInterval(clock);
    };
  }, []);
  return { snapshot, connected, loading, now };
}
export function current<T>(
  source: Source<T> | undefined,
  now: number,
  maxAge = 180,
): T | null {
  return source?.status === "ok" &&
    source.lastSuccess !== null &&
    now - source.lastSuccess <= maxAge
    ? source.data
    : null;
}
export function age(timestamp: number | null | undefined, now: number) {
  if (!timestamp) return "Never";
  const seconds = Math.max(0, Math.floor(now - timestamp));
  return seconds < 60
    ? `${seconds}s ago`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : `${Math.floor(seconds / 3600)}h ago`;
}
export function number(value: number | undefined | null, decimals = 0) {
  return value == null
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: decimals });
}
export function bytes(value: number | undefined | null) {
  return value == null
    ? "—"
    : value >= 1e9
      ? `${(value / 1e9).toFixed(1)} GB`
      : `${(value / 1e6).toFixed(1)} MB`;
}

export function hashrateScale(value:number){
  const units=['H/s','kH/s','MH/s','GH/s','TH/s','PH/s','EH/s'];
  const index=value>0?Math.min(units.length-1,Math.floor(Math.log10(value)/3)):0;
  return {factor:1000**Math.max(0,index),unit:units[Math.max(0,index)]};
}
export function hashrate(value:number|null|undefined){
  if(value==null)return '—';
  const scale=hashrateScale(value);
  return `${number(value/scale.factor,2)} ${scale.unit}`;
}
