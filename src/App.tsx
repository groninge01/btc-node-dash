import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Bitcoin,
  Pickaxe,
  Home,
  Server,
  Wallet,
  Zap,
  Shield,
  Search,
  Settings,
  Bell,
  ChevronUp,
  ChevronRight,
  ChevronsLeft,
  Database,
  Globe,
  Activity,
  ArrowRight,
  Menu,
  X,
  Box,
  Users,
  FileText,
  Network,
  Route,
  Waves,
  MoreVertical,
  Wifi,
  Orbit,
  ChartNoAxesColumnIncreasing,
  Blocks,
  LockKeyhole,
  type LucideIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { Button } from "./components/ui/button";
import { useLive, current, age, number, bytes, hashrate, hashrateScale, type Source } from "./live";
const orange = "#ff8105",
  blue = "#0796ff";
const points = Array.from({ length: 49 }, (_, i) => ({
  time: ["18:00", "00:00", "06:00", "12:00", "18:00"][
    Math.min(4, Math.floor(i / 12))
  ],
  height: 848990 + i * 7 + Math.floor(i / 7) * 3,
  routed: [
    28000, 162000, 145000, 190000, 170000, 132000, 128000, 84000, 183000,
    280000, 204000, 127000, 59000, 130000, 78000, 94000, 58000, 78000, 66000,
    40000, 66000, 35000, 46000, 76000, 39000, 105000, 48000, 110000, 79000,
    58000, 54000, 93000, 124000, 175000, 93000, 74000, 85000, 61000, 45000,
    76000, 53000, 65000, 54000, 66000, 39000, 57000, 64000, 44000, 56000,
  ][i],
  queries: 50 + ((i * 19 + 17) % 61) + (i % 7 === 0 ? 50 : 0),
}));
const feeData = [
  15000, 24000, 30000, 19000, 10000, 5800, 3900, 2300, 1000, 400,
].map((transactions, i) => ({
  fee: ["1", "2", "5", "10", "20", "50", "100", "200", "500", "1k+"][i],
  transactions,
}));
const serviceNames = [
  "bitcoind",
  "Lightning",
  "JoinMarket",
  "BlitzPool",
  "Tor",
  "Mempool",
  "Electrs",
];
function Status({ children = "Online" }: { children?: ReactNode }) {
  return (
    <span
      className={`status ${/unavailable|offline|stale|error|not connected|partial|degraded|loading|locked|starting|waiting|no wallet/i.test(String(children)) ? "uncertain" : ""}`}
    >
      <span>●</span>
      {children}
    </span>
  );
}
function Tile({
  icon: Icon,
  color = "orange",
  round = false,
}: {
  icon: LucideIcon;
  color?: string;
  round?: boolean;
}) {
  return (
    <span className={`tile ${color} ${round ? "round" : ""}`}>
      <Icon strokeWidth={2} />
    </span>
  );
}
function Stat({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
      {children}
    </div>
  );
}
function Graph({
  kind = "height",
  label,
  aside,
  liveData,
  unit,
}: {
  kind?: string;
  label: string;
  aside?: string;
  unit?: string;
  liveData?: Record<string, string | number>[] | null;
}) {
  const fee = kind === "fees",
    bar = fee || kind === "routed";
  const chartData = liveData === undefined ? points : liveData || [];
  const barData: Record<string, string | number>[] =
    liveData === undefined ? (fee ? feeData : points) : liveData || [];
  if (liveData !== undefined && !liveData?.length)
    return (
      <div className={`graph ${kind}`}>
        <div className="graph-title">{label}</div>
        <div className="empty-chart">
          {liveData === null
            ? "Source unavailable"
            : kind === "fees"
              ? "No statistics samples available"
              : kind === "queries"
                ? "Collecting query history"
                : "No data available yet"}
        </div>
      </div>
    );
  return (
    <div className={`graph ${kind}`}>
      <div className="graph-title">
        {label}
        <small>{aside}</small>
      </div>
      <div className="plot">
        <ResponsiveContainer width="100%" height="100%">
          {bar ? (
            <BarChart
              data={barData}
              margin={{ left: -20, right: 5, top: 8, bottom: 0 }}
            >
              <CartesianGrid stroke="#26374755" vertical={false} />
              <XAxis
                dataKey={fee ? "fee" : "time"}
                ticks={fee ? undefined : undefined}
                interval={fee ? 0 : 11}
                tick={{ fill: "#a7bbd3", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={
                  liveData === undefined
                    ? [0, fee ? 30000 : 400000]
                    : [0, "auto"]
                }
                ticks={
                  liveData === undefined
                    ? fee
                      ? [0, 10000, 20000, 30000]
                      : [0, 200000, 400000]
                    : undefined
                }
                tickFormatter={(v) => v === 0 ? "0" : v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : `${Math.round(v/1000)}k`}
                tick={{ fill: "#a7bbd3", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={(value, entries) => fee && liveData !== undefined ? `${entries?.[0]?.payload?.range || value} effective sat/vB` : value}
                formatter={(value) => fee && liveData !== undefined ? [`${Number(value).toLocaleString()} vB`, "Virtual size"] : [value, "Sats routed"]}
                contentStyle={{
                  background: "#0b171f",
                  border: "1px solid #243540",
                  borderRadius: 7,
                  fontSize: 11,
                }}
              />
              <Bar
                dataKey={
                  fee
                    ? liveData === undefined
                      ? "transactions"
                      : "vbytes"
                    : "routed"
                }
                fill={orange}
                isAnimationActive={false}
              >
                {fee &&
                  barData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        [
                          "#ffb915",
                          "#ffb012",
                          "#ffaa08",
                          "#ff790a",
                          "#ff5d14",
                          "#f4451a",
                          "#f03423",
                          "#c82a20",
                          "#9b2722",
                          "#6e2424",
                        ][i]
                      }
                    />
                  ))}
              </Bar>
            </BarChart>
          ) : (
            <AreaChart
              data={chartData}
              margin={{
                left: kind === "height" ? 0 : -20,
                right: 5,
                top: 10,
                bottom: 0,
              }}
            >
              <defs>
                <linearGradient
                  id={`gradient-${kind}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={orange}
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="100%"
                    stopColor={orange}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#26374755" />
              <XAxis
                dataKey={liveData === undefined ? "time" : "timestamp"}
                type={liveData === undefined ? "category" : "number"}
                scale={liveData === undefined ? "auto" : "time"}
                domain={liveData === undefined ? undefined : ["dataMin", "dataMax"]}
                tickFormatter={liveData === undefined ? undefined : value => new Date(value).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit",hour12:false})}
                interval={liveData === undefined ? 11 : "preserveStartEnd"}
                minTickGap={45}
                tick={{ fill: "#a7bbd3", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={
                  liveData !== undefined
                    ? (kind === "mempoolSize" || kind === "poolHashrate" || kind === "queries") ? [0, "auto"] : ["dataMin - 1", "dataMax + 1"]
                    : kind === "height"
                      ? [848800, 849400]
                      : [0, 200]
                }
                ticks={
                  liveData === undefined
                    ? kind === "height"
                      ? [848800, 849000, 849200, 849400]
                      : [0, 100, 200]
                    : undefined
                }
                tickFormatter={(v) => (kind === "mempoolSize" || kind === "poolHashrate") ? number(v, 1) : v.toLocaleString("en-US")}
                tick={{ fill: "#a7bbd3", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={kind === "height" ? 57 : 55}
              />
              <Tooltip
                formatter={kind === "mempoolSize" ? value => [`${number(Number(value), 2)} MvB`, "Virtual size"] : kind === "poolHashrate" ? value => [`${number(Number(value), 2)} ${unit}`, "Pool hashrate"] : kind === "queries" ? value => [number(Number(value),1), "Queries / min"] : undefined}
                labelFormatter={value => liveData !== undefined ? new Date(Number(value)).toLocaleString([], {hour12: false}) : value}
                contentStyle={{
                  background: "#0b171f",
                  border: "1px solid #243540",
                  borderRadius: 7,
                  fontSize: 11,
                }}
              />
              <Area
                dataKey={kind}
                name={kind === "mempoolSize" ? "Virtual size (MvB)" : kind === "poolHashrate" ? "Pool hashrate" : undefined}
                type={liveData !== undefined && kind === "height" ? "stepAfter" : "linear"}
                stroke={orange}
                strokeWidth={2}
                fill={`url(#gradient-${kind})`}
                isAnimationActive={false}
                dot={chartData.length===1?{r:3}:false}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
function Card({
  name,
  version,
  icon,
  color,
  children,
  onOpen,
  status,
}: {
  name: string;
  version: string;
  icon: LucideIcon;
  color?: string;
  children: ReactNode;
  onOpen: () => void;
  status?: string;
}) {
  return (
    <article className="card">
      <header>
        <Tile icon={icon} color={color} round />
        <div>
          <h2>{name}</h2>
          <small>{version}</small>
        </div>
        <Status>{status || "Online"}</Status>
        <button
          className="more"
          aria-label={`${name} information`}
          onClick={onOpen}
        >
          <MoreVertical size={20} />
        </button>
      </header>
      {children}
    </article>
  );
}
function Spark({
  color = "green",
  line = false,
}: {
  color?: string;
  line?: boolean;
}) {
  return line ? (
    <svg className="spark" viewBox="0 0 72 38">
      <path
        d="M2 36L8 29 14 30 20 20 26 24 32 29 38 23 44 15 50 19 56 16 62 10 70 2"
        fill="none"
        stroke="#ff8506"
        strokeWidth="1.8"
      />
      <path
        d="M2 36L8 29 14 30 20 20 26 24 32 29 38 23 44 15 50 19 56 16 62 10 70 2V38H2Z"
        fill="#ff85061a"
      />
    </svg>
  ) : (
    <div className={`spark bars ${color}`}>
      {[5, 10, 14, 18, 21, 28, 25, 34].map((h, i) => (
        <i style={{ height: h }} key={i} />
      ))}
    </div>
  );
}
export default function App() {
  const { snapshot, connected, loading, now } = useLive();
  const sources = snapshot?.sources;
  const b = connected ? current(sources?.bitcoin, now) : null;
  const e = connected ? current(sources?.electrs, now) : null;
  const electrsMetrics = connected ? current(sources?.electrsMetrics, now) : null;
  const electrsDbSize = connected ? current(sources?.electrsDbSize, now, 86580) : null;
  const f = connected ? current(sources?.fees, now) : null;
  const t = connected ? current(sources?.tor, now) : null;
  const containers = connected ? current(sources?.containers, now) : null;
  const mempoolTrend = connected ? current(sources?.mempoolTrend, now) : null;
  const blitzpool = connected ? current(sources?.blitzpool, now) : null;
  const blitzpoolHistory = connected ? current(sources?.blitzpoolHistory, now) : null;
  const poolScale = hashrateScale(Math.max(blitzpool?.hashrate||0,...(blitzpoolHistory?.points.map(point=>point.hashrate)||[0])));
  const lndState = connected ? current(sources?.lndState, now) : null;
  const lndInfo = connected ? current(sources?.lndInfo, now) : null;
  const lndStateLabel = lndState ? ({NON_EXISTING:"No wallet",LOCKED:"Locked",UNLOCKED:"Starting",RPC_ACTIVE:"RPC ready",SERVER_ACTIVE:"Ready",WAITING_TO_START:"Waiting"} as Record<string,string>)[lndState.state] || "Unavailable" : "Unavailable";
  const lndUnavailable = lndState?.state === "LOCKED" ? "LND is locked" : "Monitoring data unavailable";
  const joinmarketSession = connected ? current(sources?.joinmarketSession, now) : null;
  const joinmarketOrderbook = connected ? current(sources?.joinmarketOrderbook, now) : null;
  const bh = connected ? current(sources?.blockHistory, now, 180) : null;
  const behind = b && e ? Math.max(0, b.height - e.height) : null;
  const containerStatus = (key: string) => {
    const c = containers?.[key];
    return !containers
      ? "Unavailable"
      : !c
        ? "Missing"
        : c.state === "running"
          ? "Running"
          : c.state;
  };
  const image = (key: string) =>
    containers?.[key]?.image || "Version unavailable";
  const liveEvents = (snapshot?.events || [])
    .slice(0, 6)
    .map((row) => [
      eventTime(row.timestamp),
      row.title,
      row.detail,
      row.service,
      row.color,
    ]);
  const detailKey = detailNameToSource;
  const [mobile, setMobile] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [detail, setDetail] = useState<string | null>(null),
    [query, setQuery] = useState("");
  const [groups, setGroups] = useState<Record<string, boolean>>({});
  const open = (name: string) => {
    setDetail(name);
    setMobile(false);
  };
  const navGroups: {
    name: string;
    icon: LucideIcon;
    items: [string, LucideIcon][];
  }[] = [
    {
      name: "Services",
      icon: Box,
      items: [
        ["bitcoind", Bitcoin],
        ["Lightning", Zap],
        ["JoinMarket", LayersIcon],
        ["BlitzPool", Pickaxe],
        ["Mempool", ChartNoAxesColumnIncreasing],
        ["Electrs", Database],
      ],
    },
    {
      name: "Wallet",
      icon: Wallet,
      items: [
        ["On-Chain (Core)", Wallet],
        ["Lightning (LND)", Zap],
        ["JoinMarket", LockKeyhole],
      ],
    },
    {
      name: "Lightning",
      icon: Zap,
      items: [
        ["Channel Graph", Network],
        ["Peers", Users],
        ["Routing (RTL)", Route],
        ["Liquidity", Waves],
      ],
    },
    {
      name: "Privacy",
      icon: Shield,
      items: [
        ["Tor Status", Orbit],
        ["Network", Globe],
        ["Privacy Metrics", Shield],
      ],
    },
    {
      name: "Explorer",
      icon: Search,
      items: [
        ["Blocks", Blocks],
        ["Transactions", Server],
        ["Search", Search],
      ],
    },
    { name: "Logs", icon: FileText, items: [["System Logs", FileText]] },
  ];
  return (
    <div className={`app ${collapsed ? "nav-collapsed" : ""}`}>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a href="#overview" className="brand">
          <Bitcoin />
          <span>
            <b>NodeStack</b>
            <small>Bitcoin Node Dashboard</small>
          </span>
        </a>
        <button
          className="sidebar-toggle"
          aria-label={mobile ? "Close navigation" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => {
            if (mobile) {
              setMobile(false);
            } else {
              setCollapsed(!collapsed);
            }
          }}
        >
          {mobile ? <X size={20} /> : <ChevronsLeft size={20} />}
        </button>
        <nav>
          <button
            className="overview active"
            onClick={() => {
              setMobile(false);
              document.getElementById("overview")?.scrollIntoView();
            }}
          >
            <Home />
            <span>Overview</span>
          </button>
          {navGroups.map((g) => (
            <div className="nav-group" key={g.name}>
              <button
                className="group-heading"
                aria-expanded={!groups[g.name]}
                onClick={() =>
                  setGroups({ ...groups, [g.name]: !groups[g.name] })
                }
              >
                <g.icon />
                <span>{g.name}</span>
                <ChevronUp className={groups[g.name] ? "flipped" : ""} />
              </button>
              {!groups[g.name] && (
                <div className="nav-children">
                  {g.items.map(([name, Icon]) => (
                    <button key={name} onClick={() => open(name)}>
                      <Icon
                        className={
                          g.name === "Services"
                            ? `service-icon service-${name.toLowerCase()}`
                            : ""
                        }
                      />
                      <span>{name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <button
            className="group-heading settings"
            onClick={() => open("Settings")}
          >
            <Settings />
            <span>Settings</span>
          </button>
        </nav>
      </aside>
      {mobile && (
        <button
          className="shade"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Open navigation"
            aria-expanded={mobile}
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <Server className="server-icon" />
          <span className="node-name">
            <i className="dot" />
            bitcoin-ct.local
          </span>
          <Status>
            {loading
              ? "Loading"
              : !connected
                ? "Offline"
                : b && e && f && t && containers
                  ? "Live"
                  : "Partial"}
          </Status>
          <span className="last-updated">
            Updated: {age(snapshot?.collectedAt, now)}
          </span>
          <div className="top-tools">
            <div className="search">
              <Search size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                aria-label="Search services"
              />
              {query && (
                <div className="search-results">
                  {serviceNames
                    .filter((s) =>
                      s.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          open(s);
                          setQuery("");
                        }}
                      >
                        {s}
                        <ChevronRight size={14} />
                      </button>
                    ))}
                  {!serviceNames.some((s) =>
                    s.toLowerCase().includes(query.toLowerCase()),
                  ) && <span>No services found</span>}
                </div>
              )}
              <kbd>⌘ K</kbd>
            </div>
            <button
              className="notification"
              aria-label="Notifications"
              onClick={() => open("Notifications")}
            >
              <Bell />
            </button>
            <button
              className="profile"
              aria-label="Node information"
              onClick={() => open("Node information")}
            >
              <Bitcoin />
            </button>
            <ChevronRight size={10} />
          </div>
        </header>
        <main id="overview">
          <section className="summary-grid">
            <div className="summary sync">
              <Tile icon={Box} />
              <div>
                <span>Blockchain Sync</span>
                <strong>
                  {number(b?.height)}
                </strong>
                <small className="sync-status">{b ? (!b.initialSync && b.height===b.headers ? 'At chain tip' : `Syncing… (${number(Math.min(b.progress,99.99),2)}%)`) : 'Unavailable'}</small>
              </div>

            </div>
            <div className="summary">
              <Tile icon={Pickaxe}/>
              <div>
                <span>BlitzPool Hashrate</span>
                <strong>{hashrate(blitzpool?.hashrate)}</strong>
                <small>{blitzpool?.hashrate==null ? "Hashrate unavailable" : `${number(blitzpool.miningSessions)} mining session${blitzpool.miningSessions===1?'':'s'}`}</small>
              </div>
            </div>
            <div className="summary">
              <Tile icon={Zap} />
              <div>
                <span>Lightning Status</span>
                <strong>{lndStateLabel}</strong>
                <small>{lndInfo ? `${number(lndInfo.activeChannels)} active channels` : lndUnavailable}</small>
              </div>
            </div>
            <div className="summary">
              <Tile icon={Wifi} color="green" />
              <div>
                <span>Tor Proxy</span>
                <strong>{t ? "Healthy" : "Unavailable"}</strong>
                <small>
                  {t ? "SOCKS handshake verified" : "Check unavailable"}
                </small>
              </div>
            </div>
            <div className="summary">
              <Tile icon={FileText} />
              <div>
                <span>Mempool Load</span>
                <strong>{number(b?.mempoolCount)} txs</strong>
                <small>{bytes(b?.mempoolVbytes)} vsize</small>
              </div>
            </div>
            <div className="summary">
              <Tile icon={Database} color="blue" />
              <div>
                <span>Electrs Indexer Height</span>
                <strong>{number(e?.height)}</strong>
                <small>
                  {behind === null
                    ? "Lag unavailable"
                    : behind === 0
                      ? "At chain tip"
                      : `(${behind} behind)`}
                </small>
              </div>
            </div>
          </section>
          <section className="service-grid">
            <Card
              name="bitcoind"
              version={connected ? current(sources?.bitcoinVersion, now, 86580)?.version || "Bitcoin Core · version unavailable" : "Bitcoin Core · version unavailable"}
              icon={Bitcoin}
              status={
                b ? (b.initialSync ? "Syncing" : "Online") : "Unavailable"
              }
              onOpen={() => open("bitcoind")}
            >
              <div className="stats bitcoin-stats">
                <Stat label="Block Height" value={<>{number(b?.height)}{b&&<span className="block-age" title={new Date(b.blockTime*1000).toLocaleString([], {hour12:false})}>({Math.max(0,Math.floor((now-b.blockTime)/60))===0?'less than 1 min ago':`${Math.max(0,Math.floor((now-b.blockTime)/60))} min${Math.max(0,Math.floor((now-b.blockTime)/60))===1?'':'s'} ago`})</span>}</>}/>
                <Stat
                  label="Chain Data"
                  value={bytes(b?.chainBytes)}
                  sub={b ? (b.pruned ? "Pruned" : "Unpruned") : "Unavailable"}
                />
              </div>
              <Graph
                label="Block Height · Last 24h"
                liveData={
                  bh?.map((row) => ({
                    height: row.height,
                    timestamp: row.timestamp * 1000,
                    time: new Date(row.timestamp * 1000).toLocaleTimeString(
                      [],
                      { hour: "2-digit", minute: "2-digit", hour12: false },
                    ),
                  })) || null
                }
              />
            </Card>
            <Card
              name="Lightning"
              version={`LND ${containers?.lightning?.version || "version unavailable"}`}
              status={lndStateLabel}
              icon={Zap}
              color="yellow"
              onOpen={() => open("Lightning")}
            >
              <div className="stats two lightning-state">
                <Stat label="Wallet State" value={lndStateLabel} sub={lndState?.state === "LOCKED" ? "Unlock required for node data" : "Reported by LND"}/>
                <Stat label="Chain Sync" value={lndInfo ? (lndInfo.chainSynced ? "Synced" : "Syncing") : "—"} sub={lndInfo ? `Block ${number(lndInfo.height)}` : lndUnavailable}/>
              </div>
              <div className="stats two lightning-sync">
                <Stat label="Graph Sync" value={lndInfo ? (lndInfo.graphSynced ? "Synced" : "Syncing") : "—"} sub={lndInfo ? "Public channel graph" : lndUnavailable}/>
                <Stat label="Connected Peers" value={number(lndInfo?.peers)} sub={lndInfo ? "Lightning peers" : lndUnavailable}/>
              </div>
              <div className="lightning-channels">
                <div className="graph-title">Channels</div>
                <div className="stats lightning-channel-counts">
                  <Stat label="Active" value={number(lndInfo?.activeChannels)}/>
                  <Stat label="Inactive" value={number(lndInfo?.inactiveChannels)}/>
                  <Stat label="Pending" value={number(lndInfo?.pendingChannels)}/>
                </div>
              </div>
            </Card>
            <Card
              name="JoinMarket"
              version={`JoinMarket ${containers?.joinmarket?.version || "version unavailable"}`}
              status={joinmarketSession && joinmarketOrderbook ? "API online" : joinmarketSession || joinmarketOrderbook ? "Partial" : "Unavailable"}
              icon={Orbit}
              color="purple"
              onOpen={() => open("JoinMarket")}
            >
              <div className="stats two joinmarket-status">
                <Stat label="Maker" value={joinmarketSession ? (joinmarketSession.makerRunning ? "Running" : "Stopped") : "—"} sub={joinmarketSession ? (joinmarketSession.makerRunning ? "Market maker active" : "Not currently making") : "Status unavailable"}/>
                <Stat label="CoinJoin" value={joinmarketSession ? (joinmarketSession.coinjoinInProgress ? "In progress" : "Idle") : "—"} sub={joinmarketSession ? (joinmarketSession.coinjoinInProgress ? "Taker active" : "No CoinJoin in progress") : "Status unavailable"}/>
              </div>
              <div className="joinmarket-market">
                <div className="graph-title">Market Orderbook <small>Market totals</small></div>
                <div className="stats two">
                  <Stat label="Offers" value={number(joinmarketOrderbook?.offers)}/>
                  <Stat label="Fidelity Bonds" value={number(joinmarketOrderbook?.fidelityBonds)}/>
                </div>
                <p>{joinmarketOrderbook ? "Advertised across the market" : "Orderbook unavailable"}</p>
              </div>
            </Card>
            <Card
              name="BlitzPool"
              version={`BlitzPool ${connected ? current(sources?.blitzpoolVersion,now,86580)?.version || "version unavailable" : "version unavailable"}`}
              icon={Pickaxe}
              status={blitzpool ? (blitzpool.health==='healthy'?'Healthy':'Degraded') : 'Unavailable'}
              onOpen={()=>open('BlitzPool')}
            >
              <div className="stats two blitzpool-stats">
                <Stat label="Pool Hashrate" value={hashrate(blitzpool?.hashrate)} sub={blitzpool?.hashrate==null ? 'Live hashrate unavailable' : 'Total pool mining power'}/>
                <Stat label="Mining Sessions" value={number(blitzpool?.miningSessions)} sub="Connected mining sessions"/>
              </div>
              <div className="stats two blitzpool-secondary">
                <Stat label="Blocks Found" value={number(blitzpool?.blocksFound)}/>
                <Stat label="Best Share Difficulty" value={blitzpool?.bestShareDifficulty==null?'—':new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:2}).format(blitzpool.bestShareDifficulty)}/>
              </div>
              <Graph kind="poolHashrate" label="Pool Hashrate · Last 24h" aside={poolScale.unit} unit={poolScale.unit}
                liveData={blitzpoolHistory?.points.map(point=>({timestamp:point.timestamp*1000,poolHashrate:point.hashrate/poolScale.factor}))||null}/>
            </Card>
            <Card
              name="mempool"
              version={`Mempool ${connected ? current(sources?.mempoolVersion, now, 86580)?.version || "version unavailable" : "version unavailable"}`}
              status={f ? "API online" : "Unavailable"}
              icon={ChartNoAxesColumnIncreasing}
              onOpen={() => open("Mempool")}
            >
              <div className="stats two mempool-totals">
                <Stat label="Unconfirmed Transactions" value={number(b?.mempoolCount)} sub={`${bytes(b?.mempoolVbytes)} vsize`}/>
                <Stat label="Mempool Memory" value={bytes(b?.mempoolMemory)} sub="Bitcoin Core"/>
              </div>
              <div className="fee-recommendations" aria-label="Estimated transaction fees in sat/vB">
                {([['Priority',f?.fastestFee],['30 minutes',f?.halfHourFee],['1 hour',f?.hourFee],['Economy',f?.economyFee]] as const).map(([label,value])=><div key={label}><span>{label}</span><strong>{number(value,3)}<small>sat/vB</small></strong></div>)}
              </div>
              <Graph
                kind="mempoolSize"
                label="Mempool Size · Last 24h"
                aside="MvB"
                liveData={mempoolTrend?.points.map(row=>({timestamp:row.timestamp*1000,mempoolSize:row.vbytes/1e6}))||null}
              />
            </Card>
            <Card
              name="electrs"
              version={`electrs ${connected ? current(sources?.electrsVersion, now, 86580)?.version || "version unavailable" : "version unavailable"}`}
              status={
                e ? (behind === 0 ? "Synced" : "Responding") : "Unavailable"
              }
              icon={Database}
              color="blue"
              onOpen={() => open("Electrs")}
            >
              <div className="stats two">
                <Stat
                  label="Indexed Block Height"
                  value={number(e?.height)}
                  sub={
                    behind === null
                      ? "Lag unavailable"
                      : behind === 0
                        ? "At chain tip"
                        : `${behind} blocks behind`
                  }
                />
                <Stat
                  label="Queries / min"
                  value={number(electrsMetrics?.queriesPerMinute,1)}
                  sub={electrsMetrics ? (electrsMetrics.queriesPerMinute===null?'Collecting baseline':'Last measured interval') : 'Metrics unavailable'}
                />
              </div>
              <div className="stats two index-stats">
                <Stat label="Database Size" value={bytes(electrsDbSize?.bytes)}/>
                <Stat label="Avg Processing" value={electrsMetrics?.meanMs==null?'—':`${number(electrsMetrics.meanMs,3)} ms`}/>
              </div>
              <Graph
                kind="queries"
                label="Query Activity · Last 24h"
                aside="queries/min"
                liveData={electrsMetrics?.history.map(row=>({timestamp:row.timestamp*1000,queries:row.queries}))||null}
              />
            </Card>
          </section>
          <section className="events">
            <header>
              <FileText size={19} />
              <h2>Recent Events</h2>
              <button onClick={() => open("System Logs")}>
                View all logs <ArrowRight size={14} />
              </button>
            </header>
            {!liveEvents.length && (
              <p className="no-events">
                {connected
                  ? "Monitoring started. New blocks and status changes will appear here."
                  : "Monitoring unavailable."}
              </p>
            )}
            <div className="events-columns">
              {[liveEvents.slice(0, 3), liveEvents.slice(3)].map((rows, i) => (
                <div key={i}>
                  {rows.map(([time, title, text, service, color]) => (
                    <div className="event" key={`${time}-${title}-${text}`}>
                      <span>{time}</span>
                      <i className={`dot ${color}`} />
                      <b>{title}</b>
                      <span className="event-description">{text}</span>
                      <span className="event-tag">{service}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
          <div className="demo-note">
            Live monitoring
          </div>
        </main>
      </div>
      <Dialog.Root
        open={detail !== null}
        onOpenChange={(v) => !v && setDetail(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>{detail}</Dialog.Title>
            <Dialog.Description>
              Bitcoin, Mempool, Electrs, container state and interface checks
              are live. LND node information is available when its wallet is unlocked.
            </Dialog.Description>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="dialog-close"
                aria-label="Close"
              >
                <X size={20} />
              </Button>
            </Dialog.Close>
            {(detail === "Lightning" || detail === "JoinMarket") && (
              <div className="interface-info">
                <div>
                  <small>Web interface</small>
                  <strong>{detail === "Lightning" ? "RTL" : "Jam"}</strong>
                </div>
                <Status>
                  {connected &&
                  current(
                    detail === "Lightning" ? sources?.rtl : sources?.jam,
                    now,
                  )
                    ? "Reachable"
                    : "Unavailable"}
                </Status>
              </div>
            )}
            {detail==='Electrs'&&<div className="source-info"><div><strong>Tracked mempool</strong><span>{number(electrsMetrics?.mempoolCount)} transactions</span><small>{bytes(electrsMetrics?.mempoolVbytes)} virtual size</small></div>{Object.entries(electrsMetrics?.methods||{}).map(([method,data])=><div key={method}><strong>{method}</strong><span>{number(data.count)} calls</span></div>)}</div>}
            {detail==='BlitzPool'&&<div className="source-info"><div><strong>Pool health checks</strong></div>{['database','bitcoin','cache','tdp'].map(key=><div key={key}><strong>{key==='tdp'?'TDP':key}</strong><span>{blitzpool?.checks[key]||'Not reported'}</span></div>)}</div>}
            {detail === "System Logs" && (
              <div className="source-info">
                {(snapshot?.events || []).map((event, i) => (
                  <div key={i}>
                    <strong>{event.title}</strong>
                    <small>
                      {eventTime(event.timestamp)} · {event.service} ·{" "}
                      {event.detail}
                    </small>
                  </div>
                ))}
              </div>
            )}
            {detail && (
              <div className="source-info">
                {Object.entries(sources || {})
                  .filter(
                    ([name]) =>
                      detail === "Node information" ||
                      detail === "System Logs" ||
                      detailKey(detail).includes(name),
                  )
                  .map(([name, source]) => (
                    <div key={name}>
                      <strong>{name}</strong>
                      <span>
                        {connected &&
                        current(
                          source as Source<unknown>,
                          now,
                          name.endsWith("Version") || name === "electrsDbSize" ? 86580 : 180,
                        )
                          ? "Live"
                          : "Unavailable"}
                      </span>
                    </div>
                  ))}
                {containers &&
                  [
                    "bitcoind",
                    "Lightning",
                    "JoinMarket",
                    "Tor",
                    "Mempool",
                    "Electrs",
                    "BlitzPool",
                  ].includes(detail) && (
                    <p>
                      Container:{" "}
                      {containerStatus(
                        (
                          {
                            bitcoind: "bitcoin",
                            Lightning: "lightning",
                            JoinMarket: "joinmarket",
                            Tor: "tor",
                            Mempool: "mempool",
                            Electrs: "electrs",
                            BlitzPool: "blitzpool",
                          } as Record<string, string>
                        )[detail],
                      )}
                      <br />
                      {image(
                        (
                          {
                            bitcoind: "bitcoin",
                            Lightning: "lightning",
                            JoinMarket: "joinmarket",
                            Tor: "tor",
                            Mempool: "mempool",
                            Electrs: "electrs",
                            BlitzPool: "blitzpool",
                          } as Record<string, string>
                        )[detail],
                      )}
                      <br />
                      {
                        containers[
                          (
                            {
                              bitcoind: "bitcoin",
                              Lightning: "lightning",
                              JoinMarket: "joinmarket",
                              Tor: "tor",
                              Mempool: "mempool",
                              Electrs: "electrs",
                            BlitzPool: "blitzpool",
                            } as Record<string, string>
                          )[detail]
                        ]?.status
                      }
                      <br />
                      Started:{" "}
                      {containers[
                        (
                          {
                            bitcoind: "bitcoin",
                            Lightning: "lightning",
                            JoinMarket: "joinmarket",
                            Tor: "tor",
                            Mempool: "mempool",
                            Electrs: "electrs",
                            BlitzPool: "blitzpool",
                          } as Record<string, string>
                        )[detail]
                      ]?.startedAt || "Unavailable"}
                      <br />
                      Container health:{" "}
                      {containers[
                        (
                          {
                            bitcoind: "bitcoin",
                            Lightning: "lightning",
                            JoinMarket: "joinmarket",
                            Tor: "tor",
                            Mempool: "mempool",
                            Electrs: "electrs",
                            BlitzPool: "blitzpool",
                          } as Record<string, string>
                        )[detail]
                      ]?.health || "No health check configured"}
                    </p>
                  )}
              </div>
            )}
            <Dialog.Close asChild>
              <Button variant="outline">Back to overview</Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
const LayersIcon = Blocks;

function detailNameToSource(name: string) {
  return (
    (
      {
        bitcoind: ["bitcoin", "blockHistory"],
        Lightning: ["lndState", "lndInfo", "rtl"],
        JoinMarket: ["jam", "joinmarketSession", "joinmarketOrderbook"],
        Tor: ["tor", "bitcoin"],
        BlitzPool: ["blitzpool", "blitzpoolHistory", "blitzpoolVersion"],
        Mempool: ["fees", "mempoolTrend", "bitcoin"],
        Electrs: ["electrs", "electrsMetrics", "electrsDbSize", "electrsVersion"],
      } as Record<string, string[]>
    )[name] || []
  );
}

function eventTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString([], {month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false});
}
