import { randomBytes, randomUUID } from "node:crypto";

import type {
  DeploymentIntentBootstrap,
  DeploymentIntentCreateInput,
  DeploymentIntentGroupBootstrap,
  DeploymentIntentGroupCreateInput,
  SwitchboardIngressRequirement,
  SwitchboardControlPlaneClient
} from "./control-plane.js";
import type { QuoteResponse } from "./funding.js";

const DEFAULT_ACTIVATION_DEADLINE_SAFETY_MS = 60_000;

export type SwitchboardDeployWorkflowStep =
  | "initialized"
  | "capacity_selected"
  | "intent_created"
  | "deploy_action_required"
  | "deploy_submitted"
  | "runtime_claimed"
  | "quote_ready"
  | "funding_action_required"
  | "funding_submitted"
  | "dns_propagated"
  | "route_not_ready"
  | "route_active"
  | "registration_observed"
  | "validation_observed"
  | "complete"
  | "failed";

export interface SwitchboardDeployWorkflowInput {
  deploymentMode?: "single" | "group";
  relayUrl: string;
  allowInsecureHttp?: boolean;
  jobId?: string;
  sessionLabel?: string;
  developer?: string;
  target: {
    name: string;
    chainId: string;
    registryAddress: string;
    ethRpcUrl?: string;
    substrateWsUrl?: string;
  };
  durationSeconds: number;
  entrypoint?: string;
  runtime?: Record<string, unknown>;
  asset?: string;
  quoteCapAmount?: string;
  certificateMode?: "job-acme" | "self-signed";
  validatorMode?: "skip" | "local" | "acurast";
  capacity?: SwitchboardCapacitySelection;
  ingress?: SwitchboardIngressRequirement;
  group?: {
    expectedReplicas: number;
    minReady: number;
    members: SwitchboardGroupMemberSelection[];
  };
  pins?: {
    operatorId?: string;
    processorId?: string;
    processor?: string;
    gatewayId?: string;
    managerId?: string;
  };
  source?: Record<string, unknown>;
}

export interface SwitchboardGroupMemberSelection extends SwitchboardCapacitySelection {
  memberId?: string;
  jobId?: string;
}

export interface SwitchboardCapacitySelection {
  operatorId: string;
  processorId: string;
  processor?: string;
  gatewayId?: string;
  managerId?: string;
  reportId?: string;
  reportExpiresAt?: string;
  publicAddresses?: string[];
  sourceRelayUrl?: string;
}

export interface WorkflowRequiredAction {
  id: string;
  kind: "acurast.deploy" | "hub.fund" | "confirm.spend" | string;
  description: string;
  payload: JsonObject;
}

export interface WorkflowActionReceipt {
  actionId: string;
  kind: string;
  receipt: JsonObject;
}

export interface SwitchboardDeployWorkflowEvent {
  sequence: number;
  at: string;
  type: string;
  details?: JsonObject;
}

export interface SwitchboardDeployWorkflowSnapshot {
  version: 1;
  workflowId: string;
  step: SwitchboardDeployWorkflowStep;
  input: SwitchboardDeployWorkflowInput;
  data: JsonObject;
  requiredAction?: WorkflowRequiredAction;
  events: SwitchboardDeployWorkflowEvent[];
  updatedAt: string;
}

export interface SwitchboardDeployWorkflowReport {
  ok: true;
  workflowId: string;
  snapshot: SwitchboardDeployWorkflowSnapshot;
  deployment?: JsonObject;
  deploymentIntentGroup?: JsonObject;
  session?: JsonObject;
  quote?: JsonObject;
  funding?: JsonObject;
  route?: JsonObject;
  validation?: JsonObject;
}

export interface AcurastDeployRequiredActionPayload extends JsonObject {
  workflowId: string;
  jobId: string;
  capacity: SwitchboardCapacitySelection;
  deploymentIntent: DeploymentIntentBootstrap;
  sensitiveFields: string[];
}

export interface AcurastDeployReceiptPayload extends JsonObject {
  adapter: "switchboard-deploy" | string;
  ok: boolean;
  deploymentId?: string;
  txHash?: string;
  jobId?: string;
  processor?: string;
  processorId?: string;
  operatorId?: string;
  gatewayId?: string;
  schedule?: JsonObject;
  deploymentIntentId?: string;
  reportPath?: string;
}

export interface AcurastGroupDeployRequiredActionPayload extends JsonObject {
  workflowId: string;
  deploymentMode: "group";
  jobId: string;
  deploymentIntentGroup: DeploymentIntentGroupBootstrap;
  group: {
    expectedReplicas: number;
    minReady: number;
    members: SwitchboardGroupMemberSelection[];
  };
  capacity: SwitchboardCapacitySelection;
  sensitiveFields: string[];
}

export interface AcurastGroupDeployReceiptPayload extends JsonObject {
  adapter: "switchboard-deploy" | string;
  ok: boolean;
  deployment?: JsonObject;
  deploymentIntentGroup?: JsonObject;
  ha?: JsonObject;
  funding?: JsonObject;
  route?: JsonObject;
  validation?: JsonObject;
  reportPath?: string;
  failure?: JsonObject;
}

export interface HubFundRequiredActionPayload extends JsonObject {
  workflowId: string;
  deploymentIntent: {
    intentId: string;
    relayUrl?: string;
  };
  quote: QuoteResponse;
  session: {
    sessionId?: string;
    endpointHostname?: string;
    validationHostname?: string;
  };
  target: SwitchboardDeployWorkflowInput["target"];
  metadata: {
    jobId?: string;
    operatorId?: string;
    processorId?: string;
    gatewayId?: string;
  };
  sensitiveFields: string[];
}

export interface AcurastDeploymentAdapter {
  submit(input: {
    workflow: SwitchboardDeployWorkflowSnapshot;
    deploymentIntent?: DeploymentIntentBootstrap;
    deploymentIntentGroup?: DeploymentIntentGroupBootstrap;
  }): Promise<JsonObject | WorkflowRequiredAction>;
}

export interface HubFundingAdapter {
  requestQuote(input: {
    workflow: SwitchboardDeployWorkflowSnapshot;
    deploymentIntent: DeploymentIntentBootstrap;
    runtime: JsonObject;
  }): Promise<QuoteResponse>;
  fundQuote(input: {
    workflow: SwitchboardDeployWorkflowSnapshot;
    deploymentIntent: DeploymentIntentBootstrap;
    quote: QuoteResponse;
    runtime?: JsonObject;
  }): Promise<JsonObject | WorkflowRequiredAction>;
}

export interface CapacityAdapter {
  select(input: SwitchboardDeployWorkflowInput): Promise<SwitchboardCapacitySelection>;
}

export interface ConfirmationAdapter {
  confirmSpend(input: {
    workflow: SwitchboardDeployWorkflowSnapshot;
    deploymentIntent: DeploymentIntentBootstrap;
    quote: QuoteResponse;
  }): Promise<boolean>;
}

export interface WorkflowStore {
  save(snapshot: SwitchboardDeployWorkflowSnapshot): Promise<void> | void;
}

export interface SwitchboardDeployWorkflowAdapters {
  controlPlane: Pick<SwitchboardControlPlaneClient,
    "createDeploymentIntent" |
    "createDeploymentIntentGroup" |
    "readDeploymentIntentGroup" |
    "updateDeploymentIntentDeployment" |
    "updateDeploymentIntentGroupDeployment" |
    "readDeploymentIntent" |
    "requestDeploymentIntentGroupMemberQuote" |
    "refreshDeploymentIntentFunding" |
    "refreshDeploymentIntentGroupMemberFunding" |
    "refreshDeploymentIntentRoute" |
    "refreshDeploymentIntentGroupMemberRoute" |
    "listValidationReports">;
  acurast: AcurastDeploymentAdapter;
  funding: HubFundingAdapter;
  capacity?: CapacityAdapter;
  confirmation?: ConfirmationAdapter;
  store?: WorkflowStore;
}

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: any;
}

export class SwitchboardDeployWorkflow {
  private snapshotValue: SwitchboardDeployWorkflowSnapshot;
  private readonly adapters: SwitchboardDeployWorkflowAdapters;

  constructor(input: SwitchboardDeployWorkflowInput, adapters: SwitchboardDeployWorkflowAdapters, snapshot?: SwitchboardDeployWorkflowSnapshot) {
    this.adapters = adapters;
    const workflowInput: SwitchboardDeployWorkflowInput = {
      ...input,
      deploymentMode: input.deploymentMode ?? "single",
      jobId: input.jobId ?? bytes32(),
      group: input.group ? normalizeGroupInput(input.group) : undefined,
      validatorMode: input.validatorMode ?? "skip",
      certificateMode: input.certificateMode ?? "job-acme"
    };
    this.snapshotValue = snapshot ?? {
      version: 1,
      workflowId: randomUUID(),
      step: "initialized",
      input: workflowInput,
      data: {},
      events: [],
      updatedAt: new Date().toISOString()
    };
  }

  get snapshot(): SwitchboardDeployWorkflowSnapshot {
    return structuredClone(this.snapshotValue);
  }

  async runToBlocked(): Promise<SwitchboardDeployWorkflowSnapshot> {
    while (!["complete", "failed", "deploy_action_required", "funding_action_required"].includes(this.snapshotValue.step)) {
      const before = this.snapshotValue.step;
      await this.advanceOnce();
      if (this.snapshotValue.step === before) break;
    }
    return this.snapshot;
  }

  async advanceOnce(): Promise<SwitchboardDeployWorkflowSnapshot> {
    try {
      switch (this.snapshotValue.step) {
        case "initialized":
          await this.selectCapacity();
          break;
        case "capacity_selected":
          await this.createIntent();
          break;
        case "intent_created":
          await this.submitDeploy();
          break;
        case "deploy_submitted":
          if (this.snapshotValue.input.deploymentMode === "group") {
            await this.observeGroupRuntime();
          } else {
            await this.observeRuntime();
          }
          break;
        case "runtime_claimed":
          if (this.snapshotValue.input.deploymentMode === "group") {
            await this.requestGroupQuotes();
          } else {
            await this.requestQuote();
          }
          break;
        case "quote_ready":
          if (this.snapshotValue.input.deploymentMode === "group") {
            await this.fundGroupQuotes();
          } else {
            await this.fundQuote();
          }
          break;
        case "funding_submitted":
          if (this.snapshotValue.input.deploymentMode === "group") {
            await this.refreshGroupFundingAndDns();
          } else {
            await this.refreshFundingAndDns();
          }
          break;
        case "dns_propagated":
          if (this.snapshotValue.input.deploymentMode === "group") {
            await this.refreshGroupRoutes();
          } else {
            await this.refreshRoute();
          }
          break;
        case "route_active":
          if (this.snapshotValue.input.deploymentMode === "group") {
            await this.observeGroupRegistration();
          } else {
            await this.observeRegistration();
          }
          break;
        case "registration_observed":
          if (this.snapshotValue.input.deploymentMode === "group") {
            await this.observeGroupValidation();
          } else {
            await this.observeValidation();
          }
          break;
        case "validation_observed":
          this.transition("complete", "final_report", this.reportData());
          break;
      }
      await this.persist();
      return this.snapshot;
    } catch (error) {
      this.transition("failed", "workflow_failed", { error: errorMessage(error) });
      await this.persist();
      throw error;
    }
  }

  async applyActionReceipt(receipt: WorkflowActionReceipt): Promise<SwitchboardDeployWorkflowSnapshot> {
    const required = this.snapshotValue.requiredAction;
    if (!required || required.id !== receipt.actionId) {
      throw new Error(`Receipt ${receipt.actionId} does not match the current required action`);
    }
    this.snapshotValue.data.actionReceipts = [
      ...(Array.isArray(this.snapshotValue.data.actionReceipts) ? this.snapshotValue.data.actionReceipts : []),
      jsonSafe(receipt)
    ];
    if (this.snapshotValue.step === "deploy_action_required") {
      if (this.snapshotValue.input.deploymentMode === "group") {
        await this.applyGroupDeployReceipt(receipt);
        await this.persist();
        return this.snapshot;
      }
      this.snapshotValue.data.deployment = receipt.receipt;
      this.snapshotValue.requiredAction = undefined;
      this.transition("deploy_submitted", "deploy_action_submitted", receipt.receipt);
      await this.persist();
      return this.snapshot;
    }
    if (this.snapshotValue.step === "funding_action_required") {
      if (this.snapshotValue.input.deploymentMode === "group") {
        this.applyGroupFundingReceipt(receipt);
        await this.persist();
        return this.snapshot;
      }
      this.snapshotValue.data.funding = receipt.receipt;
      this.snapshotValue.requiredAction = undefined;
      this.transition("funding_submitted", "funding_action_submitted", receipt.receipt);
      await this.persist();
      return this.snapshot;
    }
    throw new Error(`Workflow step ${this.snapshotValue.step} is not waiting for an action receipt`);
  }

  private async applyGroupDeployReceipt(receipt: WorkflowActionReceipt): Promise<void> {
    const payload = receipt.receipt as AcurastGroupDeployReceiptPayload;
    this.snapshotValue.data.deployment = recordValue(payload.deployment);
    this.snapshotValue.data.deploymentIntentGroupReport = recordValue(payload.deploymentIntentGroup);
    this.snapshotValue.data.ha = recordValue(payload.ha);
    this.snapshotValue.data.funding = recordValue(payload.funding);
    this.snapshotValue.data.route = recordValue(payload.route);
    this.snapshotValue.data.validation = recordValue(payload.validation);
    this.snapshotValue.data.reportPath = payload.reportPath;
    if (payload.ok === true) {
      this.snapshotValue.requiredAction = undefined;
      this.transition("deploy_submitted", "group_deploy_submitted", {
        reportPath: payload.reportPath,
        groupId: stringValue(recordValue(payload.deploymentIntentGroup).groupId) ?? this.deploymentIntentGroup().groupId,
        deploymentId: stringValue(recordValue(payload.deployment).deploymentId)
      });
      return;
    }
    this.snapshotValue.requiredAction = {
      ...(this.snapshotValue.requiredAction as WorkflowRequiredAction),
      payload: {
        ...recordValue(this.snapshotValue.requiredAction?.payload),
        previousFailure: recordValue(payload.failure),
        reportPath: payload.reportPath
      }
    };
    this.transition("deploy_action_required", "group_deploy_failed", {
      reportPath: payload.reportPath,
      failure: recordValue(payload.failure)
    });
  }

  report(): SwitchboardDeployWorkflowReport | undefined {
    if (this.snapshotValue.step !== "complete") return undefined;
    return {
      ok: true,
      workflowId: this.snapshotValue.workflowId,
      snapshot: this.snapshot,
      ...this.reportData()
    };
  }

  private async selectCapacity(): Promise<void> {
    const capacity = this.snapshotValue.input.capacity ?? await this.adapters.capacity?.select(this.snapshotValue.input);
    if (!capacity) {
      if (workflowInputHasRelayAllocatedIngress(this.snapshotValue.input)) {
        const relayCapacity = {
          selection: "relay-deployment-intent-allocation",
          ingress: this.snapshotValue.input.ingress
        };
        this.snapshotValue.data.capacity = relayCapacity;
        this.transition("capacity_selected", "relay_capacity_required", relayCapacity);
        return;
      }
      throw new Error("No capacity selection is available for deploy workflow");
    }
    this.snapshotValue.data.capacity = capacity as unknown as JsonObject;
    this.transition("capacity_selected", "capacity_selected", capacity as unknown as JsonObject);
  }

  private async createIntent(): Promise<void> {
    if (this.snapshotValue.input.deploymentMode === "group") {
      await this.createGroupIntent();
      return;
    }
    const input = this.snapshotValue.input;
    const capacity = this.snapshotValue.data.capacity as JsonObject;
    const body: DeploymentIntentCreateInput = {
      paidSeconds: String(input.durationSeconds),
      jobId: input.jobId,
      sessionLabel: input.sessionLabel ?? `switchboard-${this.snapshotValue.workflowId}`,
      developer: input.developer,
      operatorId: hex32String(capacity.operatorId),
      processorId: hex32String(capacity.processorId),
      gatewayId: stringValue(capacity.gatewayId),
      asset: input.asset,
      maxAmount: input.quoteCapAmount,
      ingress: input.ingress,
      source: { mode: "switchboard-sdk-workflow", workflowId: this.snapshotValue.workflowId, ...(input.source ?? {}) }
    };
    const intent = await this.adapters.controlPlane.createDeploymentIntent(body);
    const selectedCapacity = deploymentIntentCapacity(intent);
    if (selectedCapacity) {
      this.snapshotValue.data.capacity = selectedCapacity;
    }
    this.snapshotValue.data.deploymentIntent = intent as unknown as JsonObject;
    this.transition("intent_created", "intent_created", { intentId: intent.intentId, relayAllocatedCapacity: Boolean(selectedCapacity) });
  }

  private async createGroupIntent(): Promise<void> {
    const input = this.snapshotValue.input;
    const capacity = this.snapshotValue.data.capacity as JsonObject;
    const group = input.group;
    if (!group || group.members.length === 0) {
      throw new Error("Group deploy workflow input is missing members");
    }
    const body: DeploymentIntentGroupCreateInput = {
      paidSeconds: String(input.durationSeconds),
      sessionLabel: input.sessionLabel ?? `switchboard-${this.snapshotValue.workflowId}`,
      expectedReplicas: group.expectedReplicas,
      minReady: group.minReady,
      developer: input.developer,
      asset: input.asset,
      maxAmount: input.quoteCapAmount,
      members: group.members.map((member, index) => ({
        memberId: member.memberId ?? `member-${index + 1}`,
        jobId: member.jobId,
        operatorId: member.operatorId,
        processorId: member.processorId,
        processor: member.processor ?? member.processorId,
        gatewayId: member.gatewayId,
        managerId: member.managerId
      })),
      source: { mode: "switchboard-sdk-workflow-group", workflowId: this.snapshotValue.workflowId, ...(input.source ?? {}) }
    };
    const deploymentIntentGroup = await this.adapters.controlPlane.createDeploymentIntentGroup(body);
    this.snapshotValue.data.deploymentIntentGroup = deploymentIntentGroup as unknown as JsonObject;
    this.transition("intent_created", "intent_group_created", {
      groupId: deploymentIntentGroup.groupId,
      expectedReplicas: group.expectedReplicas,
      minReady: group.minReady,
      members: group.members.length,
      operatorId: stringValue(capacity.operatorId)
    });
  }

  private async submitDeploy(): Promise<void> {
    const deploymentIntent = this.snapshotValue.input.deploymentMode === "group" ? undefined : this.deploymentIntent();
    const deploymentIntentGroup = this.snapshotValue.input.deploymentMode === "group" ? this.deploymentIntentGroup() : undefined;
    const result = await this.adapters.acurast.submit({ workflow: this.snapshot, deploymentIntent, deploymentIntentGroup });
    if (isRequiredAction(result)) {
      this.snapshotValue.requiredAction = result;
      this.transition("deploy_action_required", "deploy_action_required", result.payload);
      return;
    }
    this.snapshotValue.data.deployment = result;
    if (deploymentIntentGroup) {
      await this.adapters.controlPlane.updateDeploymentIntentGroupDeployment(deploymentIntentGroup.groupId, result as any, {
        cliToken: deploymentIntentGroup.cliToken
      });
    } else if (deploymentIntent) {
      await this.adapters.controlPlane.updateDeploymentIntentDeployment(deploymentIntent.intentId, result as any, {
        cliToken: deploymentIntent.cliToken
      });
    }
    this.transition("deploy_submitted", "deploy_submitted", result);
  }

  private async observeRuntime(): Promise<void> {
    const deploymentIntent = this.deploymentIntent();
    const status = await this.adapters.controlPlane.readDeploymentIntent(deploymentIntent.intentId, {
      cliToken: deploymentIntent.cliToken
    });
    const intent = recordValue(status.intent);
    const runtimeSigner = stringValue(intent.runtimeSigner);
    if (!runtimeSigner) return;
    const runtime = {
      runtimeSigner,
      upstreamIps: Array.isArray(intent.upstreamIps) ? intent.upstreamIps.filter((item): item is string => typeof item === "string") : []
    };
    this.snapshotValue.data.runtime = runtime;
    this.transition("runtime_claimed", "runtime_claimed", runtime);
  }

  private async observeGroupRuntime(): Promise<void> {
    const group = this.deploymentIntentGroup();
    const status = await this.adapters.controlPlane.readDeploymentIntentGroup(group.groupId, { cliToken: group.cliToken });
    this.snapshotValue.data.deploymentIntentGroupStatus = status;
    const members = groupStatusMembers(status, group);
    this.mergeGroupMembers(members);
    const claimed = this.groupMembers().filter((member) => stringValue(member.runtimeSigner));
    const minReady = this.groupMinReady();
    if (claimed.length >= minReady) {
      this.transition("runtime_claimed", "group_runtime_claimed", {
        claimedMembers: claimed.length,
        minReady,
        members: claimed.map(groupMemberSummary)
      });
    }
  }

  private async requestQuote(): Promise<void> {
    const quote = await this.adapters.funding.requestQuote({
      workflow: this.snapshot,
      deploymentIntent: this.deploymentIntent(),
      runtime: recordValue(this.snapshotValue.data.runtime)
    });
    this.snapshotValue.data.quote = jsonSafe(quote);
    this.transition("quote_ready", "quote_ready", {
      sessionId: stringValue(quote.quote.sessionId),
      endpointHostname: quote.endpointHostname
    });
  }

  private async requestGroupQuotes(): Promise<void> {
    const group = this.deploymentIntentGroup();
    const allMembers = this.groupMembers();
    const members = allMembers.filter((member) => stringValue(member.runtimeSigner));
    const quoted: JsonObject[] = [];
    for (const member of members) {
      if (recordValue(member.quote).quote) {
        quoted.push(member);
        continue;
      }
      const bootstrap = this.groupMemberBootstrap(requiredString(member.intentId, "group member intentId"));
      const quote = await this.adapters.funding.requestQuote({
        workflow: this.snapshot,
        deploymentIntent: groupMemberDeploymentIntent(group, bootstrap),
        runtime: {
          runtimeSigner: stringValue(member.runtimeSigner),
          upstreamIps: Array.isArray(member.upstreamIps) ? member.upstreamIps : []
        }
      });
      member.quote = jsonSafe(quote);
      quoted.push(member);
      this.transition("runtime_claimed", "group_member_quote_ready", {
        memberId: stringValue(member.memberId),
        intentId: stringValue(member.intentId),
        sessionId: stringValue(quote.quote.sessionId),
        endpointHostname: quote.endpointHostname
      });
    }
    this.setGroupMembers(allMembers);
    if (quoted.length >= this.groupMinReady()) {
      this.transition("quote_ready", "group_quote_ready", {
        quotedMembers: quoted.length,
        minReady: this.groupMinReady()
      });
    }
  }

  private async fundQuote(): Promise<void> {
    const quote = recordValue(this.snapshotValue.data.quote) as unknown as QuoteResponse;
    if (!this.snapshotValue.data.spendConfirmed && this.adapters.confirmation) {
      const confirmed = await this.adapters.confirmation.confirmSpend({
        workflow: this.snapshot,
        deploymentIntent: this.deploymentIntent(),
        quote
      });
      if (!confirmed) {
        throw new Error("Switchboard deploy spend was not confirmed");
      }
      this.snapshotValue.data.spendConfirmed = true;
      this.snapshotValue.events.push({
        sequence: this.snapshotValue.events.length + 1,
        at: new Date().toISOString(),
        type: "spend_confirmed"
      });
    }
    const result = await this.adapters.funding.fundQuote({
      workflow: this.snapshot,
      deploymentIntent: this.deploymentIntent(),
      quote,
      runtime: recordValue(this.snapshotValue.data.runtime)
    });
    if (isRequiredAction(result)) {
      this.snapshotValue.requiredAction = result;
      this.transition("funding_action_required", "funding_action_required", result.payload);
      return;
    }
    this.snapshotValue.data.funding = result;
    this.transition("funding_submitted", "funding_submitted", result);
  }

  private async fundGroupQuotes(): Promise<void> {
    const group = this.deploymentIntentGroup();
    const allMembers = this.groupMembers();
    const members = allMembers.filter((member) => recordValue(member.quote).quote);
    const funded: JsonObject[] = [];
    for (const member of members) {
      if (recordValue(member.funding).ok === true || stringValue(recordValue(member.funding).txHash)) {
        funded.push(member);
        continue;
      }
      const bootstrap = this.groupMemberBootstrap(requiredString(member.intentId, "group member intentId"));
      const quote = recordValue(member.quote) as unknown as QuoteResponse;
      const result = await this.adapters.funding.fundQuote({
        workflow: this.snapshot,
        deploymentIntent: groupMemberDeploymentIntent(group, bootstrap),
        quote,
        runtime: {
          runtimeSigner: stringValue(member.runtimeSigner),
          upstreamIps: Array.isArray(member.upstreamIps) ? member.upstreamIps : []
        }
      });
      if (isRequiredAction(result)) {
        this.snapshotValue.requiredAction = {
          ...result,
          payload: {
            ...recordValue(result.payload),
            groupId: group.groupId,
            memberId: stringValue(member.memberId),
            intentId: stringValue(member.intentId)
          }
        };
        this.transition("funding_action_required", "group_member_funding_action_required", this.snapshotValue.requiredAction.payload);
        return;
      }
      member.funding = jsonSafe(result);
      funded.push(member);
      this.transition("quote_ready", "group_member_funding_submitted", {
        memberId: stringValue(member.memberId),
        intentId: stringValue(member.intentId),
        txHash: stringValue(recordValue(result).txHash)
      });
    }
    this.setGroupMembers(allMembers);
    if (funded.length >= this.groupMinReady()) {
      this.transition("funding_submitted", "group_funding_submitted", {
        fundedMembers: funded.length,
        minReady: this.groupMinReady()
      });
    }
  }

  private applyGroupFundingReceipt(receipt: WorkflowActionReceipt): void {
    const payload = recordValue(this.snapshotValue.requiredAction?.payload);
    const intentId = requiredString(payload.intentId, "group funding action intentId");
    const members = this.groupMembers();
    const member = members.find((candidate) => stringValue(candidate.intentId) === intentId);
    if (!member) throw new Error(`Group funding receipt referenced unknown member ${intentId}`);
    member.funding = receipt.receipt;
    this.setGroupMembers(members);
    this.snapshotValue.requiredAction = undefined;
    this.transition("funding_submitted", "group_member_funding_action_submitted", {
      intentId,
      memberId: stringValue(member.memberId),
      txHash: stringValue(recordValue(receipt.receipt).txHash)
    });
  }

  private async refreshFundingAndDns(): Promise<void> {
    const deploymentIntent = this.deploymentIntent();
    const status = await this.adapters.controlPlane.refreshDeploymentIntentFunding(deploymentIntent.intentId, {
      cliToken: deploymentIntent.cliToken
    });
    this.snapshotValue.data.fundingStatus = status;
    const dns = recordValue(recordValue(status.intent).dns);
    if (dns.status === "propagated" || dns.status === undefined) {
      this.transition("dns_propagated", "dns_propagated", dns);
    }
  }

  private async refreshGroupFundingAndDns(): Promise<void> {
    const group = this.deploymentIntentGroup();
    const allMembers = this.groupMembers();
    const members = allMembers.filter((member) => recordValue(member.funding));
    const ready: JsonObject[] = [];
    for (const member of members) {
      const intentId = requiredString(member.intentId, "group member intentId");
      const status = await this.adapters.controlPlane.refreshDeploymentIntentGroupMemberFunding(group.groupId, intentId, { cliToken: group.cliToken });
      member.fundingStatus = status;
      const intent = recordValue(status.intent);
      const funding = recordValue(intent.funding ?? status.funding);
      const dns = recordValue(intent.dns ?? status.dns);
      if (funding.status === "funded" && (dns.status === "propagated" || dns.status === undefined)) {
        ready.push(member);
      }
    }
    this.setGroupMembers(allMembers);
    this.snapshotValue.data.fundingStatus = { members: ready.map(groupMemberSummary) };
    if (ready.length >= this.groupMinReady()) {
      this.transition("dns_propagated", "group_dns_propagated", {
        readyMembers: ready.length,
        minReady: this.groupMinReady()
      });
    }
  }

  private async refreshRoute(): Promise<void> {
    const deploymentIntent = this.deploymentIntent();
    const activationWindow = activationWindowStatus(this.snapshotValue.data.fundingStatus);
    if (activationWindow) {
      const reason = stringValue(activationWindow.reason) ?? "activation_window_expired";
      this.snapshotValue.data.routeStatus = {
        ok: false,
        error: reason,
        route: { status: "failed", reason },
        ...activationWindow
      };
      this.transition("failed", reason, activationWindow);
      return;
    }
    let status: Record<string, unknown>;
    try {
      status = await this.adapters.controlPlane.refreshDeploymentIntentRoute(deploymentIntent.intentId, {
        cliToken: deploymentIntent.cliToken
      });
    } catch (error) {
      const retry = retryableRouteRefreshDetails(error);
      if (!retry) throw error;
      status = {
        ok: false,
        retryable: true,
        route: { status: "pending", reason: stringValue(retry.reason) },
        ...retry
      };
      this.snapshotValue.data.routeStatus = status;
      this.transition("dns_propagated", "route_not_ready", retry);
      return;
    }
    this.snapshotValue.data.routeStatus = status;
    const route = recordValue(status.route ?? recordValue(status.intent).route);
    if (route.status === "active" || route.status === undefined) {
      this.transition("route_active", "route_active", route);
    }
  }

  private async refreshGroupRoutes(): Promise<void> {
    const group = this.deploymentIntentGroup();
    const allMembers = this.groupMembers();
    const members = allMembers.filter((member) => recordValue(member.fundingStatus));
    const active: JsonObject[] = [];
    for (const member of members) {
      const intentId = requiredString(member.intentId, "group member intentId");
      let status: Record<string, unknown>;
      try {
        status = await this.adapters.controlPlane.refreshDeploymentIntentGroupMemberRoute(group.groupId, intentId, { cliToken: group.cliToken });
      } catch (error) {
        status = await this.adapters.controlPlane.refreshDeploymentIntentRoute(intentId, { cliToken: group.cliToken }).catch((fallbackError) => ({
          ok: false,
          error: `${errorMessage(error)}; fallback=${errorMessage(fallbackError)}`
        }));
      }
      member.routeStatus = status;
      const route = recordValue(status.route ?? recordValue(status.intent).route);
      if (route.status === "active" || route.status === undefined) {
        active.push(member);
      }
    }
    this.setGroupMembers(allMembers);
    this.snapshotValue.data.routeStatus = { members: active.map(groupMemberSummary) };
    if (active.length >= this.groupMinReady()) {
      this.transition("route_active", "group_route_active", {
        activeMembers: active.length,
        minReady: this.groupMinReady()
      });
    }
  }

  private async observeRegistration(): Promise<void> {
    const deploymentIntent = this.deploymentIntent();
    const status = await this.adapters.controlPlane.readDeploymentIntent(deploymentIntent.intentId, {
      cliToken: deploymentIntent.cliToken
    });
    const intent = recordValue(status.intent);
    this.snapshotValue.data.intentStatus = status;
    const funding = recordValue(intent.funding);
    const sessionId = stringValue(funding.sessionId) ?? stringValue(recordValue(this.snapshotValue.data.quote).sessionId);
    if (sessionId || intent.status === "registered" || intent.status === "active" || intent.status === "ready") {
      this.transition("registration_observed", "registration_observed", { sessionId, status: stringValue(intent.status) });
    }
  }

  private async observeGroupRegistration(): Promise<void> {
    const group = this.deploymentIntentGroup();
    const allMembers = this.groupMembers();
    const members = allMembers.filter((member) => recordValue(member.routeStatus));
    const registered: JsonObject[] = [];
    for (const member of members) {
      const intentId = requiredString(member.intentId, "group member intentId");
      const status = await this.adapters.controlPlane.readDeploymentIntent(intentId, { cliToken: group.cliToken });
      member.intentStatus = status;
      const intent = recordValue(status.intent);
      const funding = recordValue(intent.funding);
      const quote = recordValue(member.quote);
      const sessionId = stringValue(funding.sessionId) ?? stringValue(recordValue(quote.quote).sessionId);
      if (sessionId || intent.status === "registered" || intent.status === "active" || intent.status === "ready") {
        member.sessionId = sessionId;
        registered.push(member);
      }
    }
    this.setGroupMembers(allMembers);
    this.snapshotValue.data.intentStatus = { members: registered.map(groupMemberSummary) };
    if (registered.length >= this.groupMinReady()) {
      this.transition("registration_observed", "group_registration_observed", {
        registeredMembers: registered.length,
        minReady: this.groupMinReady()
      });
    }
  }

  private async observeValidation(): Promise<void> {
    const quote = recordValue(this.snapshotValue.data.quote);
    const quoteRecord = recordValue(quote.quote);
    const sessionId = stringValue(quoteRecord.sessionId);
    const hostname = stringValue(quote.endpointHostname);
    const reports = sessionId || hostname
      ? await this.adapters.controlPlane.listValidationReports({ sessionId, hostname, limit: 5 }).catch((error) => ({ ok: false, error: errorMessage(error) }))
      : { ok: false, error: "missing_session_or_hostname" };
    this.snapshotValue.data.validation = reports;
    this.transition("validation_observed", "validation_observed", reports as JsonObject);
  }

  private async observeGroupValidation(): Promise<void> {
    const allMembers = this.groupMembers();
    const members = allMembers.filter((member) => stringValue(member.sessionId) || recordValue(member.quote));
    const validated: JsonObject[] = [];
    for (const member of members) {
      const quote = recordValue(member.quote);
      const quoteRecord = recordValue(quote.quote);
      const sessionId = stringValue(member.sessionId) ?? stringValue(quoteRecord.sessionId);
      const hostname = stringValue(quote.endpointHostname);
      const reports = sessionId || hostname
        ? await this.adapters.controlPlane.listValidationReports({ sessionId, hostname, limit: 5 }).catch((error) => ({ ok: false, error: errorMessage(error) }))
        : { ok: false, error: "missing_session_or_hostname" };
      member.validation = reports;
      if (recordValue(reports).ok === true || Array.isArray(recordValue(reports).reports)) {
        validated.push(member);
      }
    }
    this.setGroupMembers(allMembers);
    this.snapshotValue.data.validation = { members: validated.map((member) => ({ ...groupMemberSummary(member), validation: member.validation })) };
    if (validated.length >= this.groupMinReady()) {
      this.transition("validation_observed", "group_validation_observed", {
        validatedMembers: validated.length,
        minReady: this.groupMinReady()
      });
    }
  }

  private deploymentIntent(): DeploymentIntentBootstrap {
    const intent = this.snapshotValue.data.deploymentIntent as unknown as DeploymentIntentBootstrap | undefined;
    if (!intent?.intentId || !intent?.cliToken || !intent?.env) throw new Error("Workflow has no deployment intent bootstrap");
    return intent;
  }

  private deploymentIntentGroup(): DeploymentIntentGroupBootstrap {
    const group = this.snapshotValue.data.deploymentIntentGroup as unknown as DeploymentIntentGroupBootstrap | undefined;
    if (!group?.groupId || !group?.cliToken || !group?.env) throw new Error("Workflow has no deployment intent group bootstrap");
    return group;
  }

  private groupMinReady(): number {
    return this.snapshotValue.input.group?.minReady ?? 1;
  }

  private groupMembers(): JsonObject[] {
    const existing = this.snapshotValue.data.groupMembers;
    if (Array.isArray(existing)) return existing.filter((item): item is JsonObject => Boolean(item && typeof item === "object" && !Array.isArray(item)));
    const group = this.deploymentIntentGroup();
    return group.members.map((member) => ({ ...member }));
  }

  private setGroupMembers(members: JsonObject[]): void {
    this.snapshotValue.data.groupMembers = members.map((member) => jsonSafe(member));
  }

  private mergeGroupMembers(nextMembers: JsonObject[]): void {
    const existing = this.groupMembers();
    const byIntent = new Map(existing.map((member) => [stringValue(member.intentId), member]));
    for (const member of nextMembers) {
      const intentId = stringValue(member.intentId);
      if (!intentId) continue;
      byIntent.set(intentId, { ...recordValue(byIntent.get(intentId)), ...member });
    }
    this.setGroupMembers([...byIntent.values()]);
  }

  private groupMemberBootstrap(intentId: string): JsonObject {
    const group = this.deploymentIntentGroup();
    const member = group.members.find((candidate) => stringValue(candidate.intentId) === intentId);
    if (!member) throw new Error(`Workflow has no deployment intent group member ${intentId}`);
    return member as JsonObject;
  }

  private transition(step: SwitchboardDeployWorkflowStep, type: string, details?: JsonObject): void {
    this.snapshotValue.step = step;
    this.snapshotValue.updatedAt = new Date().toISOString();
    this.snapshotValue.events.push({
      sequence: this.snapshotValue.events.length + 1,
      at: this.snapshotValue.updatedAt,
      type,
      details
    });
  }

  private reportData(): Omit<SwitchboardDeployWorkflowReport, "ok" | "workflowId" | "snapshot"> {
    return {
      deployment: recordValue(this.snapshotValue.data.deployment),
      deploymentIntentGroup: recordValue(this.snapshotValue.data.deploymentIntentGroupReport),
      session: recordValue(this.snapshotValue.data.intentStatus),
      quote: recordValue(this.snapshotValue.data.quote),
      funding: recordValue(this.snapshotValue.data.funding),
      route: recordValue(this.snapshotValue.data.routeStatus ?? this.snapshotValue.data.route),
      validation: recordValue(this.snapshotValue.data.validation)
    };
  }

  private persist(): Promise<void> | void {
    return this.adapters.store?.save(this.snapshot);
  }
}

export function launchDemoWorkflowInput(input: Omit<SwitchboardDeployWorkflowInput, "entrypoint" | "runtime" | "validatorMode"> & {
  demoPackage?: string;
  minReady?: number;
}): SwitchboardDeployWorkflowInput {
  return {
    ...input,
    entrypoint: "src/index.ts",
    runtime: {
      kind: "switchboard-express-demo",
      package: input.demoPackage ?? "@proof-computer/switchboard-express-demo",
      minReady: input.minReady ?? 1
    },
    validatorMode: "skip"
  };
}

export function buildAcurastDeployRequiredAction(
  snapshot: SwitchboardDeployWorkflowSnapshot,
  deploymentIntent: DeploymentIntentBootstrap
): AcurastDeployRequiredActionPayload {
  const capacity = recordValue(snapshot.data.capacity) as unknown as SwitchboardCapacitySelection;
  const jobId = stringValue(snapshot.input.jobId);
  if (!jobId) throw new Error("Deploy workflow snapshot input is missing jobId");
  if (!capacity.operatorId || !capacity.processorId) {
    throw new Error("Deploy workflow snapshot is missing selected capacity");
  }
  return {
    workflowId: snapshot.workflowId,
    jobId,
    capacity,
    deploymentIntent,
    sensitiveFields: [
      "deploymentIntent.cliToken",
      "deploymentIntent.env.SWITCHBOARD_INTENT_TOKEN"
    ]
  };
}

export function buildAcurastGroupDeployRequiredAction(
  snapshot: SwitchboardDeployWorkflowSnapshot,
  deploymentIntentGroup: DeploymentIntentGroupBootstrap
): AcurastGroupDeployRequiredActionPayload {
  const capacity = recordValue(snapshot.data.capacity) as unknown as SwitchboardCapacitySelection;
  const jobId = stringValue(snapshot.input.jobId);
  const group = snapshot.input.group;
  if (!jobId) throw new Error("Deploy workflow snapshot input is missing jobId");
  if (snapshot.input.deploymentMode !== "group" || !group) {
    throw new Error("Deploy workflow snapshot is not a group deployment");
  }
  if (!capacity.operatorId || !capacity.processorId) {
    throw new Error("Deploy workflow snapshot is missing selected capacity");
  }
  return {
    workflowId: snapshot.workflowId,
    deploymentMode: "group",
    jobId,
    capacity,
    deploymentIntentGroup,
    group,
    sensitiveFields: [
      "deploymentIntentGroup.cliToken",
      "deploymentIntentGroup.env.SWITCHBOARD_INTENT_TOKEN"
    ]
  };
}

export function buildHubFundRequiredAction(
  snapshot: SwitchboardDeployWorkflowSnapshot,
  quote: QuoteResponse
): HubFundRequiredActionPayload {
  const deploymentIntent = recordValue(snapshot.data.deploymentIntent) as unknown as DeploymentIntentBootstrap;
  if (!deploymentIntent.intentId) throw new Error("Deploy workflow snapshot is missing deployment intent");
  const capacity = recordValue(snapshot.data.capacity) as unknown as SwitchboardCapacitySelection;
  const quoteRecord = recordValue(quote.quote);
  return {
    workflowId: snapshot.workflowId,
    deploymentIntent: {
      intentId: deploymentIntent.intentId,
      relayUrl: stringValue(deploymentIntent.env?.SWITCHBOARD_RELAY_URL) ?? snapshot.input.relayUrl
    },
    quote,
    session: {
      sessionId: stringValue(quoteRecord.sessionId),
      endpointHostname: stringValue(quote.endpointHostname),
      validationHostname: stringValue(quote.validationHostname)
    },
    target: snapshot.input.target,
    metadata: {
      jobId: snapshot.input.jobId,
      operatorId: capacity.operatorId,
      processorId: capacity.processorId,
      gatewayId: capacity.gatewayId
    },
    sensitiveFields: []
  };
}

export function redactDeployWorkflowSnapshot(snapshot: SwitchboardDeployWorkflowSnapshot): SwitchboardDeployWorkflowSnapshot {
  return redactSensitiveFields(jsonSafe(snapshot)) as SwitchboardDeployWorkflowSnapshot;
}

function isRequiredAction(value: JsonObject | WorkflowRequiredAction): value is WorkflowRequiredAction {
  return typeof value.id === "string" && typeof value.kind === "string" && typeof value.description === "string" && Boolean(value.payload);
}

function recordValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function hex32String(value: unknown): string | undefined {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/u.test(value) ? value : undefined;
}

function workflowInputHasRelayAllocatedIngress(input: SwitchboardDeployWorkflowInput): boolean {
  return input.ingress?.implementor === "switchboard";
}

function deploymentIntentCapacity(intent: DeploymentIntentBootstrap): JsonObject | undefined {
  const publicIntent = recordValue(intent.intent);
  const rawIntent = recordValue(recordValue(intent.raw).intent);
  const allocation = recordValue(publicIntent.allocation ?? rawIntent.allocation);
  const operatorId = hex32String(publicIntent.operatorId) ?? hex32String(rawIntent.operatorId) ?? hex32String(allocation.operatorId);
  const processorId = hex32String(publicIntent.processorId) ?? hex32String(rawIntent.processorId) ?? hex32String(allocation.processorId);
  if (!operatorId || !processorId) return undefined;
  return withoutUndefined({
    ...allocation,
    operatorId,
    processorId,
    processor: hex32String(publicIntent.processor) ?? hex32String(rawIntent.processor) ?? hex32String(allocation.processor) ?? processorId,
    gatewayId: stringValue(publicIntent.gatewayId) ?? stringValue(rawIntent.gatewayId) ?? stringValue(allocation.gatewayId),
    managerId: stringValue(publicIntent.managerId) ?? stringValue(rawIntent.managerId) ?? stringValue(allocation.managerId)
  });
}

function withoutUndefined(input: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as JsonObject;
}

function retryableRouteRefreshDetails(error: unknown): JsonObject | undefined {
  const message = errorMessage(error);
  const lower = message.toLowerCase();
  if (!lower.includes("/route-refresh")) return undefined;
  const parsed = parseJsonTail(message);
  const httpStatus = routeRefreshHttpStatus(message);
  const routeNotReady = lower.includes("route_not_ready") || stringValue(parsed?.error) === "route_not_ready";
  const transientStatus = httpStatus === 502 || httpStatus === 503 || httpStatus === 504;
  if (!routeNotReady && !transientStatus) return undefined;
  const health = recordValue(parsed?.health);
  const details = recordValue(health.details);
  return {
    error: stringValue(parsed?.error) ?? (transientStatus ? "route_refresh_unavailable" : "route_not_ready"),
    reason: stringValue(parsed?.reason) ?? (lower.includes("runtime_https_not_ready") ? "runtime_https_not_ready" : transientStatus ? "route_refresh_transient" : undefined),
    httpStatus,
    healthState: stringValue(health.state),
    healthStage: stringValue(details.stage),
    message
  };
}

function activationWindowStatus(fundingStatus: unknown, nowMs = Date.now()): JsonObject | undefined {
  const activationDeadlineSeconds = activationDeadlineSecondsFromFundingStatus(fundingStatus);
  if (activationDeadlineSeconds === undefined) {
    return undefined;
  }
  const activationDeadlineMs = activationDeadlineSeconds * 1000;
  const remainingMs = activationDeadlineMs - nowMs;
  if (remainingMs > DEFAULT_ACTIVATION_DEADLINE_SAFETY_MS) {
    return undefined;
  }
  return {
    reason: remainingMs <= 0 ? "activation_window_expired" : "activation_window_expiring",
    activationDeadline: String(Math.floor(activationDeadlineSeconds)),
    activationDeadlineIso: new Date(activationDeadlineMs).toISOString(),
    activationDeadlineRemainingMs: remainingMs,
    activationDeadlineSafetyMs: DEFAULT_ACTIVATION_DEADLINE_SAFETY_MS
  };
}

function activationDeadlineSecondsFromFundingStatus(fundingStatus: unknown): number | undefined {
  const status = recordValue(fundingStatus);
  const intent = recordValue(status.intent);
  const funding = recordValue(intent.funding ?? status.funding);
  const session = recordValue(funding.session);
  return positiveNumberValue(session.activationDeadline) ??
    positiveNumberValue(funding.activationDeadline) ??
    positiveNumberValue(status.activationDeadline);
}

function positiveNumberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function routeRefreshHttpStatus(message: string): number | undefined {
  const match = message.match(/failed \((\d{3})\)/);
  if (!match) return undefined;
  return Number(match[1]);
}

function parseJsonTail(message: string): JsonObject | undefined {
  const start = message.indexOf("{");
  if (start < 0) return undefined;
  try {
    return recordValue(JSON.parse(message.slice(start)));
  } catch {
    return undefined;
  }
}

function requiredString(value: unknown, label: string): string {
  const result = stringValue(value);
  if (!result) throw new Error(`Missing ${label}`);
  return result;
}

function jsonSafe(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as JsonObject;
}

function groupStatusMembers(status: Record<string, unknown>, group: DeploymentIntentGroupBootstrap): JsonObject[] {
  const groupRecord = recordValue(status.group);
  const statusMembers = Array.isArray(groupRecord.members)
    ? groupRecord.members.filter((member): member is JsonObject => Boolean(member && typeof member === "object" && !Array.isArray(member)))
    : [];
  if (statusMembers.length > 0) return statusMembers;
  return group.members.map((member) => ({ ...member }));
}

function groupMemberSummary(member: JsonObject): JsonObject {
  return {
    memberId: stringValue(member.memberId),
    intentId: stringValue(member.intentId),
    jobId: stringValue(member.jobId),
    operatorId: stringValue(member.operatorId),
    processorId: stringValue(member.processorId),
    processor: stringValue(member.processor),
    gatewayId: stringValue(member.gatewayId),
    runtimeSigner: stringValue(member.runtimeSigner),
    sessionId: stringValue(member.sessionId) ?? stringValue(recordValue(recordValue(member.quote).quote).sessionId)
  };
}

function groupMemberDeploymentIntent(group: DeploymentIntentGroupBootstrap, member: JsonObject): DeploymentIntentBootstrap {
  const intentId = requiredString(member.intentId, "group member intentId");
  return {
    intentId,
    cliToken: group.cliToken,
    groupId: group.groupId,
    env: {
      SWITCHBOARD_RELAY_URL: group.env.SWITCHBOARD_RELAY_URL,
      SWITCHBOARD_INTENT_ID: intentId,
      SWITCHBOARD_INTENT_TOKEN: group.env.SWITCHBOARD_INTENT_TOKEN
    },
    intent: member,
    raw: member
  };
}

function redactSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSensitiveFields(item));
  if (!value || typeof value !== "object") return value;
  const output: JsonObject = {};
  for (const [key, nested] of Object.entries(value as JsonObject)) {
    if (isSensitiveKey(key) && typeof nested === "string" && nested.length > 0) {
      output[key] = "[redacted]";
    } else {
      output[key] = redactSensitiveFields(nested);
    }
  }
  return output;
}

function isSensitiveKey(key: string): boolean {
  return /token|secret|private.?key|password|authorization|mnemonic|(^|_)seed($|_)|hmac|encryption.?key/i.test(key);
}

function normalizeGroupInput(input: {
  expectedReplicas: number;
  minReady: number;
  members: SwitchboardGroupMemberSelection[];
}): SwitchboardDeployWorkflowInput["group"] {
  return {
    expectedReplicas: input.expectedReplicas,
    minReady: input.minReady,
    members: input.members.map((member, index) => ({
      ...member,
      memberId: member.memberId ?? `member-${index + 1}`,
      jobId: member.jobId ?? bytes32()
    }))
  };
}

function bytes32(): string {
  return `0x${randomBytes(32).toString("hex")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
