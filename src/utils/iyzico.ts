import fs from 'fs';

// Monkey-patch fs.readdirSync to bypass Vercel Next.js / iyzipay scandir issues
const originalReaddirSync = fs.readdirSync;
(fs as any).readdirSync = function (path: string | Buffer | URL, options?: any) {
  const pathStr = String(path).replace(/\\/g, '/');
  if (pathStr.includes('iyzipay') && pathStr.includes('resources')) {
    return [
      "ApiTest.js", "Apm.js", "Approval.js", "BasicBkm.js", "BasicBkmInitialize.js", "BasicPayment.js",
      "BasicPaymentPostAuth.js", "BasicPaymentPreAuth.js", "BasicThreedsInitialize.js", "BasicThreedsInitializePreAuth.js",
      "BasicThreedsPayment.js", "BinNumber.js", "Bkm.js", "BkmInitialize.js", "BouncedBankTransferList.js", "Cancel.js",
      "Card.js", "CardList.js", "CheckoutForm.js", "CheckoutFormInitialize.js", "CheckoutFormInitializePreAuth.js",
      "CrossBookingFromSubMerchant.js", "CrossBookingToSubMerchant.js", "Disapproval.js", "InstallmentHtml.js",
      "InstallmentInfo.js", "IyziLink.js", "PayWithIyzico.js", "Payment.js", "PaymentItem.js", "PaymentPostAuth.js",
      "PaymentPreAuth.js", "PayoutCompletedTransactionList.js", "PeccoInitialize.js", "PeccoPayment.js", "Refund.js",
      "RefundChargedFromMerchant.js", "RefundToBalance.js", "RefundV2.js", "ReportingBouncedPayments.js",
      "ReportingPayoutCompleted.js", "ReportingScrollTransactions.js", "ReportingTransactionDetails.js",
      "ReportingTransactions.js", "SettlementToBalance.js", "SubMerchant.js", "Subscription.js", "SubscriptionCard.js",
      "SubscriptionCheckoutForm.js", "SubscriptionCustomer.js", "SubscriptionExistingCustomer.js", "SubscriptionPayment.js",
      "SubscriptionPricingPlan.js", "SubscriptionProduct.js", "ThreedsInitialize.js", "ThreedsInitializePreAuth.js",
      "ThreedsPayment.js", "ThreedsV2Payment.js", "UniversalCardStorageInitialize.js"
    ] as any;
  }
  return originalReaddirSync.call(fs, path, options);
};

const Iyzipay = require('iyzipay');

const iyzipay = new Iyzipay({
  apiKey: process.env.NEXT_PUBLIC_IYZICO_API_KEY,
  secretKey: process.env.NEXT_PUBLIC_IYZICO_SECRET_KEY,
  uri: 'https://sandbox-api.iyzipay.com'
});

export default iyzipay;
