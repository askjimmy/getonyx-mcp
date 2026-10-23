import { DynamicSvmWalletClient } from '@dynamic-labs-wallet/node-svm';
import { getExternalServerKeyShareBackupInfo } from '@dynamic-labs-wallet/node';
import { ThresholdSignatureScheme } from '@dynamic-labs-wallet/node';
import fs from 'node:fs';

const ENV = 'a9e7161d-c693-44be-8183-2c104ec7264e';
const session = JSON.parse(fs.readFileSync('/home/danylo/.config/wallet-mcp-server/dynamic-session.json', 'utf8'));
const jwt = session.jwt || session.session.jwt;

const users = await (await fetch(`https://app.dynamicauth.com/api/v0/sdk/${ENV}/users`, { headers: { Authorization: `Bearer ${jwt}` } })).json();
const vc = (users.verifiedCredentials || []).find((v: any) => v.walletName === 'dynamicwaas');
const wp = vc.walletProperties;
const walletMetadata = {
  walletId: vc.id,
  accountAddress: vc.address,
  chainName: 'SVM',
  thresholdSignatureScheme: wp.thresholdSignatureScheme,
  derivationPath: wp.derivationPath,
  shareSetId: wp.shareSetId,
  shareSetType: wp.shareSetType,
  externalServerKeySharesBackupInfo: getExternalServerKeyShareBackupInfo({ walletProperties: wp }),
};

const client = new DynamicSvmWalletClient({ environmentId: ENV });
await client.authenticateJwt(jwt, {});
// route browser-prefix
const api: any = (client as any).apiClient;
api.sdkRoutePrefix = '/api/v0/sdk';
api.waasRoutePrefix = `/api/v0/sdk/${ENV}/waas`;

const unsignedTxBase64 = 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAUNGYQHwHLr6jTMql8x2d5l2Cv+pnJoXTKAHoQUQvYBI3Au9BJDSNfvrA1iyrdRmIkhMNCjz9Ez5/cQec5MjRJalzGE4d6xQ0+1r50O7KbtHUxMbMlmXC34y9a8AXA/6q6RO7VBfj3Em8WohNCPJO8g+3RHk0CizL9AscjHbwRhfbhaD2547X/2qcneUb+NypO6GR/uyKnPfzxlrbkKRv4AArpR3PB5K2o5Ab62zK3Z9rbiixOft0mT7loOc9h2mgxo+/dd52z4u69qp41Bsv3Uj4aVblp7tVcpD7q85GIaHG/+4YXgvEPh2mtuz5Z5yee8z/oYUy4DItQa0XYlCjsDIQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgw38n95f5riqfASkdukeisa7JkqtkPoZyd9J2Fw+W158vvsEfFYnYMB6/Zkv7p7sigyqQQMQrAZoRfWGt4x+VfRWs3di5MnRaCS9Kr/8APNPECdpA29VMpmlzdv0qfFEBt324e51j94YQl285GzN2rYa/E2DuQ0n/r35KNihi/yo7c6MR0DPV+9TgNb/Rp9oIvBRAxTS1/xqGD8Fz1kAxAEKDQADCAQGBwUMCQwLAQITBEBCDwAAAAAAEM0OAAAAAAAAAQ==';

const { Transaction } = await import('@solana/web3.js');
const tx = Transaction.from(Buffer.from(unsignedTxBase64, 'base64'));

try {
  const res = await client.signTransaction({ walletMetadata: walletMetadata as any, transaction: tx, chainId: 'mainnet-beta' } as any);
  console.log('SIGN OK', res);
} catch (e: any) {
  console.log('SIGN FAILED:', e?.message);
  console.log(e?.cause?.message || '');
}
