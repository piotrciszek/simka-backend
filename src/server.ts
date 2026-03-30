import app from './app';
import pool from './config/db';

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to the database successfully!');
    connection.release();

    app.listen(PORT, () => {
      console.log(`Server is working on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(' Error connecting to the database:', error);
    process.exit(1);
  }
}

start();
