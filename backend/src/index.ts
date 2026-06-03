import express from 'express';
import cors from 'cors';
import { webhookRouter } from './routes/webhook';
import { leadsRouter } from './routes/leads';
import { dashboardRouter } from './routes/dashboard';
import { trackableMessagesRouter } from './routes/trackableMessages';
import { trackableLinksRouter } from './routes/trackableLinks';
import { journeyStagesRouter } from './routes/journeyStages';
import { conversionEventsRouter } from './routes/conversionEvents';
import { numbersRouter } from './routes/numbers';
import { workspaceRouter } from './routes/workspace';
import { redirectRouter } from './routes/redirect';
import { rotatorRedirectRouter } from './routes/rotatorRedirect';
import { rotatorsRouter } from './routes/rotators';
import { authMiddleware } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Public routes
app.use('/api/webhooks', webhookRouter);
app.use('/r', redirectRouter);
app.use('/j', rotatorRedirectRouter);

// Protected routes
app.use('/api', authMiddleware);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/trackable-messages', trackableMessagesRouter);
app.use('/api/trackable-links', trackableLinksRouter);
app.use('/api/journey-stages', journeyStagesRouter);
app.use('/api/conversion-events', conversionEventsRouter);
app.use('/api/numbers', numbersRouter);
app.use('/api/rotators', rotatorsRouter);
app.use('/api/workspace', workspaceRouter);

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

export default app;
