/** Human-readable text of one catalog service. Keys of `fields` are JSON field names. */
export interface ServiceText {
  name: string
  description: string
  useCases: [string, string, string]
  fields: Record<string, string>
}

/**
 * Every visible string that is not in the base `T` of i18n.ts.
 * `{name}` style placeholders are filled by `fmt()`.
 * Product and protocol names (USDC, HTTP 402, x402, EIP-3009, Circle Gateway) are kept as is.
 */
export interface Extra {
  // ── app shell ──
  changeLanguage: string
  themeToLight: string
  themeToDark: string
  sessionSpent: string // {amount}
  searchPlaceholder: string
  searchNoMatch: string // {q}
  searchClear: string
  catalogSubtitleN: string // {n}
  howExpand: string
  howCollapse: string
  howCodeNote: string
  protoHttp402: string
  protoEip3009: string
  protoGateway: string
  protoX402: string
  categories: Record<string, string> // NLP, Data, DeFi, Compliance, Dev Tools, Other
  // ── service card ──
  cardNoParams: string
  cardCopyEndpoint: string
  cardCalled: string // {n}
  cardGasSaved: string
  cardUptime: string // {pct}
  cardUsdcPerCall: string
  commonFields: Record<string, string> // paid_by, amount_usdc
  services: Partial<Record<string, ServiceText>>
  // ── simulated trace ──
  traceSimNote: string
  traceNoCreds: string
  traceLblPrice: string
  traceLblNetwork: string
  traceLblScheme: string
  traceParsing: string
  traceBuilding: string
  traceSigning: string
  traceSignatureSim: string
  traceSignedAuth: string
  traceQueued: string
  traceAuthorised: string // {price}
  traceDemoSample: string
  traceBackendDown: string
  traceHttpFail: string // {status}
  // ── live feed ──
  feedTitle: string
  feedLive: string
  feedSubtitle: string
  feedEvents: string // {n}
  feedColService: string
  feedColAgent: string
  feedYou: string
  // ── code snippets ──
  codeTabBuyer: string
  codeTabSeller: string
  codeTabCli: string
  codeCopy: string
  codeCopied: string
  codeCopyTitle: string
  // ── marketplace ──
  mkTitle: string
  mkSubtitle: string
  mkRole1Title: string
  mkRole1Body: string
  mkRole2Title: string
  mkRole2Body: string
  mkRole3Title: string // {fee}
  mkRole3Body: string
  listTitle: string
  listCount: string // {n}
  listLoading: string
  listEmpty: string
  listUnavailable: string // {error}
  listRecheckTitle: string
  listSellerGets: string
  listBrokerFee: string // {pct}
  listBuyerPays: string
  listPayout: string
  listDemoTag: string
  listNotConfigured: string
  statusHealthy: string
  statusUnreachable: string
  statusPending: string
  formTitle: string
  formIntro: string // {fee}
  formName: string
  formDescription: string
  formPrice: string
  formPayTo: string
  formYouReceive: string // {price} {buyer} {fee}
  formSubmit: string
  formChecking: string
  formListedAs: string // {name} {status}
  formNotOffered: string
  agentTitle: string
  agentIntro: string
  agentMaxPrice: string
  agentFind: string
  agentNone: string // {category}
  agentStep1: string // {n}
  agentStep2: string // {name}
  agentStep3: string // {buyer} {seller} {fee} {pct}
  agentStep4: string // {call}
  // ── errors (server error codes + network) ──
  rcTitle: string
  rcIntro: string
  rcEmpty: string
  rcNoSeller: string
  rcError: string
  rcSummary: string
  rcToday: string // {n} {amount}
  crTitle: string
  crIntro: string
  crRemaining: string // {remaining} {total}
  crMin: string // {min}
  crDisabled: string
  crSoldOut: string
  crHow: string
  rcMedian: string
  rcMedianNone: string
  rcViewTx: string
  rcFrom: string
  rcStageReceived: string
  rcStageBatched: string
  rcStageConfirmed: string
  rcStageCompleted: string
  rcStageFailed: string
  rcStageUnknown: string
  errors: Record<string, string>
  // ── real sellers from Circle's public discovery ──
  discTitle: string
  discIntro: string
  discSearch: string
  discSearchBtn: string
  discAllCategories: string
  discCategories: Record<string, string>
  discResults: string // {shown} {total}
  discNone: string
  discError: string
  discFrom: string // {price}
  discNote: string
}
