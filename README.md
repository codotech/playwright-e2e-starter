# Playwright E2E Starter

A repository template that starts its own application and tests its base URL with [codotech/playwright-e2e](https://github.com/codotech/playwright-e2e).

The included echo service is intentionally small. The caller workflow manages Docker Compose startup, readiness, service logs, and cleanup. The action only owns Playwright execution, reports, and portable images. You can also target an existing environment without starting any services.

![Caller-started system or existing remote environment provides a ready base URL to codotech/playwright-e2e@v0, which runs tests and produces reports for the caller's E2E gate](docs/diagrams/starter-flow.svg)

## Create your repository

1. Select **Use this template** on GitHub.
2. Keep the `e2e/` directory name.
3. Replace `sut/` and `compose.e2e.yml` with the services your tests need and adapt the workflow's lifecycle steps, or follow the existing-environment recipe below.
4. Set the SUT URL and execution profiles in `e2e/ci.yml`.
5. Replace the example tests under `e2e/tests/`.
6. Define projects, reporters, workers, retries, and trace policy in `e2e/playwright.config.ts`.
7. Require the **E2E Gate** check before merging.

The workflow uses the major-version tag `codotech/playwright-e2e@v0`, not a commit SHA. This recipe requires a release containing the URL-only contract. Currently `v0` points to `v0.2.0`, which still requires action-managed Compose, so this starter change must wait for the compatible release. See [.github/workflows/e2e.yml](.github/workflows/e2e.yml).

## What belongs where

![Starter repository layout showing workflow policy and the E2E directory, with Compose and service files marked as optional examples that remote targets do not need](docs/diagrams/repository-layout.svg)

The application repository owns workflow policy, SUT topology, readiness, and cleanup. The external action owns the test execution engine and accepts only the application's URL. Tests and their dependencies stay in `e2e/`, so any material runner change produces a new content hash and runner image. Service-only or profile-only changes reuse the validated runner while the caller independently manages the application.

## Start the application in your workflow

The supplied [.github/workflows/e2e.yml](.github/workflows/e2e.yml) runs this lifecycle:

1. Check out the repository.
2. Start Compose with `docker compose -f compose.e2e.yml up --detach --build --wait`.
3. Invoke the action against the ready application.
4. Collect service logs and run `docker compose -f compose.e2e.yml down --volumes --remove-orphans` in caller-owned steps with `if: always()`.
5. Upload service logs separately, update the PR comment, and enforce the final gate.

The action never reads a Compose file or manages these services. Its application configuration is only:

```yaml
sut:
  baseUrl: http://127.0.0.1:4173
```

When migrating from an earlier recipe, remove `sut.composeFile` from `e2e/ci.yml`. That option is no longer supported; move its lifecycle responsibilities into your workflow.

## Configure CI selection

`e2e/ci.yml` provides named profiles:

```yaml
profiles:
  pull-request:
    projects: [api, chromium]
    labels: ["@smoke"]
    labelMatch: any

  main:
    projects: [api, chromium]
    labels: []
    labelMatch: all
```

A project is a Playwright execution variant configured in `playwright.config.ts`. A label is a Playwright tag attached to a test, such as `@smoke`. They are separate filters and the selected suite is their intersection.

Manual runs can choose a profile and override projects, tags, or tag matching without editing the repository. `all` requires every requested tag; `any` accepts any requested tag.

The root action runs in one GitHub job. Keep `execution.shards: 1`. Playwright workers still execute tests concurrently inside the runner container.

## Run locally

Prerequisites: Docker, Node.js 22, Corepack, and pnpm 10.26.2.

```bash
corepack enable
corepack prepare pnpm@10.26.2 --activate
pnpm --dir e2e install --frozen-lockfile
pnpm --dir e2e install:browsers
docker compose -f compose.e2e.yml up --detach --build --wait
BASE_URL=http://127.0.0.1:4173 pnpm --dir e2e test
docker compose -f compose.e2e.yml down --volumes --remove-orphans
```

Always run the final cleanup command, including after a failed test. Run the static check with:

```bash
pnpm --dir e2e test:static
```

### Target an existing environment

Replace the `sut` section in `e2e/ci.yml` with:

```yaml
sut:
  baseUrl: https://staging.example.com
```

Adapt [.github/workflows/e2e.yml](.github/workflows/e2e.yml):

1. Remove the Compose startup, service-log collection, service-log upload, and cleanup steps.
2. Remove `if: steps.sut.outcome == 'success'` from **Run E2E**; otherwise deleting startup also skips the action.
3. Remove lifecycle outcome references from the final gate and PR comment, retaining the action-result check.
4. Remove the unused `COMPOSE_PROJECT_NAME` environment setting.

The example `sut/` directory and root Compose file are no longer needed. Keep the runner Dockerfile, entrypoint, Playwright configuration, reporters, and workflow result handling.

After installing the E2E dependencies, run locally with:

```bash
BASE_URL=https://staging.example.com pnpm --dir e2e test
```

CI passes the configured URL into the test container. The action does not start, collect service logs from, or tear down the target. Docker is still used for the runner and report images. The target must already be reachable and ready. Tests can modify data, so select an authorized test environment.

Do not put credentials in the URL. Arbitrary workflow environment variables, including API tokens, are not currently forwarded into the test container.

## CI behavior

The supplied workflow runs for pull requests, pushes to `main`, and manual dispatches. It:

- cancels stale runs for the same pull request or ref;
- checks out the application and starts Compose with readiness checks before invoking the action;
- uses `pull-request`, `main`, or the manually selected profile;
- creates or updates one E2E report comment on pull requests;
- publishes the test results, Playwright HTML report, traces, runner image, and report image;
- collects and uploads service logs separately and attempts Compose cleanup even after failure;
- preserves application lifecycle failures and the failing action result after the report comment is written.

The action needs no inherited secrets. Add repository or environment secrets to the workflow only when your SUT requires them.

## Artifacts

| Artifact | Purpose |
| --- | --- |
| `e2e-results` | Final result, CTRF data, HTML report, traces, screenshots, and video |
| `sut-logs` | Service logs and teardown output collected by the caller workflow, not the action |
| `e2e-runner-image` | Portable archive of the exact Playwright runner used |
| `e2e-report-image` | Portable image serving the HTML report on port 8080 |

Action artifacts use the retention configured in `e2e/ci.yml`; the workflow configures service-log retention separately. The image archives are not published to a registry.

## Replace the example SUT

The example service exposes `/health` and `/echo` on port 4173. When adapting the template:

- make every required service part of `compose.e2e.yml`;
- add Compose health checks so the test starts only after the system is ready;
- expose the browser-facing URL on the host and place it in `sut.baseUrl`;
- keep teardown safe for repeated and cancelled runs;
- avoid installing application dependencies directly on the GitHub host.

The supplied workflow runs Compose with build and wait enabled, collects logs, and attempts to remove containers, networks, and volumes after the suite. These are application-owned steps; the action has no lifecycle hooks or Compose configuration.

## Upgrade the action

Use major-version tags in `.github/workflows/e2e.yml`, such as `@v0` or `@v1`, rather than commit SHAs or feature branches. Review breaking changes before changing the major version. Ensure the selected release line includes the URL-only contract before merging this recipe.

## License

[MIT](LICENSE)
