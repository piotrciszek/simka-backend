import bcrypt from 'bcrypt';

async function reset() {
  const hash = await bcrypt.hash('nowehaslo123', 12);
  console.log(hash);
}

reset();