import bcrypt from 'bcrypt';

async function test() {
  const hash = await bcrypt.hash('admin123', 12);
  console.log('Nowy hash:', hash);
}

test();
