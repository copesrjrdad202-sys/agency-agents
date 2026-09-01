import { spawn } from 'child_process';
import http from 'http';
import { URL } from 'url';

type Service = {
  name: string;
  port: number;
  pathMatch: (pathname: string) => boolean;
  rewrite?: (pathname: string) => string;
};

const PUBLIC_PORT = parseInt(process.env.PORT || '8080', 10);
const DIST_DIR = __dirname;

const services: Service[] = [
  { name: 'calendar-connector', port: 3000, pathMatch: (p) => /^\/businesses\/[^/]+\/(auth|oauth2callback|events|webhook)(\/|$)/.test(p) },
  { name: 'business-context', port: 3100, pathMatch: (p) => p === '/businesses' || /^\/businesses\/[^/]+$/.test(p) },
  { name: 'automation', port: 3200, pathMatch: (p) => p === '/process' || p.startsWith('/process/') },
  { name: 'intake', port: 3300, pathMatch: (p) => p === '/intake' || p.startsWith('/intake/') },
  { name: 'calendar-agent', port: 3401, pathMatch: (p) => /^\/businesses\/[^/]+\/(availability|book|update|cancel)(\/|$)/.test(p) },
  { name: 'invoice', port: 3400, pathMatch: (p) => p === '/invoice' || p.startsWith('/invoice') || p === '/invoices' || p.startsWith('/invoices/') || /^\/businesses\/[^/]+\/invoices(\/|$)/.test(p) },
  { name: 'stripe-live', port: 3500, pathMatch: (p) => p.startsWith('/stripe') },
  { name: 'payment', port: 3600, pathMatch: (p) => p === '/payment' || p.startsWith('/payment') || p === '/payments' || p.startsWith('/payments/') || /^\/businesses\/[^/]+\/payments(\/|$)/.test(p) || p === '/webhooks/stripe' || p === '/webhooks/stripe/' },
  { name: 'tax', port: 3700, pathMatch: (p) => p.startsWith('/tax') || /^\/businesses\/[^/]+\/(record-income|tax-summary|tax-sheet)(\/|$)/.test(p) },
  { name: 'twilio-live', port: 3800, pathMatch: (p) => p.startsWith('/twilio') || p === '/sms' || p.startsWith('/sms/') || p === '/voice' || p.startsWith('/voice/') || p === '/webhooks/sms' || p === '/webhooks/voice' || p.startsWith('/messages') || p.startsWith('/calls') },
  { name: 'elevenlabs', port: 3901, pathMatch: (p) => p.startsWith('/voice') || p.startsWith('/tts') || p === '/voice/session' || p === '/voice/transcript' || p.startsWith('/voice/') },
  { name: 'reminder', port: 3900, pathMatch: (p) => p === '/reminders' || p.startsWith('/reminders/') || /^\/businesses\/[^/]+\/reminders(\/|$)/.test(p) || p.startsWith('/schedule') || p.startsWith('/send/') || /^\/appointments\/[^/]+\/reminders(\/|$)/.test(p) || p.startsWith('/appointments/') },
  { name: 'pnl', port: 3950, pathMatch: (p) => p === '/pnl' || p.startsWith('/pnl/') || /^\/businesses\/[^/]+\/pnl(\/|$)/.test(p) || /^\/businesses\/[^/]+\/dashboard(\/|$)/.test(p) },
  { name: 'social-broker', port: 3960, pathMatch: (p) => p.startsWith('/social-access') || p.startsWith('/social/tokens') || p.startsWith('/social/scopes') || p.startsWith('/social/audit') },
  { name: 'social-automation', port: 3961, pathMatch: (p) => p.startsWith('/social') || p.startsWith('/campaigns') || p.startsWith('/drafts') || p.startsWith('/approvals') || p.startsWith('/publishes') || p.startsWith('/engagement') },
];

const children: Array<[string, number]> = [
  ['businessContextAgent.js', 3100],
  ['googleCalendarConnector.js', 3000],
  ['calendarAgent.js', 3401],
  ['intakeAgent.js', 3300],
  ['automationAgent.js', 3200],
  ['invoiceAgent.js', 3400],
  ['paymentAgent.js', 3600],
  ['taxAgent.js', 3700],
  ['stripeConnectorLive.js', 3500],
  ['twilioConnectorLive.js', 3800],
  ['reminderAgent.js', 3900],
  ['elevenLabsConnector.js', 3901],
  ['pnlAgent.js', 3950],
  ['socialAccessBroker.js', 3960],
  ['socialMediaAutomationAgent.js', 3961],
];

function startChild(file: string, port: number) {
  const child = spawn(process.execPath, [`${DIST_DIR}/${file}`], {
    env: { 
      ...process.env, 
      PORT: String(port), 
      BUSINESS_CONTEXT_PORT: '3100', 
      CALENDAR_AGENT_URL: `http://127.0.0.1:3401`, 
      CALENDAR_CONNECTOR_URL: 'http://127.0.0.1:3000', 
      STRIPE_CONNECTOR_URL: 'http://127.0.0.1:3500',
      PAYMENT_AGENT_URL: 'http://127.0.0.1:3600',
      SOCIAL_ACCESS_BROKER_URL: 'http://127.0.0.1:3960' 
    },
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`${file} exited with code ${code}`);
      process.exit(code || 1);
    }
  });
  return child;
}

function proxyRequest(targetPort: number, req: http.IncomingMessage, res: http.ServerResponse) {
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: targetPort,
      method: req.method,
      path: req.url,
      headers: req.headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  });

  req.pipe(upstream);
}

function route(pathname: string): number | null {
  for (const service of services) {
    if (service.pathMatch(pathname)) return service.port;
  }
  return null;
}

for (const [file, port] of children) {
  startChild(file, port);
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;

  if (pathname === '/' || pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      ts: new Date().toISOString(),
      services: services.map((service) => ({ name: service.name, port: service.port })),
    }));
    return;
  }

  const targetPort = route(pathname);
  if (!targetPort) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route not found', path: pathname }));
    return;
  }

  proxyRequest(targetPort, req, res);
});

server.listen(PUBLIC_PORT, () => {
  console.log(`Production gateway listening on http://localhost:${PUBLIC_PORT}`);
});
