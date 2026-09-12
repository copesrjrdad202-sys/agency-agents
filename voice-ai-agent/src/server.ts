import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import webhookRouter from './routes/webhook';
import twilioRouter from './routes/twilio';
import adminRouter from './routes/admin';
import { clearExpiredSessions } from './services/session';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve the frontend demo client
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.use('/api', webhookRouter);
app.use('/api', twilioRouter);
app.use('/api/admin', adminRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Periodically clear stale in-memory sessions.
setInterval(clearExpiredSessions, 5 * 60 * 1000).unref();

app.listen(config.port, () => {
  console.log(`Voice AI Agent server listening on port ${config.port}`);
  console.log(`Demo client: http://localhost:${config.port}`);
  console.log(`Calendar provider: ${config.calendar.provider}`);
});
