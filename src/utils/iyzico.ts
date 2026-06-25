import crypto from 'crypto';

const API_KEY = process.env.NEXT_PUBLIC_IYZICO_API_KEY || '';
const SECRET_KEY = process.env.NEXT_PUBLIC_IYZICO_SECRET_KEY || '';
const BASE_URL = 'https://sandbox-api.iyzipay.com';

function generateHttpHeaders(uri: string, body: any) {
  const randomString = process.hrtime()[0] + Math.random().toString(8).slice(2);
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(randomString + uri + JSON.stringify(body))
    .digest('hex');

  const authorizationParams = [
    'apiKey:' + API_KEY,
    'randomKey:' + randomString,
    'signature:' + signature
  ];
  
  const base64Auth = Buffer.from(authorizationParams.join('&')).toString('base64');
  
  return {
    'Authorization': 'IYZWSv2 ' + base64Auth,
    'x-iyzi-rnd': randomString,
    'x-iyzi-client-version': 'iyzipay-node-2.0.69',
    'Content-Type': 'application/json'
  };
}

export async function createCheckoutForm(requestData: any) {
  const uri = '/payment/iyzipos/checkoutform/initialize/auth/ecom';
  console.log(`[IYZICO] İSTEK ATILAN BASE URL (Zorunlu Sandbox):`, BASE_URL);
  
  const response = await fetch(BASE_URL + uri, {
    method: 'POST',
    headers: generateHttpHeaders(uri, requestData),
    body: JSON.stringify(requestData)
  });
  return response.json();
}

export async function retrieveCheckoutForm(requestData: { locale?: string, token: string }) {
  const uri = '/payment/iyzipos/checkoutform/auth/ecom/detail';
  console.log(`[IYZICO] RETRIEVE ATILAN BASE URL (Zorunlu Sandbox):`, BASE_URL);
  
  const response = await fetch(BASE_URL + uri, {
    method: 'POST',
    headers: generateHttpHeaders(uri, requestData),
    body: JSON.stringify(requestData)
  });
  return response.json();
}
