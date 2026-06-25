const Iyzipay = require('iyzipay');

const iyzipay = new Iyzipay({
  apiKey: process.env.NEXT_PUBLIC_IYZICO_API_KEY,
  secretKey: process.env.NEXT_PUBLIC_IYZICO_SECRET_KEY,
  uri: 'https://sandbox-api.iyzipay.com'
});

export default iyzipay;
