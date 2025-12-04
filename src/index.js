const core = require('@actions/core');
const github = require('@actions/github');

async function fetchWithTimeout(url, options, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getHealthStats(apiUrl, apiKey, endpointId) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  // Get health stats from the API
  const healthUrl = endpointId
    ? `${apiUrl}/v1/health?endpoint_id=${endpointId}`
    : `${apiUrl}/v1/health`;

  const response = await fetchWithTimeout(healthUrl, { headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed: ${response.status} - ${text}`);
  }

  return response.json();
}

function determineStatus(successRate, dlqCount) {
  if (successRate >= 99 && dlqCount === 0) {
    return 'healthy';
  } else if (successRate >= 90) {
    return 'degraded';
  } else {
    return 'unhealthy';
  }
}

function getStatusEmoji(status) {
  switch (status) {
    case 'healthy': return ':white_check_mark:';
    case 'degraded': return ':warning:';
    case 'unhealthy': return ':x:';
    default: return ':question:';
  }
}

function generateReport(stats) {
  const status = determineStatus(stats.success_rate, stats.dlq_count);
  const emoji = getStatusEmoji(status);

  let report = `## ${emoji} EventDock Webhook Health Report\n\n`;
  report += `**Status:** ${status.toUpperCase()}\n\n`;
  report += `### Last 24 Hours\n\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Total Events | ${stats.total_events.toLocaleString()} |\n`;
  report += `| Delivered | ${stats.delivered_events.toLocaleString()} |\n`;
  report += `| Failed | ${stats.failed_events.toLocaleString()} |\n`;
  report += `| Success Rate | ${stats.success_rate.toFixed(2)}% |\n`;
  report += `| In DLQ | ${stats.dlq_count.toLocaleString()} |\n`;
  report += `| Endpoints | ${stats.endpoints_count} |\n\n`;

  if (stats.endpoints && stats.endpoints.length > 0) {
    report += `### Endpoints\n\n`;
    report += `| Name | Provider | Status | Success Rate |\n`;
    report += `|------|----------|--------|-------------|\n`;
    for (const ep of stats.endpoints) {
      const epEmoji = ep.status === 'active' ? ':green_circle:' : ':yellow_circle:';
      report += `| ${ep.name} | ${ep.provider} | ${epEmoji} ${ep.status} | ${ep.success_rate?.toFixed(2) || 'N/A'}% |\n`;
    }
    report += '\n';
  }

  report += `---\n`;
  report += `*Powered by [EventDock](https://eventdock.app) - Reliable Webhook Infrastructure*\n`;

  return report;
}

async function postPRComment(token, report) {
  const context = github.context;

  if (!context.payload.pull_request) {
    core.info('Not a pull request, skipping comment');
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = context.repo;
  const prNumber = context.payload.pull_request.number;

  // Check for existing comment to update
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber
  });

  const botComment = comments.find(comment =>
    comment.body.includes('EventDock Webhook Health Report')
  );

  if (botComment) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: botComment.id,
      body: report
    });
    core.info(`Updated existing PR comment #${botComment.id}`);
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: report
    });
    core.info(`Created new PR comment on PR #${prNumber}`);
  }
}

async function run() {
  try {
    // Get inputs
    const apiKey = core.getInput('api-key', { required: true });
    const endpointId = core.getInput('endpoint-id');
    const apiUrl = core.getInput('api-url') || 'https://api.eventdock.app';
    const failOnUnhealthy = core.getInput('fail-on-unhealthy') === 'true';
    const failThreshold = parseFloat(core.getInput('fail-threshold') || '90');
    const postComment = core.getInput('post-comment') === 'true';
    const githubToken = core.getInput('github-token');

    core.info(`Checking webhook health at ${apiUrl}...`);
    if (endpointId) {
      core.info(`Checking specific endpoint: ${endpointId}`);
    }

    // Fetch health stats
    const stats = await getHealthStats(apiUrl, apiKey, endpointId);

    // Determine overall status
    const status = determineStatus(stats.success_rate, stats.dlq_count);

    core.info(`Status: ${status}`);
    core.info(`Success Rate: ${stats.success_rate.toFixed(2)}%`);
    core.info(`Total Events (24h): ${stats.total_events}`);
    core.info(`DLQ Count: ${stats.dlq_count}`);

    // Set outputs
    core.setOutput('status', status);
    core.setOutput('success-rate', stats.success_rate.toFixed(2));
    core.setOutput('total-events', stats.total_events);
    core.setOutput('delivered-events', stats.delivered_events);
    core.setOutput('failed-events', stats.failed_events);
    core.setOutput('dlq-count', stats.dlq_count);
    core.setOutput('endpoints-checked', stats.endpoints_count);

    // Generate report
    const report = generateReport(stats);
    core.setOutput('report', report);

    // Post PR comment if requested
    if (postComment) {
      if (!githubToken) {
        core.warning('github-token is required to post PR comments');
      } else {
        await postPRComment(githubToken, report);
      }
    }

    // Log summary (only in GitHub Actions environment)
    try {
      await core.summary
        .addHeading('EventDock Webhook Health')
        .addTable([
          [{data: 'Metric', header: true}, {data: 'Value', header: true}],
          ['Status', status.toUpperCase()],
          ['Success Rate', `${stats.success_rate.toFixed(2)}%`],
          ['Total Events (24h)', stats.total_events.toString()],
          ['Delivered', stats.delivered_events.toString()],
          ['Failed', stats.failed_events.toString()],
          ['In DLQ', stats.dlq_count.toString()],
          ['Endpoints', stats.endpoints_count.toString()]
        ])
        .write();
    } catch (e) {
      // Summary not available outside GitHub Actions
      core.debug('Job summary not available');
    }

    // Fail if unhealthy and configured to do so
    if (failOnUnhealthy && stats.success_rate < failThreshold) {
      core.setFailed(`Webhook health check failed: success rate ${stats.success_rate.toFixed(2)}% is below threshold ${failThreshold}%`);
    }

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();
