import { Connection, Transaction, PublicKey } from '@solana/web3.js';

const UNSIGNED_TX_BASE64 =
  'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAUNGYQHwHLr6jTMql8x2d5l2Cv+pnJoXTKAHoQUQvYBI3Au9BJDSNfvrA1iyrdRmIkhMNCjz9Ez5/cQec5MjRJalzGE4d6xQ0+1r50O7KbtHUxMbMlmXC34y9a8AXA/6q6RO7VBfj3Em8WohNCPJO8g+3RHk0CizL9AscjHbwRhfbhaD2547X/2qcneUb+NypO6GR/uyKnPfzxlrbkKRv4AArpR3PB5K2o5Ab62zK3Z9rbiixOft0mT7loOc9h2mgxo+/dd52z4u69qp41Bsv3Uj4aVblp7tVcpD7q85GIaHG/+4YXgvEPh2mtuz5Z5yee8z/oYUy4DItQa0XYlCjsDIQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgw38n95f5riqfASkdukeisa7JkqtkPoZyd9J2Fw+W158vvsEfFYnYMB6/Zkv7p7sigyqQQMQrAZoRfWGt4x+VfRWs3di5MnRaCS9Kr/8APNPECdpA29VMpmlzdv0qfFEBt324e51j94YQl285GzN2rYa/E2DuQ0n/r35KNihi/yo7c6MR0DPV+9TgNb/Rp9oIvBRAxTS1/xqGD8Fz1kAxAEKDQADCAQGBwUMCQwLAQITBEBCDwAAAAAAEM0OAAAAAAAAAQ==';

const tx = Transaction.from(Buffer.from(UNSIGNED_TX_BASE64, 'base64'));
console.log('feePayer:', tx.feePayer?.toBase58());
console.log('recentBlockhash:', new PublicKey(tx.recentBlockhash).toBase58());
console.log('signatures:', tx.signatures.map((s) => ({ pub: s.publicKey.toBase58(), sig: s.signature ? 'present' : 'none' })));
console.log('instructions:', tx.instructions.length);
for (const ix of tx.instructions) {
  console.log('  program:', ix.programId.toBase58(), 'keys:', ix.keys.length);
}

const connection = new Connection('https://rpc.ambient.xyz', 'confirmed');
const bh = await connection.getLatestBlockhash();
console.log('latest blockhash:', bh.blockhash.toBase58(), 'fee', bh.fee);
