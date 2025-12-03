# EventDock Webhook Health Check Action

A GitHub Action that checks the health of your webhook endpoints using EventDock and reports delivery statistics.

## Features

- Check webhook delivery success rates
- Monitor dead letter queue (DLQ) status
- Get per-endpoint health statistics
- Optionally fail workflows if webhooks are unhealthy
- Post health reports as PR comments
- Generate GitHub Actions job summaries

## Usage

### Basic Usage

```yaml
- uses: eventdock/webhook-health-action@v1
  with:
    api-key: ${{ secrets.EVENTDOCK_API_KEY }}
```

### Check Specific Endpoint

```yaml
- uses: eventdock/webhook-health-action@v1
  with:
    api-key: ${{ secrets.EVENTDOCK_API_KEY }}
    endpoint-id: ep_abc123
```

### Fail on Unhealthy Webhooks

```yaml
- uses: eventdock/webhook-health-action@v1
  with:
    api-key: ${{ secrets.EVENTDOCK_API_KEY }}
    fail-on-unhealthy: 'true'
    fail-threshold: '95'  # Fail if success rate < 95%
```

### Post PR Comment

```yaml
- uses: eventdock/webhook-health-action@v1
  with:
    api-key: ${{ secrets.EVENTDOCK_API_KEY }}
    post-comment: 'true'
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `api-key` | Your EventDock API key | Yes | - |
| `endpoint-id` | Specific endpoint ID to check | No | All endpoints |
| `api-url` | EventDock API URL | No | `https://api.eventdock.app` |
| `fail-on-unhealthy` | Fail workflow if unhealthy | No | `false` |
| `fail-threshold` | Success rate % to fail below | No | `90` |
| `post-comment` | Post PR comment with stats | No | `false` |
| `github-token` | Token for PR comments | No | - |

## Outputs

| Output | Description |
|--------|-------------|
| `status` | Overall health status (`healthy`, `degraded`, `unhealthy`) |
| `success-rate` | Delivery success rate percentage (last 24h) |
| `total-events` | Total events in the last 24h |
| `delivered-events` | Successfully delivered events |
| `failed-events` | Failed events |
| `dlq-count` | Events in dead letter queue |
| `endpoints-checked` | Number of endpoints checked |
| `report` | Full markdown health report |

## Example Workflow

```yaml
name: Webhook Health Check

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  check-webhooks:
    runs-on: ubuntu-latest
    steps:
      - name: Check Webhook Health
        id: health
        uses: eventdock/webhook-health-action@v1
        with:
          api-key: ${{ secrets.EVENTDOCK_API_KEY }}
          fail-on-unhealthy: 'true'
          fail-threshold: '90'
          post-comment: ${{ github.event_name == 'pull_request' }}
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Print Status
        run: |
          echo "Status: ${{ steps.health.outputs.status }}"
          echo "Success Rate: ${{ steps.health.outputs.success-rate }}%"
          echo "Total Events: ${{ steps.health.outputs.total-events }}"
```

## Pre-deployment Health Check

Use in your deployment workflow to ensure webhooks are healthy before deploying:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  pre-deploy-check:
    runs-on: ubuntu-latest
    steps:
      - name: Check Webhook Health
        uses: eventdock/webhook-health-action@v1
        with:
          api-key: ${{ secrets.EVENTDOCK_API_KEY }}
          fail-on-unhealthy: 'true'
          fail-threshold: '95'

  deploy:
    needs: pre-deploy-check
    runs-on: ubuntu-latest
    steps:
      - name: Deploy Application
        run: echo "Deploying..."
```

## Getting Your API Key

1. Sign up at [eventdock.app](https://eventdock.app)
2. Go to Settings > API Keys
3. Create a new API key
4. Add it as a secret in your GitHub repository (`EVENTDOCK_API_KEY`)

## Health Status Levels

| Status | Description |
|--------|-------------|
| `healthy` | Success rate >= 99% and no events in DLQ |
| `degraded` | Success rate >= 90% but < 99%, or has DLQ events |
| `unhealthy` | Success rate < 90% |

## License

MIT
