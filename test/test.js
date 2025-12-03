/**
 * Test script for EventDock Webhook Health Action
 *
 * This simulates what the GitHub Action does by calling the health endpoint
 * and processing the response.
 *
 * Usage:
 *   EVENTDOCK_API_KEY=your_jwt_token node test/test.js
 */

const API_URL = process.env.EVENTDOCK_API_URL || 'https://api.eventdock.app';
const API_KEY = process.env.EVENTDOCK_API_KEY;

if (!API_KEY) {
  console.error('ERROR: EVENTDOCK_API_KEY environment variable is required');
  console.error('Usage: EVENTDOCK_API_KEY=your_jwt_token node test/test.js');
  process.exit(1);
}

async function getHealthStats(apiUrl, apiKey, endpointId) {
  const healthUrl = endpointId
    ? `${apiUrl}/v1/health?endpoint_id=${endpointId}`
    : `${apiUrl}/v1/health`;

  console.log(`\nFetching health stats from: ${healthUrl}`);

  const response = await fetch(healthUrl, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

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
    case 'healthy': return '✅';
    case 'degraded': return '⚠️';
    case 'unhealthy': return '❌';
    default: return '❓';
  }
}

async function run() {
  try {
    console.log('='.repeat(50));
    console.log('EventDock Webhook Health Action - Test');
    console.log('='.repeat(50));

    // Fetch health stats
    const stats = await getHealthStats(API_URL, API_KEY);

    // Determine overall status
    const status = determineStatus(stats.success_rate, stats.dlq_count);
    const emoji = getStatusEmoji(status);

    console.log('\n' + '='.repeat(50));
    console.log(`${emoji} Status: ${status.toUpperCase()}`);
    console.log('='.repeat(50));

    console.log('\nLast 24 Hours:');
    console.log(`  Total Events:    ${stats.total_events}`);
    console.log(`  Delivered:       ${stats.delivered_events}`);
    console.log(`  Failed:          ${stats.failed_events}`);
    console.log(`  Pending:         ${stats.pending_events}`);
    console.log(`  Success Rate:    ${stats.success_rate.toFixed(2)}%`);
    console.log(`  In DLQ:          ${stats.dlq_count}`);
    console.log(`  Endpoints:       ${stats.endpoints_count}`);

    if (stats.endpoints && stats.endpoints.length > 0) {
      console.log('\nEndpoints:');
      for (const ep of stats.endpoints) {
        const epStatus = ep.status === 'active' ? '🟢' : '🟡';
        console.log(`  ${epStatus} ${ep.name} (${ep.provider}): ${ep.success_rate.toFixed(2)}% success`);
      }
    }

    console.log('\nPeriod:');
    console.log(`  From: ${stats.period.start}`);
    console.log(`  To:   ${stats.period.end}`);

    console.log('\n' + '='.repeat(50));
    console.log('Test completed successfully!');
    console.log('='.repeat(50));

    // Return outputs like the action would
    return {
      status,
      'success-rate': stats.success_rate.toFixed(2),
      'total-events': stats.total_events,
      'delivered-events': stats.delivered_events,
      'failed-events': stats.failed_events,
      'dlq-count': stats.dlq_count,
      'endpoints-checked': stats.endpoints_count,
    };

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

run().then(outputs => {
  console.log('\nAction outputs would be:');
  console.log(JSON.stringify(outputs, null, 2));
});
