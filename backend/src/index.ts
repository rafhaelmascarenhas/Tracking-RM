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
import { reportsRouter } from './routes/reports';
import { triggersRouter } from './routes/triggers';
import { pixelFiresRouter } from './routes/pixelFires';
import { authRouter } from './routes/auth';
import { authMiddleware } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
// Limite 10mb (default do express é 100kb). Webhooks CTWA trazem dados do anúncio
// (externalAdReply, thumbnail) e mídia citada que estouram 100kb -> 413
// PayloadTooLargeError -> handler nem roda -> lead/atribuição/conversão perdidos.
app.use(express.json({ limit: '10mb' }));

// Public routes
app.use('/api/webhooks', webhookRouter);
app.use('/api/auth', authRouter);
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
app.use('/api/reports', reportsRouter);
app.use('/api/triggers', triggersRouter);
app.use('/api/pixel-fires', pixelFiresRouter);
app.use('/api/workspace', workspaceRouter);

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

export default app;
