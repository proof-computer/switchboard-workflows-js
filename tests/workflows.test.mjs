import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SwitchboardDeployWorkflow,
  buildAcurastDeployRequiredAction,
  buildAcurastGroupDeployRequiredAction,
  buildHubFundRequiredAction,
  launchDemoWorkflowInput,
  redactDeployWorkflowSnapshot
} from "../dist/workflows.js";

const capacity = {
  operatorId: `0x${"44".repeat(32)}`,
  processorId: `0x${"55".repeat(32)}`,
  processor: "5Dprocessor",
  gatewayId: "gateway-a"
};

const input = {
  relayUrl: "https://relay.test",
  target: {
    name: "polkadot-hub",
    chainId: "420420419",
    registryAddress: "0x9000000000000000000000000000000000000009"
  },
  durationSeconds: 900,
  entrypoint: "src/server.ts",
  capacity,
  asset: "0x0000053900000000000000000000000001200000",
  quoteCapAmount: "120000"
};

describe("SwitchboardDeployWorkflow", () => {
  it("runs the happy path to a serializable final report", async () => {
    const saved = [];
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ saved }));

    const snapshot = await workflow.runToBlocked();
    assert.equal(snapshot.step, "complete");
    assert.equal(snapshot.events.at(-1).type, "final_report");
    assert.doesNotThrow(() => JSON.stringify(snapshot));
    assert.ok(saved.length > 0);

    const report = workflow.report();
    assert.equal(report.ok, true);
    assert.equal(report.workflowId, snapshot.workflowId);
    assert.equal(report.quote.quote.sessionId, `0x${"22".repeat(32)}`);
  });

  it("passes intent tokens to protected single-intent workflow calls", async () => {
    const protectedCalls = [];
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ protectedCalls }));

    const snapshot = await workflow.runToBlocked();

    assert.equal(snapshot.step, "complete");
    assert.deepEqual(protectedCalls, [
      { method: "updateDeploymentIntentDeployment", id: "di_test", cliToken: "cli-token" },
      { method: "readDeploymentIntent", id: "di_test", cliToken: "cli-token" },
      { method: "refreshDeploymentIntentFunding", id: "di_test", cliToken: "cli-token" },
      { method: "refreshDeploymentIntentRoute", id: "di_test", cliToken: "cli-token" },
      { method: "readDeploymentIntent", id: "di_test", cliToken: "cli-token" }
    ]);
  });

  it("keeps polling when route refresh reports runtime HTTPS is not ready", async () => {
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ routeNotReadyOnce: true }));
    let snapshot = workflow.snapshot;
    for (let attempt = 0; attempt < 10 && snapshot.step !== "dns_propagated"; attempt += 1) {
      snapshot = await workflow.advanceOnce();
    }
    assert.equal(snapshot.step, "dns_propagated");

    const retry = await workflow.advanceOnce();
    assert.equal(retry.step, "dns_propagated");
    assert.equal(retry.events.at(-1).type, "route_not_ready");
    assert.equal(retry.events.at(-1).details.reason, "runtime_https_not_ready");
    assert.equal(retry.events.at(-1).details.healthStage, "relay_response");
    assert.equal(retry.events.at(-1).details.requestId, "req_route_ready");
    assert.equal(retry.events.at(-1).details.retryMs, 30000);
    assert.equal(retry.events.at(-1).details.elapsedMs, 120000);
    assert.equal(retry.events.at(-1).details.healthUpdatedAt, "2026-06-08T12:00:00.000Z");
    assert.equal(retry.events.at(-1).details.activationDeadlineIso, "2026-06-08T12:10:00.000Z");
    assert.equal(retry.events.at(-1).details.activationDeadlineRemainingMs, 480000);
    assert.equal(retry.events.at(-1).details.healthDetails.attempt, 7);
    assert.equal(retry.events.at(-1).details.healthDetails.hostname, "e-test.acurast.ingress.works");

    const complete = await workflow.runToBlocked();
    assert.equal(complete.step, "complete");
    assert.ok(complete.events.some((event) => event.type === "route_active"));
  });

  it("fails before route refresh when the activation window is expiring", async () => {
    const originalDateNow = Date.now;
    const nowMs = Date.parse("2026-06-07T12:00:00.000Z");
    const protectedCalls = [];
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({
      activationDeadline: String(Math.floor((nowMs + 30_000) / 1000)),
      protectedCalls
    }));
    Date.now = () => nowMs;
    try {
      let snapshot = workflow.snapshot;
      for (let attempt = 0; attempt < 10 && snapshot.step !== "dns_propagated"; attempt += 1) {
        snapshot = await workflow.advanceOnce();
      }
      assert.equal(snapshot.step, "dns_propagated");

      const failed = await workflow.advanceOnce();
      assert.equal(failed.step, "failed");
      assert.equal(failed.events.at(-1).type, "activation_window_expiring");
      assert.equal(failed.events.at(-1).details.reason, "activation_window_expiring");
      assert.equal(
        protectedCalls.some((call) => call.method === "refreshDeploymentIntentRoute"),
        false
      );
    } finally {
      Date.now = originalDateNow;
    }
  });

  it("keeps polling when route refresh has a transient upstream failure", async () => {
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ routeRefreshTransientOnce: true }));
    let snapshot = workflow.snapshot;
    for (let attempt = 0; attempt < 10 && snapshot.step !== "dns_propagated"; attempt += 1) {
      snapshot = await workflow.advanceOnce();
    }
    assert.equal(snapshot.step, "dns_propagated");

    const retry = await workflow.advanceOnce();
    assert.equal(retry.step, "dns_propagated");
    assert.equal(retry.events.at(-1).type, "route_not_ready");
    assert.equal(retry.events.at(-1).details.error, "route_refresh_unavailable");
    assert.equal(retry.events.at(-1).details.reason, "route_refresh_transient");
    assert.equal(retry.events.at(-1).details.httpStatus, 502);

    const complete = await workflow.runToBlocked();
    assert.equal(complete.step, "complete");
    assert.ok(complete.events.some((event) => event.type === "route_active"));
  });

  it("keeps waiting at funding_submitted while the deployer cannot resolve the canonical hostname", async () => {
    const workflow = new SwitchboardDeployWorkflow(
      { ...input, confirmPublicDnsResolution: true, dnsResolutionGraceMs: 600_000 },
      fakeAdapters({ dnsUnresolved: true })
    );
    const snapshot = await workflow.runToBlocked();
    assert.equal(snapshot.step, "funding_submitted");
    assert.equal(snapshot.data.dnsResolution.resolved, false);
    assert.match(snapshot.data.dnsResolution.error, /ENOTFOUND/);
  });

  it("fails at the DNS stage when the canonical hostname never resolves for the deployer", async () => {
    const workflow = new SwitchboardDeployWorkflow(
      { ...input, confirmPublicDnsResolution: true, dnsResolutionGraceMs: 0 },
      fakeAdapters({ dnsUnresolved: true })
    );
    await assert.rejects(() => workflow.runToBlocked(), /dns_failed/);
    assert.equal(workflow.snapshot.step, "failed");
    const failure = workflow.snapshot.events.at(-1);
    assert.equal(failure.type, "workflow_failed");
    assert.match(failure.details.error, /did not resolve/);
  });

  it("skips deployer DNS resolution for insecure/local deploys even when confirmation is enabled", async () => {
    const workflow = new SwitchboardDeployWorkflow(
      { ...input, confirmPublicDnsResolution: true, allowInsecureHttp: true },
      fakeAdapters({ dnsUnresolved: true })
    );
    const snapshot = await workflow.runToBlocked();
    assert.equal(snapshot.step, "complete");
  });

  it("does not require deployer DNS resolution unless confirmation is opted in", async () => {
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ dnsUnresolved: true }));
    const snapshot = await workflow.runToBlocked();
    assert.equal(snapshot.step, "complete");
  });

  it("pauses on off-process funding and resumes from a redacted receipt", async () => {
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ requireFundingAction: true }));
    const blocked = await workflow.runToBlocked();
    assert.equal(blocked.step, "funding_action_required");
    assert.equal(blocked.requiredAction.kind, "hub.fund");

    const resumed = await workflow.applyActionReceipt({
      actionId: blocked.requiredAction.id,
      kind: "hub.fund",
      receipt: { txHash: "0xfund", status: "inBlock" }
    });
    assert.equal(resumed.step, "funding_submitted");

    const complete = await workflow.runToBlocked();
    assert.equal(complete.step, "complete");
  });

  it("persists JSON-safe snapshots that can resume with fake adapters", async () => {
    const saved = [];
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ saved, requireFundingAction: true }));
    const blocked = await workflow.runToBlocked();

    const encoded = JSON.stringify(saved.at(-1));
    const restoredSnapshot = JSON.parse(encoded);
    const restored = new SwitchboardDeployWorkflow(input, fakeAdapters({}), restoredSnapshot);
    await restored.applyActionReceipt({
      actionId: blocked.requiredAction.id,
      kind: "hub.fund",
      receipt: { txHash: "0xfund", status: "inBlock" }
    });
    const complete = await restored.runToBlocked();

    assert.equal(complete.step, "complete");
    assert.equal(restored.report().workflowId, blocked.workflowId);
  });

  it("generates a stable job id once and preserves it across snapshot restore", async () => {
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ requireFundingAction: true }));
    const first = workflow.snapshot;
    assert.match(first.input.jobId, /^0x[0-9a-f]{64}$/);

    const blocked = await workflow.runToBlocked();
    const restored = new SwitchboardDeployWorkflow(input, fakeAdapters({}), JSON.parse(JSON.stringify(blocked)));

    assert.equal(restored.snapshot.input.jobId, first.input.jobId);
  });

  it("sends supplied job id, session label, and developer when creating the deployment intent", async () => {
    const requests = [];
    const workflow = new SwitchboardDeployWorkflow({
      ...input,
      jobId: `0x${"77".repeat(32)}`,
      sessionLabel: "sdk-test-session",
      developer: "0xdeveloper"
    }, fakeAdapters({ createRequests: requests, requireDeployAction: true }));

    const blocked = await workflow.runToBlocked();

    assert.equal(blocked.step, "deploy_action_required");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].jobId, `0x${"77".repeat(32)}`);
    assert.equal(requests[0].sessionLabel, "sdk-test-session");
    assert.equal(requests[0].developer, "0xdeveloper");
  });

  it("builds acurast.deploy required-action payload with bootstrap and sensitive-field markers", async () => {
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ requireDeployAction: true }));
    const blocked = await workflow.runToBlocked();
    const payload = buildAcurastDeployRequiredAction(blocked, blocked.data.deploymentIntent);

    assert.equal(payload.workflowId, blocked.workflowId);
    assert.equal(payload.jobId, blocked.input.jobId);
    assert.equal(payload.capacity.gatewayId, "gateway-a");
    assert.equal(payload.deploymentIntent.intentId, "di_test");
    assert.deepEqual(payload.sensitiveFields, [
      "deploymentIntent.cliToken",
      "deploymentIntent.env.SWITCHBOARD_INTENT_TOKEN"
    ]);
  });

  it("moves a typed acurast.deploy receipt from action-required to deploy-submitted", async () => {
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ requireDeployAction: true }));
    const blocked = await workflow.runToBlocked();
    const resumed = await workflow.applyActionReceipt({
      actionId: blocked.requiredAction.id,
      kind: "acurast.deploy",
      receipt: {
        adapter: "switchboard-deploy",
        ok: true,
        deploymentId: "59399",
        txHash: "0xdeploy",
        jobId: blocked.input.jobId,
        processorId: capacity.processorId,
        operatorId: capacity.operatorId,
        gatewayId: capacity.gatewayId,
        schedule: { startsAt: 1, endsAt: 2 },
        deploymentIntentId: "di_test",
        reportPath: "/tmp/report.json"
      }
    });

    assert.equal(resumed.step, "deploy_submitted");
    assert.equal(resumed.data.deployment.deploymentId, "59399");
  });

  it("observes runtime after no-transition polls", async () => {
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ runtimeClaimsAfter: 3 }));
    await workflow.advanceOnce();
    await workflow.advanceOnce();
    await workflow.advanceOnce();
    assert.equal(workflow.snapshot.step, "deploy_submitted");

    await workflow.advanceOnce();
    assert.equal(workflow.snapshot.step, "deploy_submitted");
    await workflow.advanceOnce();
    assert.equal(workflow.snapshot.step, "deploy_submitted");
    await workflow.advanceOnce();
    assert.equal(workflow.snapshot.step, "runtime_claimed");
  });

  it("passes the observed runtime signer into single-intent quote funding", async () => {
    const fundRequests = [];
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ fundRequests }));

    const snapshot = await workflow.runToBlocked();

    assert.equal(snapshot.step, "complete");
    assert.equal(fundRequests.length, 1);
    assert.equal(fundRequests[0].runtime.runtimeSigner, "0x5000000000000000000000000000000000000005");
    assert.deepEqual(fundRequests[0].runtime.upstreamIps, ["203.0.113.10"]);
  });

  it("builds a hub.fund action payload with quote and intent metadata but no local tokens", async () => {
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ requireFundingAction: true }));
    const blocked = await workflow.runToBlocked();
    const payload = buildHubFundRequiredAction(blocked, blocked.data.quote);

    assert.equal(payload.workflowId, blocked.workflowId);
    assert.equal(payload.deploymentIntent.intentId, "di_test");
    assert.equal(payload.deploymentIntent.cliToken, undefined);
    assert.equal(payload.session.sessionId, `0x${"22".repeat(32)}`);
    assert.equal(payload.metadata.jobId, blocked.input.jobId);
    assert.equal(JSON.stringify(payload).includes("job-token"), false);
  });

  it("redacts deploy workflow snapshots while preserving ids and events", async () => {
    const workflow = new SwitchboardDeployWorkflow(input, fakeAdapters({ requireDeployAction: true }));
    const blocked = await workflow.runToBlocked();
    const redacted = redactDeployWorkflowSnapshot(blocked);

    assert.equal(redacted.workflowId, blocked.workflowId);
    assert.equal(redacted.input.jobId, blocked.input.jobId);
    assert.equal(redacted.data.deploymentIntent.intentId, "di_test");
    assert.equal(redacted.data.deploymentIntent.cliToken, "[redacted]");
    assert.equal(redacted.data.deploymentIntent.env.SWITCHBOARD_INTENT_TOKEN, "[redacted]");
    assert.equal(redacted.events.length, blocked.events.length);
    assert.equal(redacted.requiredAction.payload.deploymentIntent.cliToken, "[redacted]");
  });

  it("builds launch-demo input with validator mode skipped", () => {
    const demo = launchDemoWorkflowInput({ ...input, minReady: 1 });
    assert.equal(demo.validatorMode, "skip");
    assert.equal(demo.runtime.kind, "switchboard-express-demo");
  });

  it("creates a deployment-intent group and exposes a redacted acurast.deploy action", async () => {
    const createGroupRequests = [];
    const groupInput = launchDemoWorkflowInput({
      ...input,
      deploymentMode: "group",
      minReady: 2,
      group: {
        expectedReplicas: 2,
        minReady: 2,
        members: [
          { memberId: "member-1", ...capacity },
          { memberId: "member-2", ...capacity, processorId: `0x${"66".repeat(32)}`, processor: "5Dprocessor2", gatewayId: "gateway-b" }
        ]
      }
    });
    const workflow = new SwitchboardDeployWorkflow(groupInput, fakeAdapters({ createGroupRequests, requireDeployAction: true }));
    const blocked = await workflow.runToBlocked();

    assert.equal(blocked.step, "deploy_action_required");
    assert.equal(createGroupRequests.length, 1);
    assert.equal(createGroupRequests[0].expectedReplicas, 2);
    assert.equal(createGroupRequests[0].minReady, 2);
    assert.equal(createGroupRequests[0].members.length, 2);
    assert.match(createGroupRequests[0].members[0].jobId, /^0x[0-9a-f]{64}$/);
    assert.equal(blocked.data.deploymentIntentGroup.groupId, "dig_test");
    assert.equal(blocked.requiredAction.kind, "acurast.deploy");
    assert.equal(blocked.requiredAction.payload.deploymentIntentGroup.groupId, "dig_test");
    assert.deepEqual(blocked.requiredAction.payload.sensitiveFields, [
      "deploymentIntentGroup.cliToken",
      "deploymentIntentGroup.env.SWITCHBOARD_INTENT_TOKEN"
    ]);

    const redacted = redactDeployWorkflowSnapshot(blocked);
    assert.equal(redacted.requiredAction.payload.deploymentIntentGroup.cliToken, "[redacted]");
    assert.equal(redacted.requiredAction.payload.deploymentIntentGroup.env.SWITCHBOARD_INTENT_TOKEN, "[redacted]");
  });

  it("moves a group submit receipt to deploy-submitted for SDK-owned HA lifecycle", async () => {
    const workflow = new SwitchboardDeployWorkflow(groupWorkflowInput(), fakeAdapters({ requireDeployAction: true }));
    const blocked = await workflow.runToBlocked();
    const submitted = await workflow.applyActionReceipt({
      actionId: blocked.requiredAction.id,
      kind: "acurast.deploy",
      receipt: {
        adapter: "switchboard-deploy",
        ok: true,
        deployment: { deploymentId: "59420" },
        deploymentIntentGroup: { groupId: "dig_test", expectedReplicas: 2, minReady: 2 },
        ha: { readyReplicas: 2, minReady: 2 },
        funding: { fundedMembers: 2 },
        route: { status: "active" },
        validation: { ok: true },
        reportPath: "/tmp/ha-report.json"
      }
    });

    assert.equal(submitted.step, "deploy_submitted");
    assert.equal(submitted.data.deployment.deploymentId, "59420");
    assert.equal(submitted.data.ha.readyReplicas, 2);
    assert.equal(submitted.data.reportPath, "/tmp/ha-report.json");
    assert.equal(submitted.requiredAction, undefined);
  });

  it("keeps group member runtime claims below minReady polling", async () => {
    const workflow = new SwitchboardDeployWorkflow(groupWorkflowInput(), fakeAdapters({ requireDeployAction: true, groupClaimedMembers: 1 }));
    const blocked = await workflow.runToBlocked();
    await workflow.applyActionReceipt({
      actionId: blocked.requiredAction.id,
      kind: "acurast.deploy",
      receipt: {
        adapter: "switchboard-deploy",
        ok: true,
        deployment: { deploymentId: "59420" },
        deploymentIntentGroup: { groupId: "dig_test", expectedReplicas: 2, minReady: 2 },
        reportPath: "/tmp/ha-report.json"
      }
    });
    const afterPoll = await workflow.advanceOnce();

    assert.equal(afterPoll.step, "deploy_submitted");
    assert.equal(afterPoll.data.groupMembers.filter((member) => member.runtimeSigner).length, 1);
  });

  it("drives claimed group members through quote funding route validation to completion", async () => {
    const workflow = new SwitchboardDeployWorkflow(groupWorkflowInput(), fakeAdapters({ requireDeployAction: true, groupClaimedMembers: 2 }));
    const blocked = await workflow.runToBlocked();
    await workflow.applyActionReceipt({
      actionId: blocked.requiredAction.id,
      kind: "acurast.deploy",
      receipt: {
        adapter: "switchboard-deploy",
        ok: true,
        deployment: { deploymentId: "59420" },
        deploymentIntentGroup: { groupId: "dig_test", expectedReplicas: 2, minReady: 2 },
        reportPath: "/tmp/ha-report.json"
      }
    });
    const complete = await workflow.runToBlocked();

    assert.equal(complete.step, "complete");
    assert.equal(complete.data.groupMembers.length, 2);
    assert.equal(complete.data.groupMembers.filter((member) => member.funding?.txHash === "0xfund").length, 2);
    assert.equal(complete.events.some((event) => event.type === "group_validation_observed"), true);
  });

  it("keeps group acurast.deploy resumable after a failed group receipt", async () => {
    const workflow = new SwitchboardDeployWorkflow(groupWorkflowInput(), fakeAdapters({ requireDeployAction: true }));
    const blocked = await workflow.runToBlocked();
    const failed = await workflow.applyActionReceipt({
      actionId: blocked.requiredAction.id,
      kind: "acurast.deploy",
      receipt: {
        adapter: "switchboard-deploy",
        ok: false,
        reportPath: "/tmp/ha-failed.json",
        failure: { stage: "acurast-deploy", message: "submit failed" }
      }
    });

    assert.equal(failed.step, "deploy_action_required");
    assert.equal(failed.requiredAction.kind, "acurast.deploy");
    assert.equal(failed.requiredAction.payload.reportPath, "/tmp/ha-failed.json");
    assert.equal(failed.requiredAction.payload.previousFailure.stage, "acurast-deploy");
  });
});

function groupWorkflowInput() {
  return launchDemoWorkflowInput({
    ...input,
    deploymentMode: "group",
    minReady: 2,
    group: {
      expectedReplicas: 2,
      minReady: 2,
      members: [
        { memberId: "member-1", ...capacity },
        { memberId: "member-2", ...capacity, processorId: `0x${"66".repeat(32)}`, processor: "5Dprocessor2", gatewayId: "gateway-b" }
      ]
    }
  });
}

function fakeAdapters(options = {}) {
  let runtimeReadCount = 0;
  let routeRefreshCount = 0;
  return {
    controlPlane: {
      async createDeploymentIntent(input) {
        options.createRequests?.push(input);
        return {
          intentId: "di_test",
          cliToken: "cli-token",
          env: {
            SWITCHBOARD_RELAY_URL: "https://relay.test",
            SWITCHBOARD_INTENT_ID: "di_test",
            SWITCHBOARD_INTENT_TOKEN: "job-token"
          },
          raw: { job: { token: "job-token" } }
        };
      },
      async createDeploymentIntentGroup(input) {
        options.createGroupRequests?.push(input);
        return {
          groupId: "dig_test",
          cliToken: "group-cli-token",
          env: {
            SWITCHBOARD_RELAY_URL: "https://relay.test",
            SWITCHBOARD_INTENT_GROUP_ID: "dig_test",
            SWITCHBOARD_INTENT_TOKEN: "group-job-token"
          },
          group: {
            groupId: "dig_test",
            expectedReplicas: input.expectedReplicas,
            minReady: input.minReady,
            members: input.members.map((member, index) => ({
              ...member,
              intentId: `di_member_${index + 1}`,
              validationHostname: `v-${index + 1}.example.test`
            }))
          },
          members: input.members.map((member, index) => ({
            ...member,
            intentId: `di_member_${index + 1}`,
            validationHostname: `v-${index + 1}.example.test`
          })),
          raw: { job: { token: "group-job-token" } }
        };
      },
      async readDeploymentIntentGroup() {
        const claimedCount = options.groupClaimedMembers ?? 2;
        return {
          ok: true,
          group: {
            groupId: "dig_test",
            members: [1, 2].map((index) => ({
              memberId: `member-${index}`,
              intentId: `di_member_${index}`,
              jobId: `0x${String(index).repeat(64)}`,
              operatorId: capacity.operatorId,
              processorId: index === 1 ? capacity.processorId : `0x${"66".repeat(32)}`,
              processor: index === 1 ? capacity.processor : "5Dprocessor2",
              gatewayId: index === 1 ? "gateway-a" : "gateway-b",
              runtimeSigner: index <= claimedCount ? `0x500000000000000000000000000000000000000${index}` : undefined,
              upstreamIps: index <= claimedCount ? [`203.0.113.${index}`] : undefined
            }))
          }
        };
      },
      async updateDeploymentIntentGroupDeployment(groupId, _input, requestOptions) {
        options.protectedCalls?.push({
          method: "updateDeploymentIntentGroupDeployment",
          id: groupId,
          cliToken: requestOptions?.cliToken
        });
        return { ok: true };
      },
      async updateDeploymentIntentDeployment(intentId, _input, requestOptions) {
        options.protectedCalls?.push({
          method: "updateDeploymentIntentDeployment",
          id: intentId,
          cliToken: requestOptions?.cliToken
        });
        return { ok: true };
      },
      async readDeploymentIntent(intentId, requestOptions) {
        options.protectedCalls?.push({
          method: "readDeploymentIntent",
          id: intentId,
          cliToken: requestOptions?.cliToken
        });
        runtimeReadCount += 1;
        if (options.runtimeClaimsAfter && runtimeReadCount < options.runtimeClaimsAfter) {
          return {
            ok: true,
            intent: {
              status: "deploying",
              funding: {}
            }
          };
        }
        return {
          ok: true,
          intent: {
            status: "active",
            runtimeSigner: "0x5000000000000000000000000000000000000005",
            upstreamIps: ["203.0.113.10"],
            funding: { sessionId: `0x${"22".repeat(32)}` }
          }
        };
      },
      async refreshDeploymentIntentFunding(intentId, requestOptions) {
        options.protectedCalls?.push({
          method: "refreshDeploymentIntentFunding",
          id: intentId,
          cliToken: requestOptions?.cliToken
        });
        return {
          ok: true,
          intent: {
            funding: {
              status: "funded",
              sessionId: `0x${"22".repeat(32)}`,
              session: options.activationDeadline
                ? {
                    activationDeadline: options.activationDeadline,
                    paidSeconds: "120",
                    registered: true
                  }
                : undefined
            },
            dns: { status: "propagated", hostname: "e-test.acurast.ingress.works" }
          }
        };
      },
      async refreshDeploymentIntentGroupMemberFunding(_groupId, intentId) {
        return {
          ok: true,
          intent: {
            intentId,
            funding: { status: "funded", sessionId: `0x${"22".repeat(32)}` },
            dns: { status: "propagated", hostname: "e-test.acurast.ingress.works" }
          }
        };
      },
      async refreshDeploymentIntentRoute(intentId, requestOptions) {
        options.protectedCalls?.push({
          method: "refreshDeploymentIntentRoute",
          id: intentId,
          cliToken: requestOptions?.cliToken
        });
        routeRefreshCount += 1;
        if (options.routeNotReadyOnce && routeRefreshCount === 1) {
          throw new Error(
            `POST /v1/deployment-intents/${intentId}/route-refresh failed (409): ` +
            JSON.stringify({
              error: "route_not_ready",
              requestId: "req_route_ready",
              reason: "runtime_https_not_ready",
              health: {
                state: "certificate_requesting",
                updatedAt: "2026-06-08T12:00:00.000Z",
                details: {
                  stage: "relay_response",
                  attempt: 7,
                  hostname: "e-test.acurast.ingress.works",
                  retryMs: 30000,
                  elapsedMs: 120000,
                  activationDeadlineIso: "2026-06-08T12:10:00.000Z",
                  activationDeadlineRemainingMs: 480000
                }
              },
              retryAfterMs: 30000
            })
          );
        }
        if (options.routeRefreshTransientOnce && routeRefreshCount === 1) {
          throw new Error(`POST /v1/deployment-intents/${intentId}/route-refresh failed (502): `);
        }
        return { ok: true, route: { status: "active", hostname: "e-test.acurast.ingress.works" } };
      },
      async refreshDeploymentIntentGroupMemberRoute(_groupId, intentId) {
        return { ok: true, intent: { intentId, route: { status: "active", hostname: "e-test.acurast.ingress.works" } } };
      },
      async listValidationReports() {
        return { ok: true, reports: [{ reportId: "vr_test", success: true }] };
      }
    },
    acurast: {
      async submit({ workflow, deploymentIntent, deploymentIntentGroup }) {
        if (options.requireDeployAction) {
          if (workflow.input.deploymentMode === "group") {
            return {
              id: "deploy-1",
              kind: "acurast.deploy",
              description: "Run Acurast group deploy",
              payload: buildAcurastGroupDeployRequiredAction(workflow, deploymentIntentGroup)
            };
          }
          return {
            id: "deploy-1",
            kind: "acurast.deploy",
            description: "Run Acurast deploy",
            payload: buildAcurastDeployRequiredAction(workflow, deploymentIntent)
          };
        }
        return {
          acurastDeploymentId: "59399",
          deploymentId: "59399",
          txHash: "0xdeploy"
        };
      }
    },
    funding: {
      async requestQuote() {
        return {
          ok: true,
          quote: {
            sessionId: `0x${"22".repeat(32)}`,
            amount: "120000"
          },
          signature: `0x${"aa".repeat(65)}`,
          endpointHostname: "e-test.acurast.ingress.works"
        };
      },
      async fundQuote(input) {
        options.fundRequests?.push(input);
        if (options.requireFundingAction) {
          return {
            id: "fund-1",
            kind: "hub.fund",
            description: "Sign Hub funding extrinsics",
            payload: { sessionId: `0x${"22".repeat(32)}` }
          };
        }
        return { txHash: "0xfund", status: "inBlock" };
      }
    },
    dns: {
      async resolve(hostname) {
        if (options.dnsUnresolved) {
          const error = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
          error.code = "ENOTFOUND";
          throw error;
        }
        return options.dnsAddresses ?? ["203.0.113.10"];
      }
    },
    store: options.saved ? { save: (snapshot) => options.saved.push(snapshot) } : undefined
  };
}
