// ──────────────────────────────────────────────────────────────────
// AgentPay — full UI translations
// Primary language: English (en). All other languages translate every
// visible string so the user can switch and read the entire page.
// ──────────────────────────────────────────────────────────────────

export const LANGUAGES = [
  { code: 'en',  label: 'English',   flag: '🇺🇸' },
  { code: 'zh',  label: '中文',      flag: '🇨🇳' },
  { code: 'es',  label: 'Español',   flag: '🇪🇸' },
  { code: 'fr',  label: 'Français',  flag: '🇫🇷' },
  { code: 'de',  label: 'Deutsch',   flag: '🇩🇪' },
  { code: 'ja',  label: '日本語',    flag: '🇯🇵' },
  { code: 'ar',  label: 'العربية',   flag: '🇸🇦' },
  { code: 'pt',  label: 'Português', flag: '🇧🇷' },
  { code: 'ko',  label: '한국어',    flag: '🇰🇷' },
] as const

export type LangCode = (typeof LANGUAGES)[number]['code']

// ── Translation shape ────────────────────────────────────────────
export interface T {
  // Header
  docs: string
  // Hero
  heroBadgeNetwork: string
  heroBadgeProtocol: string
  heroBadgeAuth: string
  heroHeadline1: string
  heroHeadline2: string
  heroSubtitle: string
  heroCta: string
  heroCtaHide: string
  heroCtaSeller: string
  // Stats
  statServices: string
  statAvgResponse: string
  statMinPrice: string
  statTotalCalls: string
  statVolume: string
  statSettlement: string
  statNetwork: string
  // How it works section
  howTitle: string
  howSubtitle: string
  howStep1Title: string
  howStep1Body: string
  howStep2Title: string
  howStep2Body: string
  howStep3Title: string
  howStep3Body: string
  howStep4Title: string
  howStep4Body: string
  howStep5Title: string
  howStep5Body: string
  // Catalog
  catalogTitle: string
  catalogSubtitle: string
  catalogFilterAll: string
  // Service card
  cardPerCall: string
  cardSimulate: string
  cardReset: string
  cardStatusReady: string
  cardStatusDetecting: string
  cardStatusNegotiating: string
  cardStatusPaying: string
  cardStatusSuccess: string
  cardStatusError: string
  cardTabOverview: string
  cardTabSchema: string
  cardTabTrace: string
  cardTabUseCases: string
  cardRequest: string
  cardResponse: string
  cardExamplePayload: string
  cardUseCases: string
  cardSla: string
  cardTraceLabel: string
  cardResponseLabel: string
  // Footer
  footerRunning: string
  footerSettled: string
  footerStandard: string
  footerMonetise: string
  footerTestnet: string
}

// ── Translations ─────────────────────────────────────────────────
export const translations: Record<LangCode, T> = {

  // ── English ──────────────────────────────────────────────────
  en: {
    docs: 'Docs',
    heroBadgeNetwork: 'Arc Testnet',
    heroBadgeProtocol: 'HTTP x402',
    heroBadgeAuth: 'Gasless Auth',
    heroHeadline1: 'The API Marketplace',
    heroHeadline2: 'Built for AI Agents',
    heroSubtitle:
      'Any AI agent can discover, evaluate, and pay for these API services automatically using the HTTP 402 protocol and Circle Gateway Nanopayments. No API keys. No sign-up. No gas. Just USDC.',
    heroCta: 'Show agent code',
    heroCtaHide: 'Hide agent code',
    heroCtaSeller: 'Seller quickstart',
    statServices: 'Services',
    statAvgResponse: 'Avg. response',
    statMinPrice: 'Min. price',
    statTotalCalls: 'Total calls',
    statVolume: 'Volume settled',
    statSettlement: 'Settlement',
    statNetwork: 'Network',
    howTitle: 'How It Works',
    howSubtitle: 'The complete x402 + Circle Gateway Nanopayments protocol — five steps, no gas, no sign-up',
    howStep1Title: 'Agent sends an unauthenticated request',
    howStep1Body:
      'The AI agent calls the API endpoint with no API key, no OAuth token, and no prior sign-up. The server does not need to know the agent exists in advance.',
    howStep2Title: 'Server returns HTTP 402 with payment requirements',
    howStep2Body:
      'The server responds with HTTP 402 Payment Required and a machine-readable JSON body: price in USDC, the seller\'s EVM address, the accepted network, and the payment scheme.',
    howStep3Title: 'Agent signs an EIP-3009 off-chain authorisation',
    howStep3Body:
      'The agent parses the payment requirements and signs a transferWithAuthorization (EIP-3009) message from its wallet. Pure cryptographic signature — no on-chain transaction, no gas, no block confirmation required.',
    howStep4Title: 'Agent retries with the X-Payment header',
    howStep4Body:
      'The agent retries with the base64-encoded EIP-3009 signature in the X-Payment header. The Gateway middleware verifies the signature in under a millisecond and immediately returns the paid response.',
    howStep5Title: 'Circle Gateway batches and settles on-chain',
    howStep5Body:
      'Circle Gateway collects thousands of signed authorisations off-chain and periodically submits a single batched transaction to the USDC contract, settling all payments to the seller\'s wallet.',
    catalogTitle: 'Service Catalog',
    catalogSubtitle: '8 paid APIs · All protected by HTTP 402 · Settled via Circle Gateway',
    catalogFilterAll: 'All',
    cardPerCall: 'per call',
    cardSimulate: 'Simulate Agent Call',
    cardReset: 'Reset',
    cardStatusReady: 'Ready',
    cardStatusDetecting: 'Detecting 402…',
    cardStatusNegotiating: 'Negotiating payment…',
    cardStatusPaying: 'Paying via Gateway…',
    cardStatusSuccess: 'Paid & responded',
    cardStatusError: 'Failed',
    cardTabOverview: 'Overview',
    cardTabSchema: 'Schema',
    cardTabTrace: 'Trace',
    cardTabUseCases: 'Use Cases',
    cardRequest: 'Request',
    cardResponse: 'Response',
    cardExamplePayload: 'Example payload',
    cardUseCases: 'Use Cases',
    cardSla: 'SLA',
    cardTraceLabel: 'Agent trace',
    cardResponseLabel: 'Response',
    footerRunning: 'Running on',
    footerSettled: 'Settled via',
    footerStandard: 'Standard',
    footerMonetise: 'Monetise your own endpoint:',
    footerTestnet: 'Testnet only · No real funds · Circle Gateway batches authorisations off-chain, settling on-chain periodically',
  },

  // ── 中文 ─────────────────────────────────────────────────────
  zh: {
    docs: '文档',
    heroBadgeNetwork: 'Arc 测试网',
    heroBadgeProtocol: 'HTTP x402',
    heroBadgeAuth: '免 Gas 授权',
    heroHeadline1: '专为 AI Agent 打造的',
    heroHeadline2: 'API 市场',
    heroSubtitle:
      '任何 AI Agent 都可以使用 HTTP 402 协议和 Circle Gateway 纳米支付自动发现、评估并付费调用这些 API 服务。无需 API 密钥，无需注册，无需 Gas，只需 USDC。',
    heroCta: '查看 Agent 代码',
    heroCtaHide: '收起代码',
    heroCtaSeller: '卖方快速入门',
    statServices: '服务数量',
    statAvgResponse: '平均响应',
    statMinPrice: '最低单价',
    statTotalCalls: '累计调用',
    statVolume: '已结算额',
    statSettlement: '结算方式',
    statNetwork: '网络',
    howTitle: '工作原理',
    howSubtitle: '完整的 x402 + Circle Gateway 纳米支付协议 — 五步完成，无 Gas，无注册',
    howStep1Title: 'Agent 发出无授权请求',
    howStep1Body:
      'AI Agent 直接调用 API 接口，无需 API 密钥、OAuth Token 或预先注册。服务器无需提前知道 Agent 的存在。',
    howStep2Title: '服务器返回 HTTP 402 及支付要求',
    howStep2Body:
      '服务器返回 HTTP 402 Payment Required，附带机器可读的 JSON：价格（USDC）、卖家 EVM 地址、支持的网络和支付方案。',
    howStep3Title: 'Agent 签署链下 EIP-3009 授权',
    howStep3Body:
      'Agent 解析支付要求，用钱包私钥签署 transferWithAuthorization（EIP-3009）消息。纯密码学签名，无链上交易，无 Gas，无需等待区块确认。',
    howStep4Title: 'Agent 携带 X-Payment 头重发请求',
    howStep4Body:
      'Agent 将 Base64 编码的 EIP-3009 签名放入 X-Payment 请求头并重发。Gateway 中间件在不到一毫秒内验证签名，立即返回付费内容。',
    howStep5Title: 'Circle Gateway 批量链上结算',
    howStep5Body:
      'Circle Gateway 在链下收集大量签名授权，定期将其打包成一笔链上交易提交至 USDC 合约，将累计款项转入卖家钱包。',
    catalogTitle: '服务目录',
    catalogSubtitle: '8 个付费 API · 均受 HTTP 402 保护 · 通过 Circle Gateway 结算',
    catalogFilterAll: '全部',
    cardPerCall: '每次调用',
    cardSimulate: '模拟 Agent 调用',
    cardReset: '重置',
    cardStatusReady: '就绪',
    cardStatusDetecting: '检测 402…',
    cardStatusNegotiating: '协商支付…',
    cardStatusPaying: '通过 Gateway 支付…',
    cardStatusSuccess: '支付成功，已响应',
    cardStatusError: '失败',
    cardTabOverview: '概览',
    cardTabSchema: '数据结构',
    cardTabTrace: '追踪日志',
    cardTabUseCases: '使用场景',
    cardRequest: '请求',
    cardResponse: '响应',
    cardExamplePayload: '示例请求体',
    cardUseCases: '使用场景',
    cardSla: '可用性',
    cardTraceLabel: 'Agent 追踪',
    cardResponseLabel: '响应内容',
    footerRunning: '运行于',
    footerSettled: '结算通过',
    footerStandard: '标准协议',
    footerMonetise: '为你的接口添加收费：',
    footerTestnet: '仅限测试网 · 无真实资金 · Circle Gateway 在链下批量授权，定期链上结算',
  },

  // ── Español ───────────────────────────────────────────────────
  es: {
    docs: 'Documentación',
    heroBadgeNetwork: 'Arc Testnet',
    heroBadgeProtocol: 'HTTP x402',
    heroBadgeAuth: 'Auth sin Gas',
    heroHeadline1: 'El mercado de APIs',
    heroHeadline2: 'creado para agentes IA',
    heroSubtitle:
      'Cualquier agente de IA puede descubrir, evaluar y pagar estos servicios de API automáticamente usando el protocolo HTTP 402 y Circle Gateway Nanopagos. Sin claves de API. Sin registro. Sin gas. Solo USDC.',
    heroCta: 'Ver código del agente',
    heroCtaHide: 'Ocultar código',
    heroCtaSeller: 'Inicio rápido del vendedor',
    statServices: 'Servicios',
    statAvgResponse: 'Respuesta media',
    statMinPrice: 'Precio mínimo',
    statTotalCalls: 'Llamadas totales',
    statVolume: 'Volumen liquidado',
    statSettlement: 'Liquidación',
    statNetwork: 'Red',
    howTitle: 'Cómo funciona',
    howSubtitle: 'El protocolo completo x402 + Circle Gateway Nanopagos — cinco pasos, sin gas, sin registro',
    howStep1Title: 'El agente envía una solicitud sin autenticación',
    howStep1Body:
      'El agente de IA llama al endpoint de la API sin clave de API, sin token OAuth y sin registro previo. El servidor no necesita conocer al agente con antelación.',
    howStep2Title: 'El servidor responde HTTP 402 con requisitos de pago',
    howStep2Body:
      'El servidor responde con HTTP 402 Payment Required y un cuerpo JSON legible por máquina: precio en USDC, dirección EVM del vendedor, red aceptada y esquema de pago.',
    howStep3Title: 'El agente firma una autorización EIP-3009 fuera de la cadena',
    howStep3Body:
      'El agente analiza los requisitos de pago y firma un mensaje transferWithAuthorization (EIP-3009) desde su billetera. Firma puramente criptográfica — sin transacción on-chain, sin gas ni confirmación de bloque.',
    howStep4Title: 'El agente reintenta con la cabecera X-Payment',
    howStep4Body:
      'El agente reintenta con la firma EIP-3009 codificada en base64 en la cabecera X-Payment. El middleware Gateway verifica la firma en menos de un milisegundo y devuelve inmediatamente la respuesta pagada.',
    howStep5Title: 'Circle Gateway agrupa y liquida on-chain',
    howStep5Body:
      'Circle Gateway recopila miles de autorizaciones firmadas fuera de la cadena y envía periódicamente una sola transacción agrupada al contrato USDC, transfiriendo los pagos acumulados a la billetera del vendedor.',
    catalogTitle: 'Catálogo de servicios',
    catalogSubtitle: '8 APIs de pago · Todas protegidas por HTTP 402 · Liquidadas vía Circle Gateway',
    catalogFilterAll: 'Todos',
    cardPerCall: 'por llamada',
    cardSimulate: 'Simular llamada de agente',
    cardReset: 'Reiniciar',
    cardStatusReady: 'Listo',
    cardStatusDetecting: 'Detectando 402…',
    cardStatusNegotiating: 'Negociando pago…',
    cardStatusPaying: 'Pagando vía Gateway…',
    cardStatusSuccess: 'Pagado y respondido',
    cardStatusError: 'Error',
    cardTabOverview: 'Descripción',
    cardTabSchema: 'Esquema',
    cardTabTrace: 'Seguimiento',
    cardTabUseCases: 'Casos de uso',
    cardRequest: 'Solicitud',
    cardResponse: 'Respuesta',
    cardExamplePayload: 'Ejemplo de payload',
    cardUseCases: 'Casos de uso',
    cardSla: 'SLA',
    cardTraceLabel: 'Traza del agente',
    cardResponseLabel: 'Respuesta',
    footerRunning: 'Ejecutado en',
    footerSettled: 'Liquidado vía',
    footerStandard: 'Estándar',
    footerMonetise: 'Monetiza tu endpoint:',
    footerTestnet: 'Solo testnet · Sin fondos reales · Circle Gateway agrupa autorizaciones off-chain y liquida on-chain periódicamente',
  },

  // ── Français ──────────────────────────────────────────────────
  fr: {
    docs: 'Documentation',
    heroBadgeNetwork: 'Arc Testnet',
    heroBadgeProtocol: 'HTTP x402',
    heroBadgeAuth: 'Auth sans Gas',
    heroHeadline1: 'La marketplace d\'API',
    heroHeadline2: 'conçue pour les agents IA',
    heroSubtitle:
      'Tout agent IA peut découvrir, évaluer et payer ces services API automatiquement grâce au protocole HTTP 402 et aux Nanopaiements Circle Gateway. Sans clé API. Sans inscription. Sans gas. Uniquement en USDC.',
    heroCta: 'Voir le code de l\'agent',
    heroCtaHide: 'Masquer le code',
    heroCtaSeller: 'Guide vendeur',
    statServices: 'Services',
    statAvgResponse: 'Temps de réponse',
    statMinPrice: 'Prix minimum',
    statTotalCalls: 'Appels totaux',
    statVolume: 'Volume réglé',
    statSettlement: 'Règlement',
    statNetwork: 'Réseau',
    howTitle: 'Comment ça marche',
    howSubtitle: 'Le protocole complet x402 + Circle Gateway Nanopaiements — cinq étapes, sans gas, sans inscription',
    howStep1Title: "L'agent envoie une requête non authentifiée",
    howStep1Body:
      "L'agent IA appelle l'endpoint API sans clé, sans token OAuth et sans inscription préalable. Le serveur n'a pas besoin de connaître l'agent à l'avance.",
    howStep2Title: 'Le serveur répond HTTP 402 avec les exigences de paiement',
    howStep2Body:
      'Le serveur répond HTTP 402 Payment Required avec un corps JSON lisible par machine : prix en USDC, adresse EVM du vendeur, réseau accepté et schéma de paiement.',
    howStep3Title: "L'agent signe une autorisation EIP-3009 hors chaîne",
    howStep3Body:
      "L'agent analyse les exigences de paiement et signe un message transferWithAuthorization (EIP-3009) depuis son portefeuille. Signature purement cryptographique — pas de transaction on-chain, pas de gas, pas de confirmation de bloc.",
    howStep4Title: "L'agent réessaie avec le header X-Payment",
    howStep4Body:
      "L'agent réessaie avec la signature EIP-3009 encodée en base64 dans le header X-Payment. Le middleware Gateway vérifie la signature en moins d'une milliseconde et renvoie immédiatement la réponse payante.",
    howStep5Title: 'Circle Gateway regroupe et règle on-chain',
    howStep5Body:
      'Circle Gateway collecte des milliers d\'autorisations signées hors chaîne et soumet périodiquement une seule transaction groupée au contrat USDC, transférant les paiements accumulés vers le portefeuille du vendeur.',
    catalogTitle: 'Catalogue de services',
    catalogSubtitle: '8 APIs payantes · Toutes protégées par HTTP 402 · Réglées via Circle Gateway',
    catalogFilterAll: 'Tous',
    cardPerCall: 'par appel',
    cardSimulate: "Simuler un appel d'agent",
    cardReset: 'Réinitialiser',
    cardStatusReady: 'Prêt',
    cardStatusDetecting: 'Détection du 402…',
    cardStatusNegotiating: 'Négociation du paiement…',
    cardStatusPaying: 'Paiement via Gateway…',
    cardStatusSuccess: 'Payé et répondu',
    cardStatusError: 'Échec',
    cardTabOverview: 'Aperçu',
    cardTabSchema: 'Schéma',
    cardTabTrace: 'Trace',
    cardTabUseCases: 'Cas d\'usage',
    cardRequest: 'Requête',
    cardResponse: 'Réponse',
    cardExamplePayload: 'Exemple de payload',
    cardUseCases: "Cas d'usage",
    cardSla: 'SLA',
    cardTraceLabel: "Trace de l'agent",
    cardResponseLabel: 'Réponse',
    footerRunning: 'En cours sur',
    footerSettled: 'Réglé via',
    footerStandard: 'Standard',
    footerMonetise: 'Monétisez votre endpoint :',
    footerTestnet: 'Testnet uniquement · Sans fonds réels · Circle Gateway regroupe les autorisations off-chain et règle on-chain périodiquement',
  },

  // ── Deutsch ───────────────────────────────────────────────────
  de: {
    docs: 'Dokumentation',
    heroBadgeNetwork: 'Arc Testnet',
    heroBadgeProtocol: 'HTTP x402',
    heroBadgeAuth: 'Gaslose Authentifizierung',
    heroHeadline1: 'Der API-Marktplatz',
    heroHeadline2: 'für KI-Agenten',
    heroSubtitle:
      'Jeder KI-Agent kann diese API-Dienste automatisch entdecken, bewerten und bezahlen – mithilfe des HTTP-402-Protokolls und Circle Gateway Nanopayments. Kein API-Schlüssel. Keine Registrierung. Kein Gas. Nur USDC.',
    heroCta: 'Agenten-Code anzeigen',
    heroCtaHide: 'Code ausblenden',
    heroCtaSeller: 'Schnellstart für Verkäufer',
    statServices: 'Dienste',
    statAvgResponse: 'Ø Antwortzeit',
    statMinPrice: 'Mindestpreis',
    statTotalCalls: 'Gesamtaufrufe',
    statVolume: 'Abgerechnetes Volumen',
    statSettlement: 'Abwicklung',
    statNetwork: 'Netzwerk',
    howTitle: 'So funktioniert es',
    howSubtitle: 'Das vollständige x402 + Circle Gateway Nanopayments-Protokoll — fünf Schritte, kein Gas, keine Registrierung',
    howStep1Title: 'Agent sendet eine unauthentifizierte Anfrage',
    howStep1Body:
      'Der KI-Agent ruft den API-Endpunkt ohne API-Schlüssel, OAuth-Token oder vorherige Registrierung auf. Der Server muss den Agenten nicht vorab kennen.',
    howStep2Title: 'Server antwortet mit HTTP 402 und Zahlungsanforderungen',
    howStep2Body:
      'Der Server antwortet mit HTTP 402 Payment Required und einem maschinenlesbaren JSON-Body: Preis in USDC, EVM-Adresse des Verkäufers, akzeptiertes Netzwerk und Zahlungsschema.',
    howStep3Title: 'Agent signiert eine Off-Chain-EIP-3009-Autorisierung',
    howStep3Body:
      'Der Agent analysiert die Zahlungsanforderungen und signiert eine transferWithAuthorization (EIP-3009)-Nachricht aus seiner Wallet. Rein kryptografische Signatur — keine On-Chain-Transaktion, kein Gas, keine Blockbestätigung erforderlich.',
    howStep4Title: 'Agent wiederholt die Anfrage mit dem X-Payment-Header',
    howStep4Body:
      'Der Agent sendet die Anfrage erneut mit der base64-kodierten EIP-3009-Signatur im X-Payment-Header. Die Gateway-Middleware überprüft die Signatur in unter einer Millisekunde und gibt sofort die bezahlte Antwort zurück.',
    howStep5Title: 'Circle Gateway bündelt und rechnet On-Chain ab',
    howStep5Body:
      'Circle Gateway sammelt Tausende signierter Autorisierungen off-chain und sendet periodisch eine einzelne gebündelte Transaktion an den USDC-Vertrag, um alle Zahlungen an die Wallet des Verkäufers zu überweisen.',
    catalogTitle: 'Dienstkatalog',
    catalogSubtitle: '8 kostenpflichtige APIs · Alle durch HTTP 402 geschützt · Abgerechnet über Circle Gateway',
    catalogFilterAll: 'Alle',
    cardPerCall: 'pro Aufruf',
    cardSimulate: 'Agenten-Aufruf simulieren',
    cardReset: 'Zurücksetzen',
    cardStatusReady: 'Bereit',
    cardStatusDetecting: '402 erkannt…',
    cardStatusNegotiating: 'Zahlung wird ausgehandelt…',
    cardStatusPaying: 'Zahlung über Gateway…',
    cardStatusSuccess: 'Bezahlt und beantwortet',
    cardStatusError: 'Fehler',
    cardTabOverview: 'Übersicht',
    cardTabSchema: 'Schema',
    cardTabTrace: 'Ablaufverfolgung',
    cardTabUseCases: 'Anwendungsfälle',
    cardRequest: 'Anfrage',
    cardResponse: 'Antwort',
    cardExamplePayload: 'Beispiel-Payload',
    cardUseCases: 'Anwendungsfälle',
    cardSla: 'SLA',
    cardTraceLabel: 'Agenten-Trace',
    cardResponseLabel: 'Antwort',
    footerRunning: 'Läuft auf',
    footerSettled: 'Abgerechnet über',
    footerStandard: 'Standard',
    footerMonetise: 'Monetarisieren Sie Ihren Endpunkt:',
    footerTestnet: 'Nur Testnet · Keine echten Mittel · Circle Gateway bündelt Off-Chain-Autorisierungen und rechnet On-Chain periodisch ab',
  },

  // ── 日本語 ────────────────────────────────────────────────────
  ja: {
    docs: 'ドキュメント',
    heroBadgeNetwork: 'Arc テストネット',
    heroBadgeProtocol: 'HTTP x402',
    heroBadgeAuth: 'ガスレス認証',
    heroHeadline1: 'AIエージェントのための',
    heroHeadline2: 'API マーケットプレイス',
    heroSubtitle:
      'どのAIエージェントも、HTTP 402プロトコルとCircle Gateway ナノペイメントを使って、これらのAPIサービスを自動的に発見・評価・支払いできます。APIキー不要、登録不要、ガス不要。USDCだけで完結。',
    heroCta: 'エージェントコードを表示',
    heroCtaHide: 'コードを隠す',
    heroCtaSeller: 'セラークイックスタート',
    statServices: 'サービス数',
    statAvgResponse: '平均応答時間',
    statMinPrice: '最低価格',
    statTotalCalls: '総呼び出し数',
    statVolume: '決済済み金額',
    statSettlement: '決済方式',
    statNetwork: 'ネットワーク',
    howTitle: '仕組み',
    howSubtitle: 'x402 + Circle Gateway ナノペイメントの完全なプロトコル — 5ステップ、ガスなし、登録なし',
    howStep1Title: 'エージェントが認証なしでリクエストを送信',
    howStep1Body:
      'AIエージェントはAPIキー、OAuthトークン、事前登録なしにAPIエンドポイントを呼び出します。サーバーはエージェントを事前に知る必要がありません。',
    howStep2Title: 'サーバーが支払い要件付きのHTTP 402を返す',
    howStep2Body:
      'サーバーはHTTP 402 Payment Requiredと機械可読なJSONボディで応答します：USDCでの価格、セラーのEVMアドレス、対応ネットワーク、支払いスキーム。',
    howStep3Title: 'エージェントがオフチェーンEIP-3009署名を行う',
    howStep3Body:
      'エージェントは支払い要件を解析し、ウォレットからtransferWithAuthorization（EIP-3009）メッセージに署名します。純粋な暗号署名で、オンチェーントランザクション不要、ガス不要、ブロック確認不要。',
    howStep4Title: 'エージェントがX-Paymentヘッダー付きで再試行',
    howStep4Body:
      'エージェントはbase64エンコードされたEIP-3009署名をX-Paymentヘッダーに付けて再試行します。Gatewayミドルウェアが1ミリ秒以内に署名を検証し、即座に有料レスポンスを返します。',
    howStep5Title: 'Circle Gatewayがオンチェーンで一括決済',
    howStep5Body:
      'Circle Gatewayはオフチェーンで何千もの署名済み承認を収集し、定期的に単一のバッチトランザクションをUSDCコントラクトに送信して、累積支払いをセラーのウォレットに転送します。',
    catalogTitle: 'サービスカタログ',
    catalogSubtitle: '8つの有料API · すべてHTTP 402で保護 · Circle Gateway経由で決済',
    catalogFilterAll: 'すべて',
    cardPerCall: '1回あたり',
    cardSimulate: 'エージェント呼び出しをシミュレート',
    cardReset: 'リセット',
    cardStatusReady: '準備完了',
    cardStatusDetecting: '402を検出中…',
    cardStatusNegotiating: '支払いを交渉中…',
    cardStatusPaying: 'Gateway経由で支払い中…',
    cardStatusSuccess: '支払い完了・応答済み',
    cardStatusError: '失敗',
    cardTabOverview: '概要',
    cardTabSchema: 'スキーマ',
    cardTabTrace: 'トレース',
    cardTabUseCases: 'ユースケース',
    cardRequest: 'リクエスト',
    cardResponse: 'レスポンス',
    cardExamplePayload: 'ペイロード例',
    cardUseCases: 'ユースケース',
    cardSla: 'SLA',
    cardTraceLabel: 'エージェントトレース',
    cardResponseLabel: 'レスポンス',
    footerRunning: '稼働中:',
    footerSettled: '決済:',
    footerStandard: 'プロトコル標準',
    footerMonetise: 'エンドポイントを収益化:',
    footerTestnet: 'テストネットのみ · 実資金なし · Circle GatewayはオフチェーンでAuthorizeを一括収集し、定期的にオンチェーンで決済します',
  },

  // ── العربية ──────────────────────────────────────────────────
  ar: {
    docs: 'التوثيق',
    heroBadgeNetwork: 'شبكة Arc التجريبية',
    heroBadgeProtocol: 'HTTP x402',
    heroBadgeAuth: 'مصادقة بلا غاز',
    heroHeadline1: 'سوق الـ API',
    heroHeadline2: 'المصمَّم لوكلاء الذكاء الاصطناعي',
    heroSubtitle:
      'يمكن لأي وكيل ذكاء اصطناعي اكتشاف هذه الخدمات وتقييمها والدفع مقابلها تلقائياً باستخدام بروتوكول HTTP 402 وخدمة Circle Gateway Nanopayments. لا مفاتيح API، لا تسجيل، لا رسوم غاز. فقط USDC.',
    heroCta: 'عرض كود الوكيل',
    heroCtaHide: 'إخفاء الكود',
    heroCtaSeller: 'دليل البائع السريع',
    statServices: 'الخدمات',
    statAvgResponse: 'متوسط الاستجابة',
    statMinPrice: 'الحد الأدنى للسعر',
    statTotalCalls: 'إجمالي المكالمات',
    statVolume: 'الحجم المُسوَّى',
    statSettlement: 'التسوية',
    statNetwork: 'الشبكة',
    howTitle: 'كيف يعمل',
    howSubtitle: 'البروتوكول الكامل x402 + Circle Gateway Nanopayments — خمس خطوات، بلا غاز، بلا تسجيل',
    howStep1Title: 'يُرسل الوكيل طلباً بدون مصادقة',
    howStep1Body:
      'يستدعي وكيل الذكاء الاصطناعي نقطة نهاية API بدون مفتاح API أو رمز OAuth أو تسجيل مسبق. لا يحتاج الخادم إلى معرفة الوكيل مسبقاً.',
    howStep2Title: 'يستجيب الخادم بـ HTTP 402 مع متطلبات الدفع',
    howStep2Body:
      'يستجيب الخادم بـ HTTP 402 Payment Required مع جسم JSON قابل للقراءة آلياً: السعر بالـ USDC، عنوان EVM للبائع، الشبكة المقبولة، ومخطط الدفع.',
    howStep3Title: 'يوقّع الوكيل تفويض EIP-3009 خارج السلسلة',
    howStep3Body:
      'يحلل الوكيل متطلبات الدفع ويوقّع رسالة transferWithAuthorization (EIP-3009) من محفظته. توقيع تشفيري بحت — بدون معاملة on-chain، بدون غاز، بدون تأكيد كتلة.',
    howStep4Title: 'يُعيد الوكيل المحاولة مع ترويسة X-Payment',
    howStep4Body:
      'يُعيد الوكيل المحاولة مع توقيع EIP-3009 المُرمَّز بـ base64 في ترويسة X-Payment. يتحقق وسيط Gateway من التوقيع خلال أقل من ميلي ثانية ويُعيد الاستجابة المدفوعة فوراً.',
    howStep5Title: 'يجمع Circle Gateway المعاملات ويُسوِّيها على السلسلة',
    howStep5Body:
      'يجمع Circle Gateway آلاف التفويضات الموقَّعة خارج السلسلة ويُرسل دورياً معاملة مجمَّعة واحدة إلى عقد USDC، لتحويل المبالغ المتراكمة إلى محفظة البائع.',
    catalogTitle: 'كتالوج الخدمات',
    catalogSubtitle: '8 APIs مدفوعة · جميعها محمية بـ HTTP 402 · مُسوَّاة عبر Circle Gateway',
    catalogFilterAll: 'الكل',
    cardPerCall: 'لكل استدعاء',
    cardSimulate: 'محاكاة استدعاء الوكيل',
    cardReset: 'إعادة تعيين',
    cardStatusReady: 'جاهز',
    cardStatusDetecting: 'اكتشاف 402…',
    cardStatusNegotiating: 'التفاوض على الدفع…',
    cardStatusPaying: 'الدفع عبر Gateway…',
    cardStatusSuccess: 'تم الدفع والاستجابة',
    cardStatusError: 'فشل',
    cardTabOverview: 'نظرة عامة',
    cardTabSchema: 'المخطط',
    cardTabTrace: 'التتبع',
    cardTabUseCases: 'حالات الاستخدام',
    cardRequest: 'الطلب',
    cardResponse: 'الاستجابة',
    cardExamplePayload: 'مثال على البيانات المُرسَلة',
    cardUseCases: 'حالات الاستخدام',
    cardSla: 'اتفاقية مستوى الخدمة',
    cardTraceLabel: 'تتبع الوكيل',
    cardResponseLabel: 'الاستجابة',
    footerRunning: 'يعمل على',
    footerSettled: 'مُسوَّى عبر',
    footerStandard: 'المعيار',
    footerMonetise: 'اجعل نقطة نهايتك مدفوعة:',
    footerTestnet: 'شبكة تجريبية فقط · بدون أموال حقيقية · يجمع Circle Gateway التفويضات خارج السلسلة ويُسوِّيها on-chain بشكل دوري',
  },

  // ── Português ─────────────────────────────────────────────────
  pt: {
    docs: 'Documentação',
    heroBadgeNetwork: 'Arc Testnet',
    heroBadgeProtocol: 'HTTP x402',
    heroBadgeAuth: 'Auth sem Gas',
    heroHeadline1: 'O marketplace de APIs',
    heroHeadline2: 'criado para agentes IA',
    heroSubtitle:
      'Qualquer agente de IA pode descobrir, avaliar e pagar por estes serviços de API automaticamente usando o protocolo HTTP 402 e os Nanopagamentos Circle Gateway. Sem chaves de API. Sem cadastro. Sem gas. Apenas USDC.',
    heroCta: 'Ver código do agente',
    heroCtaHide: 'Ocultar código',
    heroCtaSeller: 'Início rápido do vendedor',
    statServices: 'Serviços',
    statAvgResponse: 'Resp. média',
    statMinPrice: 'Preço mínimo',
    statTotalCalls: 'Total de chamadas',
    statVolume: 'Volume liquidado',
    statSettlement: 'Liquidação',
    statNetwork: 'Rede',
    howTitle: 'Como funciona',
    howSubtitle: 'O protocolo completo x402 + Circle Gateway Nanopagamentos — cinco etapas, sem gas, sem cadastro',
    howStep1Title: 'O agente envia uma requisição sem autenticação',
    howStep1Body:
      'O agente de IA chama o endpoint da API sem chave de API, sem token OAuth e sem cadastro prévio. O servidor não precisa conhecer o agente com antecedência.',
    howStep2Title: 'O servidor responde HTTP 402 com requisitos de pagamento',
    howStep2Body:
      'O servidor responde com HTTP 402 Payment Required e um corpo JSON legível por máquina: preço em USDC, endereço EVM do vendedor, rede aceita e esquema de pagamento.',
    howStep3Title: 'O agente assina uma autorização EIP-3009 fora da cadeia',
    howStep3Body:
      'O agente analisa os requisitos de pagamento e assina uma mensagem transferWithAuthorization (EIP-3009) de sua carteira. Assinatura puramente criptográfica — sem transação on-chain, sem gas, sem confirmação de bloco.',
    howStep4Title: 'O agente tenta novamente com o cabeçalho X-Payment',
    howStep4Body:
      'O agente tenta novamente com a assinatura EIP-3009 codificada em base64 no cabeçalho X-Payment. O middleware Gateway verifica a assinatura em menos de um milissegundo e retorna imediatamente a resposta paga.',
    howStep5Title: 'Circle Gateway agrupa e liquida on-chain',
    howStep5Body:
      'O Circle Gateway coleta milhares de autorizações assinadas fora da cadeia e envia periodicamente uma única transação em lote ao contrato USDC, transferindo os pagamentos acumulados para a carteira do vendedor.',
    catalogTitle: 'Catálogo de serviços',
    catalogSubtitle: '8 APIs pagas · Todas protegidas por HTTP 402 · Liquidadas via Circle Gateway',
    catalogFilterAll: 'Todos',
    cardPerCall: 'por chamada',
    cardSimulate: 'Simular chamada de agente',
    cardReset: 'Reiniciar',
    cardStatusReady: 'Pronto',
    cardStatusDetecting: 'Detectando 402…',
    cardStatusNegotiating: 'Negociando pagamento…',
    cardStatusPaying: 'Pagando via Gateway…',
    cardStatusSuccess: 'Pago e respondido',
    cardStatusError: 'Falha',
    cardTabOverview: 'Visão geral',
    cardTabSchema: 'Esquema',
    cardTabTrace: 'Rastreamento',
    cardTabUseCases: 'Casos de uso',
    cardRequest: 'Requisição',
    cardResponse: 'Resposta',
    cardExamplePayload: 'Exemplo de payload',
    cardUseCases: 'Casos de uso',
    cardSla: 'SLA',
    cardTraceLabel: 'Rastreamento do agente',
    cardResponseLabel: 'Resposta',
    footerRunning: 'Executando em',
    footerSettled: 'Liquidado via',
    footerStandard: 'Padrão',
    footerMonetise: 'Monetize seu endpoint:',
    footerTestnet: 'Somente testnet · Sem fundos reais · Circle Gateway agrupa autorizações off-chain e liquida on-chain periodicamente',
  },

  // ── 한국어 ────────────────────────────────────────────────────
  ko: {
    docs: '문서',
    heroBadgeNetwork: 'Arc 테스트넷',
    heroBadgeProtocol: 'HTTP x402',
    heroBadgeAuth: '가스리스 인증',
    heroHeadline1: 'AI 에이전트를 위한',
    heroHeadline2: 'API 마켓플레이스',
    heroSubtitle:
      '모든 AI 에이전트는 HTTP 402 프로토콜과 Circle Gateway 나노결제를 사용하여 이 API 서비스들을 자동으로 발견, 평가, 결제할 수 있습니다. API 키 불필요. 가입 불필요. 가스 불필요. USDC만 있으면 됩니다.',
    heroCta: '에이전트 코드 보기',
    heroCtaHide: '코드 숨기기',
    heroCtaSeller: '판매자 빠른 시작',
    statServices: '서비스 수',
    statAvgResponse: '평균 응답',
    statMinPrice: '최저 가격',
    statTotalCalls: '총 호출 수',
    statVolume: '정산 금액',
    statSettlement: '정산 방식',
    statNetwork: '네트워크',
    howTitle: '작동 원리',
    howSubtitle: '완전한 x402 + Circle Gateway 나노결제 프로토콜 — 5단계, 가스 없음, 가입 없음',
    howStep1Title: '에이전트가 인증 없이 요청 전송',
    howStep1Body:
      'AI 에이전트는 API 키, OAuth 토큰, 사전 가입 없이 API 엔드포인트를 호출합니다. 서버는 에이전트를 미리 알 필요가 없습니다.',
    howStep2Title: '서버가 결제 요구사항과 함께 HTTP 402 반환',
    howStep2Body:
      '서버는 HTTP 402 Payment Required와 기계가 읽을 수 있는 JSON 본문으로 응답합니다: USDC 가격, 판매자 EVM 주소, 허용 네트워크, 결제 방식.',
    howStep3Title: '에이전트가 오프체인 EIP-3009 서명 생성',
    howStep3Body:
      '에이전트는 결제 요구사항을 파싱하고 지갑에서 transferWithAuthorization (EIP-3009) 메시지에 서명합니다. 순수한 암호화 서명 — 온체인 트랜잭션, 가스, 블록 확인 불필요.',
    howStep4Title: '에이전트가 X-Payment 헤더와 함께 재시도',
    howStep4Body:
      '에이전트는 X-Payment 헤더에 base64 인코딩된 EIP-3009 서명을 포함하여 재시도합니다. Gateway 미들웨어가 1밀리초 이내에 서명을 검증하고 즉시 유료 응답을 반환합니다.',
    howStep5Title: 'Circle Gateway가 온체인 일괄 정산',
    howStep5Body:
      'Circle Gateway는 오프체인에서 수천 개의 서명된 인증을 수집하고 주기적으로 단일 일괄 트랜잭션을 USDC 계약에 제출하여 누적된 결제금을 판매자 지갑으로 전송합니다.',
    catalogTitle: '서비스 카탈로그',
    catalogSubtitle: '8개 유료 API · 모두 HTTP 402로 보호 · Circle Gateway를 통해 정산',
    catalogFilterAll: '전체',
    cardPerCall: '호출당',
    cardSimulate: '에이전트 호출 시뮬레이션',
    cardReset: '초기화',
    cardStatusReady: '준비됨',
    cardStatusDetecting: '402 감지 중…',
    cardStatusNegotiating: '결제 협상 중…',
    cardStatusPaying: 'Gateway 결제 중…',
    cardStatusSuccess: '결제 완료 및 응답',
    cardStatusError: '실패',
    cardTabOverview: '개요',
    cardTabSchema: '스키마',
    cardTabTrace: '트레이스',
    cardTabUseCases: '사용 사례',
    cardRequest: '요청',
    cardResponse: '응답',
    cardExamplePayload: '예시 페이로드',
    cardUseCases: '사용 사례',
    cardSla: 'SLA',
    cardTraceLabel: '에이전트 트레이스',
    cardResponseLabel: '응답',
    footerRunning: '실행 중:',
    footerSettled: '정산:',
    footerStandard: '표준',
    footerMonetise: '엔드포인트 수익화:',
    footerTestnet: '테스트넷 전용 · 실제 자금 없음 · Circle Gateway는 오프체인에서 인증을 일괄 수집하고 주기적으로 온체인에서 정산합니다',
  },
}
