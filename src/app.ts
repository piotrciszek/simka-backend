import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import boxesRouter from './routes/boxes';
import csvRoutes from './routes/csv';
import newsRoutes from './routes/news';
import tacticsRoutes from './routes/tactics';
import teamsRoutes from './routes/teams';
import usersRoutes from './routes/users';

import fs from 'fs';
import path from 'path';
import * as iconv from 'iconv-lite';

dotenv.config();

const app = express();

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

// Routes
app.use('/auth', authRoutes);
app.use('/boxes', boxesRouter);
app.use('/csv', csvRoutes);
app.use('/news', newsRoutes);
app.use('/tactics', tacticsRoutes);
app.use('/teams', teamsRoutes);
app.use('/users', usersRoutes);

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

export default app;
