import type { QuoteResponse } from "./funding.js";
import { requireSecureSwitchboardUrl, secureSwitchboardUrl, type SwitchboardTransportSecurityOptions } from "./transport.js";

export interface SwitchboardControlPlaneClientOptions extends SwitchboardTransportSecurityOptions {
  relayUrl: string;
  cliToken?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface SwitchboardRequestOptions extends SwitchboardTransportSecurityOptions {
  cliToken?: string;
  timeoutMs?: number;
}

export interface DeploymentIntentCreateInput {
  paidSeconds: string;
  sessionLabel?: string;
  jobId?: string;
  operatorId?: string;
  processorId?: string;
  gatewayId?: string;
  developer?: string;
  asset?: string;
  maxAmount?: string;
  source?: Record<string, unknown>;
}

export interface DeploymentIntentGroupCreateInput {
  paidSeconds: string;
  sessionLabel?: string;
  expectedReplicas: number;
  minReady: number;
  developer?: string;
  asset?: string;
  maxAmount?: string;
  members: Array<{
    memberId?: string;
    jobId?: string;
    operatorId: string;
    processorId: string;
    processor: string;
    gatewayId?: string;
    managerId?: string;
  }>;
  source?: Record<string, unknown>;
}

export interface DeploymentUpdateInput {
  acurastDeploymentId: string;
  jobId?: string;
  operatorId?: string;
  processorId?: string;
  processor?: string;
  upstreamPort?: number;
  source?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DeploymentIntentBootstrap {
  intentId: string;
  cliToken: string;
  groupId?: string;
  env: {
    SWITCHBOARD_RELAY_URL: string;
    SWITCHBOARD_INTENT_ID: string;
    SWITCHBOARD_INTENT_TOKEN: string;
  };
  intent?: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface DeploymentIntentGroupBootstrap {
  groupId: string;
  cliToken: string;
  env: {
    SWITCHBOARD_RELAY_URL: string;
    SWITCHBOARD_INTENT_GROUP_ID: string;
    SWITCHBOARD_INTENT_TOKEN: string;
  };
  group?: Record<string, unknown>;
  members: Record<string, unknown>[];
  raw: Record<string, unknown>;
}

export class SwitchboardControlPlaneClient {
  readonly relayUrl: string;
  readonly cliToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly allowInsecureHttp: boolean;

  constructor(options: SwitchboardControlPlaneClientOptions) {
    this.allowInsecureHttp = options.allowInsecureHttp === true;
    this.relayUrl = requireSecureSwitchboardUrl(options.relayUrl, "Switchboard control-plane relay URL", options).toString();
    this.cliToken = options.cliToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async health(options: SwitchboardRequestOptions = {}): Promise<Record<string, unknown>> {
    return this.requestJson("GET", "/health", undefined, options);
  }

  async createDeploymentIntent(input: DeploymentIntentCreateInput, options: SwitchboardRequestOptions = {}): Promise<DeploymentIntentBootstrap> {
    const raw = await this.requestJson("POST", "/v1/deployment-intents", input, options);
    const intentId = requiredString(raw, "intentId");
    const cliToken = requiredString(raw, "cliToken");
    const job = requiredRecord(raw, "job");
    const env = requiredRecord(job, "env");
    const jobToken = requiredString(job, "token");
    const envToken = requiredString(env, "SWITCHBOARD_INTENT_TOKEN");
    if (jobToken !== envToken) {
      throw new Error("Deployment intent response job.token does not match job.env.SWITCHBOARD_INTENT_TOKEN");
    }
    return {
      intentId,
      cliToken,
      env: {
        SWITCHBOARD_RELAY_URL: requiredString(env, "SWITCHBOARD_RELAY_URL"),
        SWITCHBOARD_INTENT_ID: requiredString(env, "SWITCHBOARD_INTENT_ID"),
        SWITCHBOARD_INTENT_TOKEN: envToken
      },
      intent: recordField(raw, "intent"),
      raw
    };
  }

  async createDeploymentIntentGroup(
    input: DeploymentIntentGroupCreateInput,
    options: SwitchboardRequestOptions = {}
  ): Promise<DeploymentIntentGroupBootstrap> {
    const raw = await this.requestJson("POST", "/v1/deployment-intent-groups", input, options);
    const groupId = requiredString(raw, "groupId");
    const cliToken = requiredString(raw, "cliToken");
    const job = requiredRecord(raw, "job");
    const env = requiredRecord(job, "env");
    return {
      groupId,
      cliToken,
      env: {
        SWITCHBOARD_RELAY_URL: requiredString(env, "SWITCHBOARD_RELAY_URL"),
        SWITCHBOARD_INTENT_GROUP_ID: requiredString(env, "SWITCHBOARD_INTENT_GROUP_ID"),
        SWITCHBOARD_INTENT_TOKEN: requiredString(env, "SWITCHBOARD_INTENT_TOKEN")
      },
      group: recordField(raw, "group"),
      members: arrayField(raw, "members"),
      raw
    };
  }

  async readDeploymentIntent(intentId: string, options: SwitchboardRequestOptions = {}): Promise<Record<string, unknown>> {
    return this.requestJson("GET", `/v1/deployment-intents/${encodeURIComponent(intentId)}`, undefined, options);
  }

  async readDeploymentIntentGroup(groupId: string, options: SwitchboardRequestOptions = {}): Promise<Record<string, unknown>> {
    return this.requestJson("GET", `/v1/deployment-intent-groups/${encodeURIComponent(groupId)}`, undefined, options);
  }

  async updateDeploymentIntentDeployment(
    intentId: string,
    input: DeploymentUpdateInput,
    options: SwitchboardRequestOptions = {}
  ): Promise<Record<string, unknown>> {
    return this.requestJson("POST", `/v1/deployment-intents/${encodeURIComponent(intentId)}/deployment`, input, options);
  }

  async updateDeploymentIntentGroupDeployment(
    groupId: string,
    input: DeploymentUpdateInput,
    options: SwitchboardRequestOptions = {}
  ): Promise<Record<string, unknown>> {
    return this.requestJson("POST", `/v1/deployment-intent-groups/${encodeURIComponent(groupId)}/deployment`, input, options);
  }

  async requestDeploymentIntentQuote(
    intentId: string,
    input: Record<string, unknown>,
    options: SwitchboardRequestOptions = {}
  ): Promise<QuoteResponse> {
    return this.requestJson("POST", `/v1/deployment-intents/${encodeURIComponent(intentId)}/quote`, input, options) as unknown as Promise<QuoteResponse>;
  }

  async requestDeploymentIntentGroupMemberQuote(
    groupId: string,
    intentId: string,
    input: Record<string, unknown>,
    options: SwitchboardRequestOptions = {}
  ): Promise<QuoteResponse> {
    return this.requestJson(
      "POST",
      `/v1/deployment-intent-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(intentId)}/quote`,
      input,
      options
    ) as unknown as Promise<QuoteResponse>;
  }

  async quotePreview(input: Record<string, unknown>, options: SwitchboardRequestOptions = {}): Promise<Record<string, unknown>> {
    return this.requestJson("POST", "/v1/quote-preview", input, options);
  }

  async refreshDeploymentIntentFunding(intentId: string, options: SwitchboardRequestOptions = {}): Promise<Record<string, unknown>> {
    return this.requestJson("POST", `/v1/deployment-intents/${encodeURIComponent(intentId)}/funding-refresh`, undefined, options);
  }

  async refreshDeploymentIntentGroupMemberFunding(
    groupId: string,
    intentId: string,
    options: SwitchboardRequestOptions = {}
  ): Promise<Record<string, unknown>> {
    return this.requestJson(
      "POST",
      `/v1/deployment-intent-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(intentId)}/funding-refresh`,
      undefined,
      options
    );
  }

  async refreshDeploymentIntentGroupMemberRoute(
    groupId: string,
    intentId: string,
    options: SwitchboardRequestOptions = {}
  ): Promise<Record<string, unknown>> {
    return this.requestJson(
      "POST",
      `/v1/deployment-intent-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(intentId)}/route-refresh`,
      undefined,
      options
    );
  }

  async refreshDeploymentIntentRoute(intentId: string, options: SwitchboardRequestOptions = {}): Promise<Record<string, unknown>> {
    return this.requestJson("POST", `/v1/deployment-intents/${encodeURIComponent(intentId)}/route-refresh`, undefined, options);
  }

  async readDeploymentIntentObservability(intentId: string, options: SwitchboardRequestOptions = {}): Promise<Record<string, unknown>> {
    return this.requestJson("GET", `/v1/deployment-intents/${encodeURIComponent(intentId)}/observability`, undefined, options);
  }

  async listValidationReports(
    filters: { sessionId?: string; hostname?: string; limit?: number } = {},
    options: SwitchboardRequestOptions = {}
  ): Promise<Record<string, unknown>> {
    const url = new URL("/v1/validation-reports", this.relayUrl);
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return this.requestJsonUrl("GET", url, undefined, options);
  }

  async attachCustomerHostname(
    endpointId: string,
    input: Record<string, unknown>,
    options: SwitchboardRequestOptions = {}
  ): Promise<Record<string, unknown>> {
    return this.requestJson("POST", `/v1/endpoints/${encodeURIComponent(endpointId)}/customer-hostnames`, input, options);
  }

  async readCustomerHostname(
    endpointId: string,
    hostname: string,
    options: SwitchboardRequestOptions = {}
  ): Promise<Record<string, unknown>> {
    return this.requestJson("GET", `/v1/endpoints/${encodeURIComponent(endpointId)}/customer-hostnames/${encodeURIComponent(hostname)}`, undefined, options);
  }

  async removeCustomerHostname(
    endpointId: string,
    hostname: string,
    input: Record<string, unknown> = {},
    options: SwitchboardRequestOptions = {}
  ): Promise<Record<string, unknown>> {
    return this.requestJson("DELETE", `/v1/endpoints/${encodeURIComponent(endpointId)}/customer-hostnames/${encodeURIComponent(hostname)}`, input, options);
  }

  private requestJson(
    method: string,
    pathname: string,
    body: object | undefined,
    options: SwitchboardRequestOptions
  ): Promise<Record<string, unknown>> {
    return this.requestJsonUrl(
      method,
      secureSwitchboardUrl(pathname, this.relayUrl, "Switchboard control-plane relay URL", this.transportOptions(options)),
      body,
      options
    );
  }

  private async requestJsonUrl(
    method: string,
    url: URL,
    body: object | undefined,
    options: SwitchboardRequestOptions
  ): Promise<Record<string, unknown>> {
    requireSecureSwitchboardUrl(url, "Switchboard control-plane request URL", this.transportOptions(options));
    const token = options.cliToken ?? this.cliToken;
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(compactObject(body as Record<string, unknown>)) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs)
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok || (json && typeof json === "object" && "ok" in json && (json as { ok?: unknown }).ok === false)) {
      throw new Error(`${method} ${url.pathname} failed (${response.status}): ${text.slice(0, 1000)}`);
    }
    return json as Record<string, unknown>;
  }

  private transportOptions(options: SwitchboardRequestOptions = {}): SwitchboardTransportSecurityOptions {
    return { allowInsecureHttp: options.allowInsecureHttp === true || this.allowInsecureHttp };
  }
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ""));
}

function requiredString(record: Record<string, unknown>, name: string): string {
  const value = record[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function requiredRecord(record: Record<string, unknown>, name: string): Record<string, unknown> {
  const value = record[name];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function recordField(record: Record<string, unknown>, name: string): Record<string, unknown> | undefined {
  const value = record[name];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function arrayField(record: Record<string, unknown>, name: string): Record<string, unknown>[] {
  const value = record[name];
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}
