import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import boxesRouter from './routes/boxes';
import csvRoutes from './routes/csv';
import newsRoutes from './routes/news';
import pbpRoutes from './routes/pbp';
import saveRoutes from './routes/save';
import tacticsRoutes from './routes/tactics';
import teamsRoutes from './routes/teams';
import usersRoutes from './routes/users';

import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import rateLimit from 'express-rate-limit';
import serveIndex from 'serve-index';

const app = express();

// Zaufaj pierwszemu proxy (nginx), req.ip zwraca prawdziwy adres klienta z x-forwarded-for
app.set('trust proxy', 1);
const boxesDir = process.env.BOXES_DIR || path.join(__dirname, '../uploads/boxes');
const csvDir = process.env.CSV_DIR || path.join(__dirname, '../uploads/csv');
const pbpDir = process.env.PBP_DIR || path.join(__dirname, '../uploads/pbp');
const saveDir = process.env.SAVE_DIR || path.join(__dirname, '../uploads/save');
const imgDir = process.env.IMG_DIR || path.join(__dirname, '../uploads/img');

app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? ['http://app.simbasket.pl', 'https://app.simbasket.pl']
        : 'http://localhost:4200',
    credentials: true,
  }),
);

app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/boxes', boxesRouter);
app.use('/csv', csvRoutes);
app.use('/news', newsRoutes);
app.use('/pbp', pbpRoutes);
app.use('/save', saveRoutes);
app.use('/tactics', tacticsRoutes);
app.use('/teams', teamsRoutes);
app.use('/users', usersRoutes);

// Static files
app.use('/uploads', (req, res, next) => {
  const filePath = path.join(__dirname, '../uploads', req.path);
  if (filePath.endsWith('.htm') || filePath.endsWith('.html')) {
    fs.readFile(filePath, (err, data) => {
      if (err) return next();
      const content = iconv.decode(data, 'win1250');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(content);
    });
  } else {
    next();
  }
});

// Max 15 requestów/sekundę z jednego IP dla plików statycznych
const staticRateLimit = rateLimit({
  windowMs: 1000,
  limit: 15,
  message: { message: 'Zbyt wiele żądań, spróbuj za chwilę' },
});

app.use('/html/boxes', express.static(boxesDir));

app.use('/csv', staticRateLimit, express.static(csvDir));
app.use('/csv', staticRateLimit, serveIndex(csvDir, { icons: true, view: 'details' }));

app.use(
  '/pbp',
  staticRateLimit,
  (req, res, next) => {
    if (req.path.endsWith('.txt')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
    next();
  },
  express.static(pbpDir),
);

app.use('/save', staticRateLimit, express.static(saveDir));
app.use('/save', staticRateLimit, serveIndex(saveDir, { icons: true, view: 'details' }));

app.use('/img', staticRateLimit, express.static(imgDir));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'SimBasket API works!' });
});

if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../public');
  app.use(express.static(frontendPath));

  app.get('*splat', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Globalny error handler - musi być ostatni, Express rozpoznaje go po 4 argumentach
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Wewnętrzny błąd serwera' });
});

export default app;
