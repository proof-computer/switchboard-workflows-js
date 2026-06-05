import { ethers } from "ethers";
import { secureSwitchboardUrl, type SwitchboardTransportSecurityOptions } from "./transport.js";

export const EIP712_DOMAIN_NAME = "ProofIngress";
export const EIP712_DOMAIN_VERSION = "1";
export const MAX_INGRESS_QUOTE_PAID_SECONDS = 28n * 24n * 60n * 60n;

export const INGRESS_REGISTRY_ABI = [
  "function fundWithAssetQuote((bytes32 quoteId,bytes32 sessionId,address developer,address asset,uint256 amount,uint256 minAmount,uint256 maxAmount,uint256 paidSeconds,uint256 serviceAmount,uint256 setupFee,uint256 validationFeeCap,bytes32 jobId,address expectedJobSigner,bytes32 operatorId,bytes32 processorId,bytes32 endpointHash,bytes32 salt,address operatorRecipient,address validatorRecipient,address proofRecipient,uint16 maxOperatorBps,uint16 maxValidatorBps,uint16 maxProofBps,bytes32 policyHash,uint256 deadline) q, bytes signature)",
  "function claim(address asset)",
  "function refundAfterActivationTimeout(bytes32 sessionId)",
  "function refundUnfulfilled(bytes32 sessionId)"
] as const;

const ERC20_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)"
] as const;

const QUOTE_TYPEHASH = ethers.id("Quote(bytes32 quoteId,bytes32 routeHash,bytes32 economicsHash,uint256 deadline)");
const QUOTE_ROUTE_TYPEHASH = ethers.id(
  "QuoteRoute(bytes32 sessionId,address developer,address asset,bytes32 jobId,address expectedJobSigner,bytes32 operatorId,bytes32 processorId,bytes32 endpointHash,bytes32 salt)"
);
const QUOTE_ECONOMICS_TYPEHASH = ethers.id(
  "QuoteEconomics(bytes32 paymentHash,bytes32 recipientsHash,bytes32 capsHash,bytes32 policyHash)"
);
const QUOTE_PAYMENT_TYPEHASH = ethers.id(
  "QuotePayment(uint256 amount,uint256 minAmount,uint256 maxAmount,uint256 paidSeconds,uint256 serviceAmount,uint256 setupFee,uint256 validationFeeCap)"
);
const QUOTE_RECIPIENTS_TYPEHASH = ethers.id(
  "QuoteRecipients(address operatorRecipient,address validatorRecipient,address proofRecipient)"
);
const QUOTE_CAPS_TYPEHASH = ethers.id(
  "QuoteCaps(uint16 maxOperatorBps,uint16 maxValidatorBps,uint16 maxProofBps)"
);

export interface IngressQuote {
  quoteId: string;
  sessionId: string;
  developer: string;
  asset: string;
  amount: bigint;
  minAmount: bigint;
  maxAmount: bigint;
  paidSeconds: bigint;
  serviceAmount: bigint;
  setupFee: bigint;
  validationFeeCap: bigint;
  jobId: string;
  expectedJobSigner: string;
  operatorId: string;
  processorId: string;
  endpointHash: string;
  salt: string;
  operatorRecipient: string;
  validatorRecipient: string;
  proofRecipient: string;
  maxOperatorBps: number;
  maxValidatorBps: number;
  maxProofBps: number;
  policyHash: string;
  deadline: bigint;
}

export interface BuildIngressQuoteInput {
  chainId: bigint | number | string;
  registryAddress: string;
  developer: string;
  asset: string;
  amount?: bigint;
  serviceAmount?: bigint;
  setupFee?: bigint;
  validationFeeCap?: bigint;
  minAmount?: bigint;
  maxAmount?: bigint;
  paidSeconds: bigint;
  expectedJobSigner: string;
  operatorRecipient: string;
  validatorRecipient: string;
  proofRecipient: string;
  maxOperatorBps?: number;
  maxValidatorBps?: number;
  maxProofBps?: number;
  policyHash: string;
  deadline: bigint | number | string;
  quoteId?: string;
  sessionLabel?: string;
  jobId?: string;
  operatorId?: string;
  processorId?: string;
  endpointHostname?: string;
  endpointHash?: string;
  salt?: string;
}

export interface SerializedIngressQuote extends Omit<IngressQuote,
  "amount" | "minAmount" | "maxAmount" | "paidSeconds" | "serviceAmount" | "setupFee" | "validationFeeCap" | "deadline"> {
  amount: string;
  minAmount: string;
  maxAmount: string;
  paidSeconds: string;
  serviceAmount: string;
  setupFee: string;
  validationFeeCap: string;
  deadline: string;
}

export interface IngressQuoteBindingRequest {
  developer: string;
  asset: string;
  paidSeconds: string | bigint | number;
  maxAmount?: string | bigint | number;
  expectedJobSigner: string;
  jobId?: string;
  operatorId?: string;
  processorId?: string;
  endpointHash?: string;
  endpointHostname?: string;
  salt?: string;
}

export interface RebindIngressQuoteEndpointInput {
  quote: IngressQuote | Record<string, unknown>;
  chainId: bigint | number | string;
  registryAddress: string;
  endpointHostname?: string;
  endpointHash?: string;
  sessionLabel?: string;
  policy?: unknown;
}

export interface QuoteResponse {
  ok: boolean;
  quote: Record<string, unknown>;
  signature: string;
  endpointHostname?: string;
  validationHostname?: string;
  policy?: unknown;
  allocation?: unknown;
  intent?: Record<string, unknown>;
  dns?: unknown;
  funding?: unknown;
  lineItems?: unknown;
  pricingPolicy?: unknown;
}

export interface HubFundingAction {
  id: "mapAccount" | "approve" | "fundWithAssetQuote";
  chain: "polkadot-asset-hub";
  description: string;
  to?: string;
  value?: string;
  calldata?: string;
  revive?: {
    contract: string;
    value: string;
    calldata: string;
    storageDepositLimit?: string;
    weightLimit?: { refTime: string; proofSize: string };
  };
}

export interface HubFundingActionPlan {
  quote: SerializedIngressQuote;
  signature: string;
  registryAddress: string;
  developer: {
    polkadotAddress?: string;
    contractLayerAddress: string;
  };
  actions: HubFundingAction[];
}

export interface BuildHubFundingActionPlanInput {
  quote: IngressQuote | Record<string, unknown>;
  signature: string;
  registryAddress: string;
  developer: {
    polkadotAddress?: string;
    contractLayerAddress: string;
  };
  accountMapped?: boolean;
  currentAllowance?: bigint | string | number;
  storageDepositLimit?: bigint | string | number;
  weightLimit?: { refTime: string | bigint | number; proofSize: string | bigint | number };
}

export interface RefundActionPlanInput {
  sessionId: string;
  status: number | string;
  activationDeadline?: string | number | bigint;
  refundAvailableAt?: string | number | bigint;
  nowSeconds?: number;
  reason?: "activation-timeout" | "unfulfilled";
}

export interface RegistryActionDescription {
  action: "claim" | "refundAfterActivationTimeout" | "refundUnfulfilled";
  contract: string;
  args: string[];
  calldata: string;
  eligible?: boolean;
  reason?: string;
}

export interface RequestQuoteOptions extends SwitchboardTransportSecurityOptions {
  relayUrl: string;
  body: Record<string, unknown>;
  cliToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface RequestDeploymentIntentQuoteOptions extends RequestQuoteOptions {
  intentId: string;
  quoteBindingRequest?: Record<string, unknown>;
  resumePollMs?: number;
}

export interface RequestDeploymentIntentGroupMemberQuoteOptions extends RequestDeploymentIntentQuoteOptions {
  groupId: string;
}

export const DEFAULT_DEPLOYMENT_INTENT_QUOTE_TIMEOUT_MS = 60_000;
export const DEPLOYMENT_INTENT_QUOTE_RESUME_POLL_MS = 2_000;

export function normalizeIngressQuote(input: Record<string, unknown>): IngressQuote {
  return {
    quoteId: bytes32(input.quoteId, "quote.quoteId"),
    sessionId: bytes32(input.sessionId, "quote.sessionId"),
    developer: ethers.getAddress(requiredString(input.developer, "quote.developer")),
    asset: ethers.getAddress(requiredString(input.asset, "quote.asset")),
    amount: bigintField(input.amount, "quote.amount"),
    minAmount: bigintField(input.minAmount, "quote.minAmount"),
    maxAmount: bigintField(input.maxAmount, "quote.maxAmount"),
    paidSeconds: bigintField(input.paidSeconds, "quote.paidSeconds"),
    serviceAmount: bigintField(input.serviceAmount, "quote.serviceAmount"),
    setupFee: bigintField(input.setupFee, "quote.setupFee"),
    validationFeeCap: bigintField(input.validationFeeCap, "quote.validationFeeCap"),
    jobId: bytes32(input.jobId, "quote.jobId"),
    expectedJobSigner: ethers.getAddress(requiredString(input.expectedJobSigner, "quote.expectedJobSigner")),
    operatorId: bytes32(input.operatorId, "quote.operatorId"),
    processorId: bytes32(input.processorId, "quote.processorId"),
    endpointHash: bytes32(input.endpointHash, "quote.endpointHash"),
    salt: bytes32(input.salt, "quote.salt"),
    operatorRecipient: ethers.getAddress(requiredString(input.operatorRecipient, "quote.operatorRecipient")),
    validatorRecipient: ethers.getAddress(requiredString(input.validatorRecipient, "quote.validatorRecipient")),
    proofRecipient: ethers.getAddress(requiredString(input.proofRecipient, "quote.proofRecipient")),
    maxOperatorBps: numberField(input.maxOperatorBps, "quote.maxOperatorBps"),
    maxValidatorBps: numberField(input.maxValidatorBps, "quote.maxValidatorBps"),
    maxProofBps: numberField(input.maxProofBps, "quote.maxProofBps"),
    policyHash: bytes32(input.policyHash, "quote.policyHash"),
    deadline: bigintField(input.deadline, "quote.deadline")
  };
}

export function serializeIngressQuote(quote: IngressQuote): SerializedIngressQuote {
  return {
    ...quote,
    amount: quote.amount.toString(),
    minAmount: quote.minAmount.toString(),
    maxAmount: quote.maxAmount.toString(),
    paidSeconds: quote.paidSeconds.toString(),
    serviceAmount: quote.serviceAmount.toString(),
    setupFee: quote.setupFee.toString(),
    validationFeeCap: quote.validationFeeCap.toString(),
    deadline: quote.deadline.toString()
  };
}

export function buildIngressQuote(input: BuildIngressQuoteInput): IngressQuote {
  const setupFee = input.setupFee ?? 0n;
  const validationFeeCap = input.validationFeeCap ?? 0n;
  const serviceAmount = input.serviceAmount ?? input.amount;
  if (serviceAmount === undefined) {
    throw new Error("quote serviceAmount must be provided");
  }
  const amount = input.amount ?? serviceAmount + setupFee + validationFeeCap;
  if (setupFee < 0n || validationFeeCap < 0n) {
    throw new Error("quote fees cannot be negative");
  }
  if (amount <= 0n || serviceAmount <= 0n || amount !== serviceAmount + setupFee + validationFeeCap) {
    throw new Error("quote amount must equal serviceAmount plus fee caps");
  }
  if (input.paidSeconds <= 0n) {
    throw new Error("quote paidSeconds must be positive");
  }
  if (input.paidSeconds > MAX_INGRESS_QUOTE_PAID_SECONDS) {
    throw new Error("quote paidSeconds exceeds the 28 day Acurast job maximum");
  }

  const sessionLabel = input.sessionLabel ?? `ingress-${Date.now()}`;
  const asset = ethers.getAddress(input.asset);
  if (asset === ethers.ZeroAddress) {
    throw new Error("quote asset must be a non-native ERC20 address");
  }
  const developer = ethers.getAddress(input.developer);
  const expectedJobSigner = ethers.getAddress(input.expectedJobSigner);
  const endpointHostname = input.endpointHostname ?? `${toDnsLabel(sessionLabel)}.ingress.test`;
  const endpointHashValue = input.endpointHash ? ethers.hexlify(input.endpointHash) : endpointHash(endpointHostname);
  const jobId = input.jobId ?? idBytes32(`${sessionLabel}:job`);
  const operatorId = input.operatorId ?? idBytes32("proof-operator-local");
  const processorId = input.processorId ?? idBytes32("processor-local-1");
  const salt = input.salt ?? idBytes32(`${sessionLabel}:session`);
  const sessionId = deriveIngressSessionId({
    chainId: input.chainId,
    registryAddress: input.registryAddress,
    developerAddress: developer,
    assetAddress: asset,
    jobId,
    expectedJobSigner,
    operatorId,
    processorId,
    endpointHash: endpointHashValue,
    salt
  });

  return {
    quoteId: input.quoteId ?? ethers.hexlify(ethers.randomBytes(32)),
    sessionId,
    developer,
    asset,
    amount,
    minAmount: input.minAmount ?? amount,
    maxAmount: input.maxAmount ?? amount,
    paidSeconds: input.paidSeconds,
    serviceAmount,
    setupFee,
    validationFeeCap,
    jobId,
    expectedJobSigner,
    operatorId,
    processorId,
    endpointHash: endpointHashValue,
    salt,
    operatorRecipient: ethers.getAddress(input.operatorRecipient),
    validatorRecipient: ethers.getAddress(input.validatorRecipient),
    proofRecipient: ethers.getAddress(input.proofRecipient),
    maxOperatorBps: input.maxOperatorBps ?? 8_000,
    maxValidatorBps: input.maxValidatorBps ?? 500,
    maxProofBps: input.maxProofBps ?? 2_000,
    policyHash: ethers.hexlify(input.policyHash),
    deadline: BigInt(input.deadline)
  };
}

export function ingressQuoteToContractTuple(quote: IngressQuote) {
  return {
    quoteId: quote.quoteId,
    sessionId: quote.sessionId,
    developer: quote.developer,
    asset: quote.asset,
    amount: quote.amount,
    minAmount: quote.minAmount,
    maxAmount: quote.maxAmount,
    paidSeconds: quote.paidSeconds,
    serviceAmount: quote.serviceAmount,
    setupFee: quote.setupFee,
    validationFeeCap: quote.validationFeeCap,
    jobId: quote.jobId,
    expectedJobSigner: quote.expectedJobSigner,
    operatorId: quote.operatorId,
    processorId: quote.processorId,
    endpointHash: quote.endpointHash,
    salt: quote.salt,
    operatorRecipient: quote.operatorRecipient,
    validatorRecipient: quote.validatorRecipient,
    proofRecipient: quote.proofRecipient,
    maxOperatorBps: quote.maxOperatorBps,
    maxValidatorBps: quote.maxValidatorBps,
    maxProofBps: quote.maxProofBps,
    policyHash: quote.policyHash,
    deadline: quote.deadline
  };
}

export function encodeFundWithAssetQuote(quote: IngressQuote, signature: string): string {
  return new ethers.Interface(INGRESS_REGISTRY_ABI).encodeFunctionData(
    "fundWithAssetQuote",
    [ingressQuoteToContractTuple(quote), signature]
  );
}

export function hashIngressQuote(
  quote: IngressQuote,
  domain: { chainId: bigint | number | string; registryAddress: string }
): string {
  const domainSeparator = ethers.TypedDataEncoder.hashDomain({
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId: domain.chainId,
    verifyingContract: ethers.getAddress(domain.registryAddress)
  });
  const routeHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "address", "address", "bytes32", "address", "bytes32", "bytes32", "bytes32", "bytes32"],
      [QUOTE_ROUTE_TYPEHASH, quote.sessionId, quote.developer, quote.asset, quote.jobId, quote.expectedJobSigner, quote.operatorId, quote.processorId, quote.endpointHash, quote.salt]
    )
  );
  const paymentHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
      [QUOTE_PAYMENT_TYPEHASH, quote.amount, quote.minAmount, quote.maxAmount, quote.paidSeconds, quote.serviceAmount, quote.setupFee, quote.validationFeeCap]
    )
  );
  const recipientsHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address", "address", "address"],
      [QUOTE_RECIPIENTS_TYPEHASH, quote.operatorRecipient, quote.validatorRecipient, quote.proofRecipient]
    )
  );
  const capsHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint16", "uint16", "uint16"],
      [QUOTE_CAPS_TYPEHASH, quote.maxOperatorBps, quote.maxValidatorBps, quote.maxProofBps]
    )
  );
  const economicsHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "bytes32", "bytes32", "bytes32"],
      [QUOTE_ECONOMICS_TYPEHASH, paymentHash, recipientsHash, capsHash, quote.policyHash]
    )
  );
  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "bytes32", "bytes32", "uint256"],
      [QUOTE_TYPEHASH, quote.quoteId, routeHash, economicsHash, quote.deadline]
    )
  );
  return ethers.keccak256(ethers.concat(["0x1901", domainSeparator, structHash]));
}

export function signIngressQuote(
  quote: IngressQuote,
  domain: { chainId: bigint | number | string; registryAddress: string },
  quoteSignerPrivateKey: string
): string {
  return new ethers.Wallet(quoteSignerPrivateKey).signingKey.sign(hashIngressQuote(quote, domain)).serialized;
}

export function assertIngressQuoteMatchesRequest(quote: IngressQuote, request: IngressQuoteBindingRequest): void {
  const developer = ethers.getAddress(request.developer);
  const asset = ethers.getAddress(request.asset);
  const expectedJobSigner = ethers.getAddress(request.expectedJobSigner);
  const paidSeconds = parseUint(request.paidSeconds, "requested paidSeconds");

  if (ethers.getAddress(quote.developer) !== developer) {
    throw new Error(`Quote developer ${quote.developer} does not match requested developer ${developer}`);
  }
  if (ethers.getAddress(quote.asset) !== asset) {
    throw new Error(`Quote asset ${quote.asset} does not match requested asset ${asset}`);
  }
  if (quote.paidSeconds !== paidSeconds) {
    throw new Error(`Quote paidSeconds ${quote.paidSeconds.toString()} does not match requested paidSeconds ${paidSeconds.toString()}`);
  }
  if (request.maxAmount !== undefined) {
    const maxAmount = parseUint(request.maxAmount, "requested maxAmount");
    if (quote.amount !== maxAmount || quote.maxAmount !== maxAmount) {
      throw new Error(`Quote amount ${quote.amount.toString()} does not match requested maxAmount ${maxAmount.toString()}`);
    }
  }
  if (ethers.getAddress(quote.expectedJobSigner) !== expectedJobSigner) {
    throw new Error(`Quote expectedJobSigner ${quote.expectedJobSigner} does not match requested job signer ${expectedJobSigner}`);
  }
  assertOptionalBytes32("jobId", quote.jobId, request.jobId);
  assertOptionalBytes32("operatorId", quote.operatorId, request.operatorId);
  assertOptionalBytes32("processorId", quote.processorId, request.processorId);
  assertOptionalBytes32("salt", quote.salt, request.salt);

  if (request.endpointHash) {
    assertOptionalBytes32("endpointHash", quote.endpointHash, request.endpointHash);
  } else if (request.endpointHostname) {
    const requestedEndpointHash = endpointHash(request.endpointHostname);
    if (normalizeBytes32(quote.endpointHash, "quote.endpointHash") !== requestedEndpointHash) {
      throw new Error(`Quote endpointHash ${quote.endpointHash} does not match requested endpoint hostname ${request.endpointHostname}`);
    }
  }
}

export function rebindIngressQuoteEndpoint(input: RebindIngressQuoteEndpointInput): IngressQuote {
  const quote = "amount" in input.quote && typeof input.quote.amount === "bigint"
    ? input.quote as IngressQuote
    : normalizeIngressQuote(input.quote as Record<string, unknown>);
  if (!input.endpointHostname && !input.endpointHash) {
    return quote;
  }
  const policy = input.policy === undefined
    ? undefined
    : rebindIngressQuotePolicyEndpoint(input.policy, {
        endpointHostname: input.endpointHostname,
        endpointHash: input.endpointHash
      });

  return buildIngressQuote({
    chainId: input.chainId,
    registryAddress: input.registryAddress,
    developer: quote.developer,
    asset: quote.asset,
    amount: quote.amount,
    minAmount: quote.minAmount,
    maxAmount: quote.maxAmount,
    paidSeconds: quote.paidSeconds,
    serviceAmount: quote.serviceAmount,
    setupFee: quote.setupFee,
    validationFeeCap: quote.validationFeeCap,
    expectedJobSigner: quote.expectedJobSigner,
    operatorRecipient: quote.operatorRecipient,
    validatorRecipient: quote.validatorRecipient,
    proofRecipient: quote.proofRecipient,
    maxOperatorBps: quote.maxOperatorBps,
    maxValidatorBps: quote.maxValidatorBps,
    maxProofBps: quote.maxProofBps,
    policyHash: policy === undefined ? quote.policyHash : policyHashFromJson(policy),
    deadline: quote.deadline,
    quoteId: quote.quoteId,
    sessionLabel: input.sessionLabel,
    jobId: quote.jobId,
    operatorId: quote.operatorId,
    processorId: quote.processorId,
    endpointHostname: input.endpointHostname,
    endpointHash: input.endpointHash,
    salt: quote.salt
  });
}

export function policyHashFromJson(value: unknown): string {
  return ethers.keccak256(ethers.toUtf8Bytes(stableJson(value)));
}

export function assertQuoteWithinCap(quote: IngressQuote, capAmount: string | bigint | number | undefined): void {
  if (capAmount === undefined || capAmount === "") return;
  const cap = parseUint(capAmount, "quote cap amount");
  if (quote.amount > cap) {
    throw new Error(`Current quote amount ${quote.amount.toString()} exceeds preview cap ${cap.toString()}`);
  }
}

export async function requestIngressQuote(options: RequestQuoteOptions): Promise<QuoteResponse> {
  return postQuote(
    options.fetchImpl ?? fetch,
    secureSwitchboardUrl("/v1/ingress-intents", options.relayUrl, "Switchboard quote relay URL", options),
    options.body,
    undefined,
    options.timeoutMs
  );
}

export async function requestDeploymentIntentQuote(options: RequestDeploymentIntentQuoteOptions): Promise<QuoteResponse> {
  return postQuote(
    options.fetchImpl ?? fetch,
    secureSwitchboardUrl(
      `/v1/deployment-intents/${encodeURIComponent(options.intentId)}/quote`,
      options.relayUrl,
      "Switchboard quote relay URL",
      options
    ),
    options.body,
    options.cliToken,
    options.timeoutMs
  );
}

export async function requestDeploymentIntentGroupMemberQuote(
  options: RequestDeploymentIntentGroupMemberQuoteOptions
): Promise<QuoteResponse> {
  return postQuote(
    options.fetchImpl ?? fetch,
    secureSwitchboardUrl(
      `/v1/deployment-intent-groups/${encodeURIComponent(options.groupId)}/members/${encodeURIComponent(options.intentId)}/quote`,
      options.relayUrl,
      "Switchboard quote relay URL",
      options
    ),
    options.body,
    options.cliToken,
    options.timeoutMs
  );
}

export async function requestDeploymentIntentQuoteOrResume(
  options: RequestDeploymentIntentQuoteOptions
): Promise<QuoteResponse> {
  try {
    return await requestDeploymentIntentQuote(options);
  } catch (error) {
    if (!isTimeoutError(error)) throw error;
    return resumeDeploymentIntentQuote(options, "Deployment intent quote request");
  }
}

export async function requestDeploymentIntentGroupMemberQuoteOrResume(
  options: RequestDeploymentIntentGroupMemberQuoteOptions
): Promise<QuoteResponse> {
  try {
    return await requestDeploymentIntentGroupMemberQuote(options);
  } catch (error) {
    if (!isTimeoutError(error)) throw error;
    return resumeDeploymentIntentQuote(options, "Deployment intent group member quote request");
  }
}

export function quoteResponseFromDeploymentIntentStatus(
  status: Record<string, unknown>,
  request: Record<string, unknown>,
  nowSeconds = Math.floor(Date.now() / 1000)
): QuoteResponse | undefined {
  const intent = objectField(status, "intent");
  const envelope = objectField(intent, "quote");
  const quote = objectField(envelope, "quote");
  const signature = stringField(envelope, "signature");
  if (!intent || !envelope || !quote || !signature) return undefined;

  const normalized = normalizeIngressQuote(quote);
  try {
    assertIngressQuoteMatchesRequest(normalized, {
      developer: requiredString(request.developer, "request.developer"),
      asset: requiredString(request.asset, "request.asset"),
      paidSeconds: stringField(request, "paidSeconds") ?? stringField(request, "durationSeconds") ?? "",
      maxAmount: stringField(request, "maxAmount"),
      expectedJobSigner: requiredString(request.expectedJobSigner, "request.expectedJobSigner"),
      jobId: stringField(request, "jobId"),
      operatorId: stringField(request, "operatorId"),
      processorId: stringField(request, "processorId"),
      endpointHash: stringField(request, "endpointHash"),
      endpointHostname: stringField(request, "endpointHostname"),
      salt: stringField(request, "salt")
    });
  } catch {
    return undefined;
  }
  if (normalized.deadline <= BigInt(nowSeconds)) return undefined;

  return {
    ok: true,
    quote,
    signature,
    endpointHostname: stringField(intent, "endpointHostname"),
    validationHostname: stringField(intent, "validationHostname"),
    policy: envelope.policy,
    allocation: intent.allocation,
    intent
  };
}

export function describeDeploymentIntentStatus(status: Record<string, unknown>): string {
  const intent = objectField(status, "intent");
  if (!intent) return "intent status missing";
  const dns = objectField(intent, "dns");
  const events = Array.isArray(intent.events) ? intent.events : [];
  const latest = events.at(-1);
  const latestDetails = objectField(latest, "details");
  return [
    `status=${stringField(intent, "status") ?? "unknown"}`,
    `dns=${stringField(dns, "status") ?? "missing"}`,
    `dnsError=${stringField(dns, "lastError") ?? "none"}`,
    `latestEvent=${stringField(latest, "type") ?? "none"}`,
    `latestReason=${stringField(latestDetails, "lastError") ?? stringField(latestDetails, "reason") ?? "none"}`
  ].join(" ");
}

export function buildHubFundingActionPlan(input: BuildHubFundingActionPlanInput): HubFundingActionPlan {
  const quote = "amount" in input.quote && typeof input.quote.amount === "bigint"
    ? input.quote as IngressQuote
    : normalizeIngressQuote(input.quote as Record<string, unknown>);
  const registryAddress = ethers.getAddress(input.registryAddress);
  const developerContract = ethers.getAddress(input.developer.contractLayerAddress);
  const allowance = input.currentAllowance === undefined ? 0n : parseUint(input.currentAllowance, "currentAllowance");
  const storageDepositLimit = input.storageDepositLimit === undefined ? undefined : parseUint(input.storageDepositLimit, "storageDepositLimit").toString();
  const weightLimit = input.weightLimit
    ? {
        refTime: parseUint(input.weightLimit.refTime, "weightLimit.refTime").toString(),
        proofSize: parseUint(input.weightLimit.proofSize, "weightLimit.proofSize").toString()
      }
    : undefined;
  const actions: HubFundingAction[] = [];
  if (input.accountMapped === false) {
    actions.push({
      id: "mapAccount",
      chain: "polkadot-asset-hub",
      description: `Map ${input.developer.polkadotAddress ?? "the Polkadot signer"} to Revive contract address ${developerContract}`
    });
  }
  if (allowance < quote.amount) {
    const calldata = new ethers.Interface(ERC20_ABI).encodeFunctionData("approve", [registryAddress, quote.amount]);
    actions.push({
      id: "approve",
      chain: "polkadot-asset-hub",
      description: `Approve ${quote.amount.toString()} payment-asset units for Switchboard registry funding`,
      to: quote.asset,
      value: "0",
      calldata,
      revive: { contract: quote.asset, value: "0", calldata, storageDepositLimit, weightLimit }
    });
  }
  const fundCalldata = encodeFundWithAssetQuote(quote, input.signature);
  actions.push({
    id: "fundWithAssetQuote",
    chain: "polkadot-asset-hub",
    description: `Fund Switchboard session ${quote.sessionId}`,
    to: registryAddress,
    value: "0",
    calldata: fundCalldata,
    revive: { contract: registryAddress, value: "0", calldata: fundCalldata, storageDepositLimit, weightLimit }
  });
  return {
    quote: serializeIngressQuote(quote),
    signature: input.signature,
    registryAddress,
    developer: { ...input.developer, contractLayerAddress: developerContract },
    actions
  };
}

export function describeClaimAction(registryAddress: string, assetAddress: string): RegistryActionDescription {
  const contract = ethers.getAddress(registryAddress);
  const asset = ethers.getAddress(assetAddress);
  return {
    action: "claim",
    contract,
    args: [asset],
    calldata: new ethers.Interface(INGRESS_REGISTRY_ABI).encodeFunctionData("claim", [asset])
  };
}

export function planRefundAction(registryAddress: string, input: RefundActionPlanInput): RegistryActionDescription {
  const contract = ethers.getAddress(registryAddress);
  const status = Number(input.status);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const requested = input.reason;
  if (status === 4 || status === 5) {
    return refundPlan(contract, "refundAfterActivationTimeout", input.sessionId, false, "closed");
  }
  if (requested === "unfulfilled") {
    const availableAt = input.refundAvailableAt === undefined ? undefined : Number(parseUint(input.refundAvailableAt, "refundAvailableAt"));
    return refundPlan(contract, "refundUnfulfilled", input.sessionId, availableAt === undefined ? true : nowSeconds > availableAt, "refund_not_available_yet");
  }
  const activationDeadline = input.activationDeadline === undefined ? undefined : Number(parseUint(input.activationDeadline, "activationDeadline"));
  return refundPlan(
    contract,
    "refundAfterActivationTimeout",
    input.sessionId,
    activationDeadline === undefined ? status !== 3 : nowSeconds > activationDeadline,
    "activation_timeout_not_available_yet"
  );
}

export function endpointHash(hostname: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(hostname.toLowerCase()));
}

export function idBytes32(value: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

export function deriveIngressSessionId(input: {
  chainId: bigint | number | string;
  registryAddress: string;
  developerAddress: string;
  assetAddress: string;
  jobId: string;
  expectedJobSigner: string;
  operatorId: string;
  processorId: string;
  endpointHash: string;
  salt: string;
}): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "address", "address", "address", "bytes32", "address", "bytes32", "bytes32", "bytes32", "bytes32"],
      [
        idBytes32("PROOF_INGRESS_SESSION_V1"),
        input.chainId,
        ethers.getAddress(input.registryAddress),
        ethers.getAddress(input.developerAddress),
        ethers.getAddress(input.assetAddress),
        ethers.hexlify(input.jobId),
        ethers.getAddress(input.expectedJobSigner),
        ethers.hexlify(input.operatorId),
        ethers.hexlify(input.processorId),
        ethers.hexlify(input.endpointHash),
        ethers.hexlify(input.salt)
      ]
    )
  );
}

async function resumeDeploymentIntentQuote(
  options: RequestDeploymentIntentQuoteOptions,
  label: string
): Promise<QuoteResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DEPLOYMENT_INTENT_QUOTE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const resumeDeadline = Date.now() + (timeoutMs >= 1_000 ? Math.min(timeoutMs, 30_000) : 0);
  let status = await requestDeploymentIntentStatus(fetchImpl, options, timeoutMs);
  while (true) {
    const resumed = quoteResponseFromDeploymentIntentStatus(status, options.quoteBindingRequest ?? options.body);
    if (resumed) return resumed;
    const remainingMs = resumeDeadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(options.resumePollMs ?? DEPLOYMENT_INTENT_QUOTE_RESUME_POLL_MS, remainingMs));
    status = await requestDeploymentIntentStatus(fetchImpl, options, timeoutMs);
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms and no reusable quote was available for ${options.intentId}: ${describeDeploymentIntentStatus(status)}`);
}

async function postQuote(
  fetchImpl: typeof fetch,
  url: URL,
  body: Record<string, unknown>,
  cliToken: string | undefined,
  timeoutMs = DEFAULT_DEPLOYMENT_INTENT_QUOTE_TIMEOUT_MS
): Promise<QuoteResponse> {
  if (url.pathname.includes("/deployment-intents/") && !cliToken) {
    throw new Error("Missing deployment intent CLI token.");
  }
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cliToken ? { authorization: `Bearer ${cliToken}` } : {})
    },
    body: JSON.stringify(compactObject(body)),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok || json.ok !== true) {
    throw new Error(`Quote request failed with ${response.status}: ${JSON.stringify(json)}`);
  }
  return json as QuoteResponse;
}

async function requestDeploymentIntentStatus(
  fetchImpl: typeof fetch,
  options: RequestDeploymentIntentQuoteOptions,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  const { intentId, cliToken } = options;
  if (!cliToken) throw new Error("Missing deployment intent CLI token.");
  const response = await fetchImpl(secureSwitchboardUrl(
    `/v1/deployment-intents/${encodeURIComponent(intentId)}`,
    options.relayUrl,
    "Switchboard quote status relay URL",
    options
  ), {
    method: "GET",
    headers: { authorization: `Bearer ${cliToken}` },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok || json.ok !== true) {
    throw new Error(`Deployment intent status request failed with ${response.status}: ${JSON.stringify(json)}`);
  }
  return json as Record<string, unknown>;
}

function refundPlan(
  contract: string,
  action: "refundAfterActivationTimeout" | "refundUnfulfilled",
  sessionId: string,
  eligible: boolean,
  reason: string
): RegistryActionDescription {
  const normalizedSessionId = bytes32(sessionId, "sessionId");
  return {
    action,
    contract,
    args: [normalizedSessionId],
    calldata: new ethers.Interface(INGRESS_REGISTRY_ABI).encodeFunctionData(action, [normalizedSessionId]),
    eligible,
    reason: eligible ? undefined : reason
  };
}

function assertOptionalBytes32(name: string, actual: string, expected: string | undefined): void {
  if (!expected) return;
  const normalizedActual = normalizeBytes32(actual, `quote.${name}`);
  const normalizedExpected = normalizeBytes32(expected, `requested ${name}`);
  if (normalizedActual !== normalizedExpected) {
    throw new Error(`Quote ${name} ${actual} does not match requested ${name} ${normalizedExpected}`);
  }
}

function normalizeBytes32(value: string, name: string): string {
  const hex = ethers.hexlify(value);
  if (ethers.dataLength(hex) !== 32) throw new Error(`${name} must be bytes32`);
  return hex.toLowerCase();
}

function bytes32(value: unknown, name: string): string {
  const stringValue = requiredString(value, name);
  const hexValue = ethers.hexlify(stringValue);
  if (ethers.dataLength(hexValue) !== 32) throw new Error(`${name} must be bytes32`);
  return hexValue;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function bigintField(value: unknown, name: string): bigint {
  return parseUint(value as string | bigint | number, name);
}

function numberField(value: unknown, name: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return Number(value);
  throw new Error(`${name} must be a non-negative integer`);
}

function parseUint(value: string | bigint | number, name: string): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error(`${name} must be non-negative`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`);
    return BigInt(value);
  }
  if (!/^[0-9]+$/.test(value)) throw new Error(`${name} must be a non-negative integer string`);
  return BigInt(value);
}

function objectField(input: unknown, name: string): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = (input as Record<string, unknown>)[name];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringField(input: unknown, name: string): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = (input as Record<string, unknown>)[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ""));
}

function rebindIngressQuotePolicyEndpoint(
  policy: unknown,
  input: { endpointHostname?: string; endpointHash?: string }
): unknown {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return policy;
  const next: Record<string, unknown> = { ...(policy as Record<string, unknown>) };
  const existingEndpoint = objectField(next, "endpoint");
  const endpoint = existingEndpoint ? { ...existingEndpoint } : {};
  if (input.endpointHostname) endpoint.hostname = input.endpointHostname;
  if (input.endpointHash) endpoint.endpointHash = normalizeBytes32(input.endpointHash, "requested endpointHash");
  next.endpoint = endpoint;
  return next;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function toDnsLabel(value: string): string {
  const label = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return label.length > 0 ? label.slice(0, 63) : "ingress";
}

function isTimeoutError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && ["TimeoutError", "AbortError"].includes(String((error as { name?: unknown }).name)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
