# Switchboard Workflows JS

Executor-neutral Switchboard deployment workflows and host-side helpers.

This package is the replacement for the control-plane, funding, workflow,
manifest, report-signing, service-catalog, and service-discovery subpaths of
the old `@proofcomputer/switchboard-sdk` package.

## Install

```sh
npm install @proof-computer/switchboard-workflows
```

## Deploy Workflow API

```ts
import { SwitchboardDeployWorkflow } from "@proof-computer/switchboard-workflows";
import { SwitchboardControlPlaneClient } from "@proof-computer/switchboard-workflows/control-plane";
```

Use this package from host/orchestrator code such as Slipway or the PROOF
Switchboard oclif plugin. Job/runtime code should use
`@proof-computer/switchboard-runtime`.
