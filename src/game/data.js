// Static game data. All incomes are per game-hour. 1 game hour = 10 real seconds.

export const START_CASH = 100000

// ---------- Level-based idle businesses ----------
export const IDLE_BUSINESSES = [
  { id: 'smallShop',    name: 'Small Shop',        cost: 4000,     baseIncome: 320,    upgradeBase: 2400,    icon: '🛒' },
  { id: 'shopChain',    name: 'Large Shop Chain',  cost: 150000,   baseIncome: 9500,   upgradeBase: 90000,   icon: '🏬' },
  { id: 'smallFactory', name: 'Small Factory',     cost: 25000,    baseIncome: 1900,   upgradeBase: 15000,   icon: '🏭' },
  { id: 'largeFactory', name: 'Large Factory',     cost: 2000000,  baseIncome: 115000, upgradeBase: 1200000, icon: '🏗️' },
  { id: 'restaurant',   name: 'Restaurant',        cost: 60000,    baseIncome: 4200,   upgradeBase: 36000,   icon: '🍽️' },
]
export const LEVEL_INCOME_GROWTH = 1.22   // income multiplier per level
export const LEVEL_COST_GROWTH = 1.32     // upgrade cost multiplier per level
export const MAX_LEVEL = 999              // effectively uncapped — money is infinite

// ---------- Consumer economy (idle businesses) ----------
// Each idle business has a demand index that drifts every market tick.
// You set a price level; revenue = income * priceFactor * customers,
// where customers = demand + 1 - priceFactor. Optimal price tracks demand.
export const DEMAND_MIN = 0.6
export const DEMAND_MAX = 1.4
export const PRICE_MIN = 70   // % of list price
export const PRICE_MAX = 150
export const MANAGER_COST = 25000        // one-time hire, per business
export const MANAGER_SALARY_PCT = 0.06   // manager takes 6% of that business's revenue
export const MARKETING_COST_PCT = 8      // campaign costs 8x the business's base hourly income
export const MARKETING_HOURS = 24        // demand +0.3 while active
export const MARKETING_BOOST = 0.3
export const MARKETING_COOLDOWN = 48

// ---------- Fleet businesses (vehicles with mileage) ----------
export const FLEET_BUSINESSES = [
  {
    id: 'taxi', name: 'Taxi Company', cost: 10000, startSlots: 3, icon: '🚕',
    vehicles: [
      { id: 'sedan',  name: 'Used Sedan',    cost: 2500,   income: 180,   miles: 30000,  usePerHour: 45 },
      { id: 'hybrid', name: 'Hybrid Sedan',  cost: 9000,   income: 420,   miles: 90000,  usePerHour: 45 },
      { id: 'luxcar', name: 'Luxury Sedan',  cost: 32000,  income: 1150,  miles: 220000, usePerHour: 45 },
    ],
  },
  {
    id: 'shipping', name: 'Shipping Company', cost: 30000, startSlots: 3, icon: '🚚',
    vehicles: [
      { id: 'cityvan', name: 'City Van',       cost: 6000,   income: 400,   miles: 60000,  usePerHour: 55 },
      { id: 'boxtruck', name: 'Box Truck',     cost: 18000,  income: 950,   miles: 140000, usePerHour: 55 },
      { id: 'longhaul', name: 'Long-Haul Truck', cost: 45000, income: 2600, miles: 400000, usePerHour: 55 },
    ],
  },
]
export const SLOT_PACKS = [
  { count: 5,  cost: 25000 },
  { count: 10, cost: 90000 },
  { count: 20, cost: 320000 },
]

// Fleet routes: income vs wear vs fuel tradeoff. Fuel price drifts every market tick.
export const ROUTES = [
  { id: 'city',    name: 'City routes',       income: 1.0, wear: 1.0, fuel: 1.0, desc: 'Steady fares, gentle on vehicles' },
  { id: 'highway', name: 'Highway routes',    income: 1.5, wear: 1.7, fuel: 1.4, desc: 'Better money, vehicles wear fast' },
  { id: 'heavy',   name: 'Heavy contracts',   income: 2.2, wear: 2.6, fuel: 1.9, desc: 'Top rates, brutal on the fleet' },
]
export const FUEL_MIN = 0.7
export const FUEL_MAX = 1.6
export const FUEL_COST_SHARE = 0.25      // at fuel price 1.0 on city routes, fuel eats 25% of a vehicle's gross
export const WORKSHOP_MAX = 8
export const WORKSHOP_WEAR_CUT = 0.06    // each level cuts wear 6%
export const WORKSHOP_BASE_COST = 40000  // ×2 per level

// ---------- Construction ----------
export const CONSTRUCTION = {
  id: 'construction', name: 'Construction Company', cost: 35400, icon: '👷',
  workerCost: 2000,
  skillPerProject: 0.03,  // each finished project pays +3% on all future payouts
  skillCap: 1.0,          // up to +100%
  projects: [
    { id: 'house',  name: 'Family House',      workers: 3,  materials: 12000,   hours: 4,  payout: 34000 },
    { id: 'office', name: 'Office Building',   workers: 8,  materials: 85000,   hours: 10, payout: 240000 },
    { id: 'mall',   name: 'Shopping Mall',     workers: 20, materials: 600000,  hours: 24, payout: 1750000 },
    { id: 'tower',  name: 'Skyscraper',        workers: 50, materials: 4500000, hours: 48, payout: 13500000 },
  ],
}

// ---------- Car Dealership ----------
export const DEALERSHIP = {
  id: 'dealership', name: 'Car Dealership', cost: 40000, icon: '🚗',
  carBrands: ['Rustang', 'Camry-ish', 'Beemer', 'Mercedez', 'Lambo-like', 'Ferrarri'],
  minCar: 8000, maxCar: 60000,
  repairCostPct: 0.22,   // of car value
  repairHours: 3,
  saleMultiplier: 1.65,  // sell price vs purchase price after repair
}

// ---------- Bank ----------
export const BANK = {
  id: 'bank', name: 'Bank', cost: 250000, icon: '🏦',
  maxRate: 12,           // % per hour (game-scale rates)
  depositPull: 250000,   // deposit volume attracted per % of deposit rate
  loanDemand: 2200000,   // max loan demand at 0% credit rate
  trustSpread: 6,        // spread wider than this scares depositors
}

// ---------- IT Company ----------
export const IT_COMPANY = {
  id: 'it', name: 'IT Company', cost: 350000, icon: '💻',
  devSalary: 1500, // per dev per hour, always paid
  trainBaseCost: 120000, trainCostGrowth: 1.8, trainMax: 10, trainBonus: 0.08, // +8% payout per seniority level
  projects: [
    { id: 'site',   name: 'Landing Website', devs: 2,  hours: 3,  payout: 22000 },
    { id: 'app',    name: 'Mobile App',      devs: 5,  hours: 8,  payout: 130000 },
    { id: 'saas',   name: 'SaaS Platform',   devs: 12, hours: 20, payout: 720000 },
    { id: 'aimdl',  name: 'AI Model',        devs: 30, hours: 40, payout: 4200000 },
  ],
}

// ---------- Football Club ----------
export const FOOTBALL = {
  id: 'football', name: 'Football Club', cost: 5000000, icon: '⚽',
  baseRating: 60,
  playerCost: 900000,   // each signing, cost grows 1.35x
  playerCostGrowth: 1.35,
  ratingPerPlayer: 2,
  maxPlayers: 18,
  incomePerRating: 1600,     // income/hr = rating * this
  sponsorHours: 48, sponsorMult: 1.6, sponsorCost: 2000000,
}

// ---------- Oil & Gas ----------
export const OIL = {
  id: 'oil', name: 'Oil & Gas Company', cost: 50000000, icon: '🛢️',
  baseIncome: 3000000,
  contractHours: 24,
  contractIncomeMult: 1.11, // income +11% per completed contract
}

export const BUSINESS_ORDER = [
  'smallShop', 'smallFactory', 'taxi', 'shipping', 'construction', 'dealership',
  'restaurant', 'shopChain', 'bank', 'it', 'largeFactory', 'football', 'oil',
]

// ---------- Stocks ----------
// Every share trades inside a fixed [min, max] band. Dividends pay hourly on held value.
// depth = order-book liquidity in $: trades vs depth cause slippage + price impact
// risk = static label shown beside the asset (low / med / high; tokens are 'degen')
export const STOCKS = [
  { id: 'PEAR', name: 'Pear Computers',    min: 120,  max: 210,  dividend: 0.05, shares: 4000,   profit: 260000, depth: 220000, risk: 'med' },
  { id: 'MSFT', name: 'Macrohard',         min: 260,  max: 420,  dividend: 0.06, shares: 3500,   profit: 380000, depth: 380000, risk: 'med' },
  { id: 'ADND', name: 'AD&D Utilities',    min: 45,   max: 70,   dividend: 0.22, shares: 9000,   profit: 190000, depth: 260000, risk: 'low' },
  { id: 'EXX',  name: 'Exxes Energy',      min: 80,   max: 140,  dividend: 0.12, shares: 20000,  profit: 900000, depth: 750000, risk: 'low' },
  { id: 'TSL',  name: 'Teslo Motors',      min: 150,  max: 340,  dividend: 0,    shares: 5000,   profit: 420000, depth: 240000, risk: 'high' },
  { id: 'BRGR', name: 'BurgerVerse',       min: 30,   max: 55,   dividend: 0.15, shares: 12000,  profit: 150000, depth: 160000, risk: 'med' },
  { id: 'FLYX', name: 'FlyDex Airlines',   min: 18,   max: 42,   dividend: 0.08, shares: 15000,  profit: 130000, depth: 110000, risk: 'high' },
  { id: 'MEDI', name: 'Medicore Pharma',   min: 200,  max: 330,  dividend: 0.09, shares: 2800,   profit: 310000, depth: 210000, risk: 'low' },
  { id: 'GLDN', name: 'Golden Mines',      min: 55,   max: 115,  dividend: 0.10, shares: 8000,   profit: 280000, depth: 170000, risk: 'high' },
  { id: 'NTWK', name: 'NetWorks Media',    min: 90,   max: 175,  dividend: 0.04, shares: 6000,   profit: 240000, depth: 200000, risk: 'med' },
]
export const RISK_LABELS = {
  low: { text: 'LOW RISK', cls: 'risk-low' },
  med: { text: 'MED RISK', cls: 'risk-med' },
  high: { text: 'HIGH RISK', cls: 'risk-high' },
  degen: { text: '🔥 DEGEN', cls: 'risk-degen' },
}
export const MAX_SLIPPAGE = 0.25 // dumping into a dry book costs at most 25%

// ---------- Crypto (no dividends, big swings, distinct personalities) ----------
// vol: per-step noise · trend: momentum strength (rides waves) · revert: pull to mid
// jumpChance/jumpSize: sudden pumps & dumps. All still clamped to the band — wild, not exploitable.
export const CRYPTOS = [
  { id: 'PUP',  name: 'Pupcoin',    min: 0.04,  max: 0.60,  vol: 0.06,  trend: 0.2,  revert: 0,    jumpChance: 0.05, jumpSize: 0.45, style: 'degen · moonshots & rug pulls',      supply: 4e8,   depth: 120000,  risk: 'high' },
  { id: 'AUR',  name: 'Aurum',      min: 18000, max: 95000, vol: 0.025, trend: 0.5,  revert: 0,    jumpChance: 0.01, jumpSize: 0.12, style: 'blue chip · slow heavy trends',      supply: 2100,  depth: 9000000, risk: 'low' },
  { id: 'NEB',  name: 'Nebula',     min: 900,   max: 4200,  vol: 0.04,  trend: 0.75, revert: 0,    jumpChance: 0.02, jumpSize: 0.18, style: 'momentum · rides long waves',        supply: 42000, depth: 3200000, risk: 'med' },
  { id: 'QRK',  name: 'Quark',      min: 45,    max: 380,   vol: 0.07,  trend: 0.1,  revert: 0.08, jumpChance: 0.03, jumpSize: 0.25, style: 'rubber band · snaps back to mid',    supply: 260000, depth: 420000,  risk: 'med' },
  { id: 'GLT',  name: 'Glitch',     min: 2,     max: 30,    vol: 0.05,  trend: 0.3,  revert: 0,    jumpChance: 0.12, jumpSize: 0.20, style: 'chaotic · constant jolts',           supply: 2.4e6, depth: 95000,   risk: 'high' },
  { id: 'DRGN', name: 'Dragonet',   min: 300,   max: 2600,  vol: 0.05,  trend: 0.6,  revert: 0,    jumpChance: 0.03, jumpSize: 0.30, style: 'fire-breather · violent trends',     supply: 30000, depth: 1000000, risk: 'high' },
  { id: 'SOLR', name: 'Solara',     min: 40,    max: 260,   vol: 0.045, trend: 0.55, revert: 0,    jumpChance: 0.02, jumpSize: 0.20, style: 'sun cycle · hot & cold seasons',     supply: 350000, depth: 700000,  risk: 'med' },
  { id: 'MEOW', name: 'Meowcoin',   min: 0.5,   max: 9,     vol: 0.07,  trend: 0.15, revert: 0,    jumpChance: 0.08, jumpSize: 0.35, style: 'cat meme · knocks things over',      supply: 1.6e7, depth: 150000,  risk: 'high' },
  { id: 'TOAD', name: 'Toadstool',  min: 0.01,  max: 0.22,  vol: 0.08,  trend: 0.1,  revert: 0,    jumpChance: 0.07, jumpSize: 0.40, style: 'swamp degen · hops hard',            supply: 9e8,   depth: 60000,   risk: 'high' },
  { id: 'VOLT', name: 'Voltage',    min: 12,    max: 95,    vol: 0.06,  trend: 0.25, revert: 0.03, jumpChance: 0.05, jumpSize: 0.22, style: 'electric · sharp spikes',            supply: 900000, depth: 520000,  risk: 'med' },
  { id: 'PIXL', name: 'Pixelate',   min: 1.5,   max: 14,    vol: 0.05,  trend: 0.35, revert: 0,    jumpChance: 0.04, jumpSize: 0.25, style: 'gamer coin · 8-bit swings',          supply: 7e6,   depth: 310000,  risk: 'med' },
  { id: 'NOVA', name: 'Supernova',  min: 700,   max: 6800,  vol: 0.055, trend: 0.65, revert: 0,    jumpChance: 0.025, jumpSize: 0.28, style: 'explosive · giant slow blasts',     supply: 26000, depth: 2100000, risk: 'med' },
  { id: 'RUST', name: 'Rustchain',  min: 8,     max: 44,    vol: 0.03,  trend: 0.2,  revert: 0.06, jumpChance: 0.015, jumpSize: 0.15, style: 'boring but safe(ish)',              supply: 2.2e6, depth: 640000,  risk: 'low' },
  { id: 'JELY', name: 'Jellycoin',  min: 0.2,   max: 3.5,   vol: 0.065, trend: 0.1,  revert: 0.05, jumpChance: 0.06, jumpSize: 0.30, style: 'wobbly · no backbone',               supply: 4.5e7, depth: 210000,  risk: 'high' },
  { id: 'YETI', name: 'Yeti',       min: 150,   max: 1400,  vol: 0.05,  trend: 0.4,  revert: 0,    jumpChance: 0.03, jumpSize: 0.24, style: 'rarely seen · big footprints',       supply: 90000, depth: 880000,  risk: 'med' },
  { id: 'PLSM', name: 'Plasma',     min: 25,    max: 210,   vol: 0.06,  trend: 0.5,  revert: 0,    jumpChance: 0.04, jumpSize: 0.26, style: 'high energy · unstable state',       supply: 480000, depth: 730000,  risk: 'med' },
  { id: 'BNDT', name: 'Bandit',     min: 3,     max: 38,    vol: 0.075, trend: 0.3,  revert: 0,    jumpChance: 0.09, jumpSize: 0.35, style: 'outlaw · steals your gains',         supply: 3.8e6, depth: 105000,  risk: 'high' },
  { id: 'FRST', name: 'Frostbyte',  min: 60,    max: 420,   vol: 0.04,  trend: 0.45, revert: 0.02, jumpChance: 0.02, jumpSize: 0.18, style: 'cold storage · slow freeze/thaw',    supply: 240000, depth: 820000,  risk: 'low' },
  { id: 'ORBT', name: 'Orbital',    min: 900,   max: 5200,  vol: 0.045, trend: 0.6,  revert: 0,    jumpChance: 0.02, jumpSize: 0.22, style: 'circular · long elliptic arcs',      supply: 34000, depth: 1600000, risk: 'med' },
  { id: 'SNKE', name: 'Snakebite',  min: 0.08,  max: 1.6,   vol: 0.08,  trend: 0.2,  revert: 0,    jumpChance: 0.10, jumpSize: 0.38, style: 'venomous · strikes fast',            supply: 1.4e8, depth: 85000,   risk: 'high' },
]

// ---------- New token launches (mostly rugs, occasionally jackpots) ----------
export const TOKEN_LAUNCH = {
  firstDelayH: [4, 14],     // first launch soon after this update goes live
  nextDelayH: [30, 90],     // then every 5-15 real minutes
  maxActive: 6,
  promoteDelayH: [8, 26],   // influencer shill lands this long after launch
  fateDelayH: [6, 18],      // rug/moon resolves this long after the shill
  rugChance: 0.78,
  launchPriceRange: [0.002, 0.4],
  delistAfterH: 6,          // rugged tokens freeze, then vanish fast (auto-settling dust)
}
export const TOKEN_POOL = [
  { sym: 'WAGMI', name: 'WagmiCoin' },  { sym: 'FLOOF', name: 'Floofinu' },
  { sym: 'MOONC', name: 'MoonCat' },    { sym: 'DGEN',  name: 'DegenDollar' },
  { sym: 'HODL',  name: 'HodlToken' },  { sym: 'PONZU', name: 'Ponzu' },
  { sym: 'GRIFT', name: 'Griftcoin' },  { sym: 'LAMBO', name: 'LamboLater' },
  { sym: 'FOMO',  name: 'FomoFuel' },   { sym: 'SHILL', name: 'Shillium' },
  { sym: 'BAGZ',  name: 'HeavyBagz' },  { sym: 'YOLO',  name: 'YoloStrike' },
  { sym: 'COPE',  name: 'Copium' },     { sym: 'NGMI',  name: 'NgmiProtocol' },
  { sym: 'PMPD',  name: 'PumpedFi' },   { sym: 'EXIT',  name: 'ExitLiquidity' },
  { sym: 'MULE',  name: 'MoonMule' },   { sym: 'GOBL',  name: 'Goblincoin' },
  { sym: 'SNAKE', name: 'SnakeOil' },   { sym: 'VAPOR', name: 'Vaporware' },
]
export const INFLUENCERS = ['CryptoKing_69', 'MoonGirl.eth', 'DiamondHandz Dave', 'ApeLordSupreme', 'Satoshi Jr.', 'PumpQueen', 'TheChartWizard']

// ---------- Leverage trading ----------
export const LEV_MIN = 2
export const LEV_MAX = 10
export const POSITION_MIN_MARGIN = 100
export const POSITION_FEE = 0.003 // 0.3% of notional charged on open

// ---------- Real Estate (rent/hr = value * rentRate; 5 improvement tiers) ----------
export const PROPERTIES = [
  { id: 'studio',   name: 'City Studio Apartment',   cost: 45000,     icon: '🏢' },
  { id: 'suburb',   name: 'Suburban House',          cost: 180000,    icon: '🏡' },
  { id: 'loft',     name: 'Downtown Loft',           cost: 550000,    icon: '🌆' },
  { id: 'villa',    name: 'Beach Villa',             cost: 2400000,   icon: '🏖️' },
  { id: 'block',    name: 'Apartment Block',         cost: 9000000,   icon: '🏙️' },
  { id: 'hotel',    name: 'Boutique Hotel',          cost: 32000000,  icon: '🏨' },
  { id: 'tower',    name: 'Office Tower',            cost: 120000000, icon: '🗼' },
  { id: 'resort',   name: 'Private Island Resort',   cost: 450000000, icon: '🏝️' },
]
export const RENT_RATE = 0.006          // hourly rent as fraction of value
export const IMPROVE_TIERS = 5
export const IMPROVE_COST_PCT = 0.35    // each tier costs 35% of base
export const IMPROVE_INCOME_BONUS = 0.25 // each tier adds +25% of base rent
export const PROPERTY_SALES_TAX = 0.15

// ---------- Luxury items (zero income; resale = 40%, NFTs 100%) ----------
export const LUXURY = [
  { id: 'watch',   name: 'Swiss Watch',        cost: 85000,      cat: 'Jewellery', icon: '⌚' },
  { id: 'diamond', name: 'Blue Diamond',       cost: 1200000,    cat: 'Jewellery', icon: '💎' },
  { id: 'sport',   name: 'Supercar',           cost: 2500000,    cat: 'Cars',      icon: '🏎️' },
  { id: 'classic', name: 'Classic Collection', cost: 15000000,   cat: 'Cars',      icon: '🚘' },
  { id: 'painting', name: 'Renaissance Painting', cost: 45000000, cat: 'Art',      icon: '🖼️' },
  { id: 'heli',    name: 'Helicopter',         cost: 28000000,   cat: 'Aircraft',  icon: '🚁' },
  { id: 'jet',     name: 'Private Jet',        cost: 90000000,   cat: 'Aircraft',  icon: '✈️' },
  { id: 'yacht',   name: 'Mega Yacht',         cost: 300000000,  cat: 'Yachts',    icon: '🛥️' },
  { id: 'island',  name: 'Private Island',     cost: 1200000000, cat: 'Islands',   icon: '🏝️' },
  { id: 'nft',     name: 'Bored Dragon NFT',   cost: 5000000,    cat: 'NFT',       icon: '🐲' },
]
export const LUXURY_RESALE = 0.40

// ---------- Mergers ----------
export const MERGERS = [
  {
    id: 'clothing', name: 'Clothing Brand', icon: '👔', capital: 3000000, income: 421300,
    reqText: 'Large Shop Chain lvl 10 · Small Factory lvl 20 · Shipping: 8 vans + 2 long-haul trucks',
  },
  {
    id: 'space', name: 'Space Agency', icon: '🚀', capital: 450000000, income: 38000000,
    reqText: 'Large Factory lvl 25 · Shipping: 50 vans + 20 long-haul trucks · Construction lifetime earnings $6M+',
  },
  {
    id: 'holding', name: 'Holding Company', icon: '🏛️', capital: 500000000, income: 65000000,
    reqText: 'Bank vault $420M · Stock portfolio worth $40M+',
  },
]

// ---------- Achievements (net-worth milestones) ----------
export const ACHIEVEMENTS = [
  { id: 'm1',   name: 'Millionaire',      icon: '🥉', threshold: 1e6,  desc: 'Reach a net worth of $1 million.' },
  { id: 'm2',   name: 'Double Digits',    icon: '🥈', threshold: 2e6,  desc: 'Reach a net worth of $2 million.' },
  { id: 'm10',  name: 'Serious Player',   icon: '🥇', threshold: 1e7,  desc: 'Reach a net worth of $10 million.' },
  { id: 'm100', name: 'Market Mover',     icon: '🏆', threshold: 1e8,  desc: 'Reach a net worth of $100 million.' },
  { id: 'b1',   name: 'Billionaire',      icon: '👑', threshold: 1e9,  desc: 'Reach a net worth of $1 billion.' },
]

export const HOURS_PER_SECOND = 0.1 // 1 game hour = 10 real seconds
export const MARKET_STEP_H = 0.5    // prices move once per 0.5 game hours (= every 5 real seconds)
export const HIST_MAX = 1008        // candles kept per asset = 3 game-weeks (enables 12H→1W chart zoom)
export const OFFLINE_CAP_HOURS = 24
export const BUSINESS_SALES_TAX = 0.30 // selling a business refunds 70% of invested
