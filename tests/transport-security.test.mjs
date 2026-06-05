import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SwitchboardControlPlaneClient } from "../dist/control-plane.js";
import {
  requestDeploymentIntentGroupMemberQuote,
  requestDeploymentIntentQuote,
  requestDeploymentIntentQuoteOrResume
} from "../dist/funding.js";

const SIGNATURE = `0x${"11".repeat(65)}`;

describe("Switchboard workflows transport security", () => {
  it("applies secure relay URL guards to control-plane and funding requests", async () => {
    assert.throws(
      () => new SwitchboardControlPlaneClient({ relayUrl: "http://relay.example.test", cliToken: "cli-secret" }),
      /Switchboard control-plane relay URL must use https:\/\//
    );

    const controlFetch = recordingFetch();
    const control = new SwitchboardControlPlaneClient({
      relayUrl: "https://relay.example.test",
      cliToken: "cli-secret",
      fetchImpl: controlFetch
    });
    await control.health();
    assert.deepEqual(controlFetch.calls.map((call) => `${call.method} ${call.url}`), [
      "GET https://relay.example.test/health"
    ]);

    const fundingFetch = recordingFetch({ ok: true, quote: {}, signature: SIGNATURE });
    await requestDeploymentIntentQuote({
      relayUrl: "https://relay.example.test",
      intentId: "di_test",
      cliToken: "cli-secret",
      body: { paidSeconds: "600" },
      fetchImpl: fundingFetch
    });
    await requestDeploymentIntentGroupMemberQuote({
      relayUrl: "https://relay.example.test",
      groupId: "dig_test",
      intentId: "di_child",
      cliToken: "cli-secret",
      body: { paidSeconds: "600" },
      fetchImpl: fundingFetch
    });
    assert.deepEqual(fundingFetch.calls.map((call) => `${call.method} ${new URL(call.url).pathname}`), [
      "POST /v1/deployment-intents/di_test/quote",
      "POST /v1/deployment-intent-groups/dig_test/members/di_child/quote"
    ]);

    const statusFetch = recordingFetch();
    statusFetch.nextError = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    await assert.rejects(
      () => requestDeploymentIntentQuoteOrResume({
        relayUrl: "https://relay.example.test",
        intentId: "di_test",
        cliToken: "cli-secret",
        body: { paidSeconds: "600" },
        timeoutMs: 1,
        fetchImpl: statusFetch
      }),
      /timed out/
    );
    assert.deepEqual(statusFetch.calls.map((call) => `${call.method} ${new URL(call.url).pathname}`), [
      "POST /v1/deployment-intents/di_test/quote",
      "GET /v1/deployment-intents/di_test"
    ]);

    await assert.rejects(
      () => requestDeploymentIntentQuote({
        relayUrl: "http://relay.example.test",
        intentId: "di_test",
        cliToken: "cli-secret",
        body: {},
        fetchImpl: recordingFetch()
      }),
      /Switchboard quote relay URL must use https:\/\//
    );
  });
});

function recordingFetch(body = { ok: true }) {
  const fetchImpl = async (url, init = {}) => {
    fetchImpl.calls.push({
      url: url.toString(),
      method: init.method ?? "GET",
      headers: init.headers ?? {}
    });
    if (fetchImpl.nextError) {
      const error = fetchImpl.nextError;
      fetchImpl.nextError = undefined;
      throw error;
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  fetchImpl.calls = [];
  fetchImpl.nextError = undefined;
  return fetchImpl;
}
