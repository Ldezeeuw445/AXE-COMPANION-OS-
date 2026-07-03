/**
 * Broker Connection Hub — integration contracts
 *
 * Pure TypeScript interfaces. No runtime dependencies, no I/O.
 * Host apps inject adapters; this module never calls external services directly.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type BrokerProviderId = 'mt5-style' | 'alpaca-style' | 'ibkr-style' | string;

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'error';

export type TradingMode = 'paper' | 'live' | 'readonly';

export type MarketDataTier = 'none' | 'delayed' | 'realtime' | 'professional';

export type DoctorCheckStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export type PermissionScope =
  | 'read_account'
  | 'read_positions'
  | 'read_orders'
  | 'place_orders'
  | 'cancel_orders'
  | 'market_data'
  | 'streaming_quotes';

// ---------------------------------------------------------------------------
// Broker domain contracts
// ---------------------------------------------------------------------------

/** Describes what a broker integration can do before connecting an account. */
export interface BrokerAdapter {
  readonly id: BrokerProviderId;
  readonly displayName: string;
  readonly description: string;
  readonly supportedModes: readonly TradingMode[];
  readonly marketData: MarketDataCapability;
  readonly execution: ExecutionCapability;
  readonly requiredCredentials: readonly CredentialFieldSpec[];
  readonly optionalCredentials?: readonly CredentialFieldSpec[];
}

export interface CredentialFieldSpec {
  readonly key: string;
  readonly label: string;
  readonly kind: 'text' | 'password' | 'number' | 'select';
  readonly placeholder?: string;
  readonly options?: readonly { value: string; label: string }[];
}

/** A linked broker account instance (persisted shape for adapters). */
export interface AccountConnection {
  readonly id: string;
  readonly userId: string;
  readonly brokerId: BrokerProviderId;
  readonly label: string;
  readonly status: ConnectionStatus;
  readonly mode: TradingMode;
  readonly permissions: BrokerPermissionState;
  readonly connectedAt?: string;
  readonly lastSyncAt?: string;
  readonly lastError?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface MarketDataCapability {
  readonly supportsQuotes: boolean;
  readonly supportsDepth: boolean;
  readonly supportsHistoricalBars: boolean;
  readonly defaultTier: MarketDataTier;
  readonly availableTiers: readonly MarketDataTier[];
  readonly entitlementsRequired?: readonly string[];
}

export interface ExecutionCapability {
  readonly supportsMarketOrders: boolean;
  readonly supportsLimitOrders: boolean;
  readonly supportsStopOrders: boolean;
  readonly supportsBracketOrders: boolean;
  readonly supportsFractionalShares: boolean;
  readonly minOrderNotional?: number;
}

export interface BrokerPermissionState {
  readonly tradingEnabled: boolean;
  readonly readOnly: boolean;
  readonly marketDataTier: MarketDataTier;
  readonly grantedScopes: readonly PermissionScope[];
  readonly deniedScopes: readonly PermissionScope[];
  readonly expiresAt?: string;
}

export interface BrokerSymbolMapping {
  readonly id: string;
  readonly accountId: string;
  readonly canonicalSymbol: string;
  readonly brokerSymbol: string;
  readonly assetClass: 'equity' | 'forex' | 'crypto' | 'future' | 'option' | 'other';
  readonly exchange?: string;
  readonly multiplier?: number;
  readonly notes?: string;
}

export interface DoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly status: DoctorCheckStatus;
  readonly message: string;
  readonly remediation?: string;
}

export interface ConnectionDoctorResult {
  readonly accountId: string;
  readonly ranAt: string;
  readonly overallStatus: DoctorCheckStatus;
  readonly checks: readonly DoctorCheck[];
  readonly latencyMs?: number;
}

// ---------------------------------------------------------------------------
// Connect flow DTOs
// ---------------------------------------------------------------------------

export interface ConnectAccountInput {
  readonly brokerId: BrokerProviderId;
  readonly label: string;
  readonly mode: TradingMode;
  readonly credentials: Readonly<Record<string, string>>;
}

export interface ConnectAccountResult {
  readonly success: boolean;
  readonly account?: AccountConnection;
  readonly error?: string;
}

export interface UpdatePermissionsInput {
  readonly accountId: string;
  readonly tradingEnabled?: boolean;
  readonly readOnly?: boolean;
  readonly marketDataTier?: MarketDataTier;
}

// ---------------------------------------------------------------------------
// Integration adapters (host-provided)
// ---------------------------------------------------------------------------

export interface DatabaseAdapter {
  listAccounts(userId: string): Promise<AccountConnection[]>;
  getAccount(accountId: string): Promise<AccountConnection | null>;
  saveAccount(account: AccountConnection): Promise<AccountConnection>;
  deleteAccount(accountId: string): Promise<void>;
  listSymbolMappings(accountId: string): Promise<BrokerSymbolMapping[]>;
  saveSymbolMapping(mapping: BrokerSymbolMapping): Promise<BrokerSymbolMapping>;
}

export interface RealtimeAdapter {
  subscribeAccountStatus(
    accountId: string,
    handler: (status: ConnectionStatus) => void
  ): () => void;
  subscribeDoctorUpdates?(
    accountId: string,
    handler: (result: ConnectionDoctorResult) => void
  ): () => void;
}

/** Bridges to a real broker API; prototype uses in-memory mocks only. */
export interface BrokerApiAdapter {
  readonly brokerId: BrokerProviderId;
  connect(input: ConnectAccountInput): Promise<ConnectAccountResult>;
  disconnect(accountId: string): Promise<void>;
  runDoctor(accountId: string): Promise<ConnectionDoctorResult>;
  testCredentials?(
    brokerId: BrokerProviderId,
    credentials: Readonly<Record<string, string>>
  ): Promise<{ valid: boolean; message?: string }>;
}

export interface AuthUserAdapter {
  getCurrentUserId(): Promise<string>;
  getCurrentUserDisplayName?(): Promise<string>;
}

export interface ConfigSecretsAdapter {
  /** Store encrypted credential blob keyed by account id. Never log values. */
  storeCredentials(accountId: string, credentials: Record<string, string>): Promise<void>;
  loadCredentials(accountId: string): Promise<Record<string, string> | null>;
  deleteCredentials(accountId: string): Promise<void>;
}

/** Registry of broker API adapters keyed by provider id. */
export interface BrokerAdapterRegistry {
  get(brokerId: BrokerProviderId): BrokerApiAdapter | undefined;
  list(): BrokerApiAdapter[];
}

// ---------------------------------------------------------------------------
// Module configuration
// ---------------------------------------------------------------------------

export interface BrokerConnectionHubConfig {
  readonly database: DatabaseAdapter;
  readonly auth: AuthUserAdapter;
  readonly secrets: ConfigSecretsAdapter;
  readonly brokers: BrokerAdapterRegistry;
  readonly realtime?: RealtimeAdapter;
  /** Static catalog of supported broker definitions for UI. */
  readonly brokerCatalog: readonly BrokerAdapter[];
}
