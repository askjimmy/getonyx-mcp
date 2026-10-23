import { verifyEmailOtp } from '../src/dynamic/auth.js';
import { sendAmbientTransaction, getAmbientConnection } from '../src/dynamic/ambient.js';
import { PublicKey } from '@solana/web3.js';

const EMAIL = 'tymchenkoser@gmail.com';
const VERIFICATION_UUID = process.argv[2];
const CODE = process.argv[3];

if (!VERIFICATION_UUID || !CODE) {
  throw new Error('usage: tsx .scratch/complete-swap.mts <verificationUUID> <code>');
}

const UNSIGNED_TX_BASE64 =
  'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAUNGYQHwHLr6jTMql8x2d5l2Cv+pnJoXTKAHoQUQvYBI3Au9BJDSNfvrA1iyrdRmIkhMNCjz9Ez5/cQec5MjRJalzGE4d6xQ0+1r50O7KbtHUxMbMlmXC34y9a8AXA/6q6RO7VBfj3Em8WohNCPJO8g+3RHk0CizL9AscjHbwRhfbhaD2547X/2qcneUb+NypO6GR/uyKnPfzxlrbkKRv4AArpR3PB5K2o5Ab62zK3Z9rbiixOft0mT7loOc9h2mgxo+/dd52z4u69qp41Bsv3Uj4aVblp7tVcpD7q85GIaHG/+4YXgvEPh2mtuz5Z5yee8z/oYUy4DItQa0XYlCjsDIQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgw38n95f5riqfASkdukeisa7JkqtkPoZyd9J2Fw+W158vvsEfFYnYMB6/Zkv7p7sigyqQQMQrAZoRfWGt4x+VfRWs3di5MnRaCS9Kr/8APNPECdpA29VMpmlzdv0qfFEBt324e51j94YQl285GzN2rYa/E2DuQ0n/r35KNihi/yo7c6MR0DPV+9TgNb/Rp9oIvBRAxTS1/xqGD8Fz1kAxAEKDQADCAQGBwUMCQwLAQITBEBCDwAAAAAAEM0OAAAAAAAAAQ==';

console.log('verifying OTP…');
const { session } = await verifyEmailOtp({
  email: EMAIL,
  verificationUUID: VERIFICATION_UUID,
  code: CODE,
});
console.log('signed in as', session.walletMetadata.accountAddress);
console.log('walletMetadata keys:', Object.keys(session.walletMetadata));
console.log('has backupInfo:', !!session.walletMetadata.externalServerKeySharesBackupInfo);

console.log('signing + broadcasting swap…');
const result = await sendAmbientTransaction(UNSIGNED_TX_BASE64);
console.log('txid:', result.txid);
console.log('signature:', result.signature);

const connection = getAmbientConnection();
const lamports = await connection.getBalance(new PublicKey(session.walletMetadata.accountAddress));
console.log('AMB balance:', lamports / 1e9);
