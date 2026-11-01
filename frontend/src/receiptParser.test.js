import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText, parseReceiptAmount, parseReceiptDate, parseReceiptMerchant } from './receiptParser.js';

describe('receiptParser: amount extraction', () => {
  it('extracts amount from Grand Total line', () => {
    const lines = [
      'STARBUCKS COFFEE',
      'Order: 492',
      '1 Caffe Latte    280.00',
      '1 Blueberry Muffin 220.00',
      'Sub Total:       500.00',
      'CGST 2.5%:        12.50',
      'SGST 2.5%:        12.50',
      'GRAND TOTAL:     525.00',
      'Thank you for visiting!',
    ];
    assert.equal(parseReceiptAmount(lines), 525.00);
  });

  it('extracts amount with currency symbol and commas', () => {
    const lines = [
      'RELIANCE RETAIL LIMITED',
      'Items: 4',
      'TOTAL AMOUNT: ₹1,450.50',
      'Paid by UPI',
    ];
    assert.equal(parseReceiptAmount(lines), 1450.50);
  });

  it('extracts Net Payable from pharmacy receipt', () => {
    const lines = [
      'APOLLO PHARMACY',
      'Paracetamol 650mg  45.00',
      'Cough Syrup       110.00',
      'NET PAYABLE: 155.00',
    ];
    assert.equal(parseReceiptAmount(lines), 155.00);
  });

  it('falls back to maximum price if no total keyword present', () => {
    const lines = [
      'LOCAL BAKERY',
      'Cake 450.00',
      'Biscuits 60.00',
    ];
    assert.equal(parseReceiptAmount(lines), 450.00);
  });
});

describe('receiptParser: date extraction', () => {
  it('parses DD/MM/YYYY date', () => {
    const lines = ['DMART HYPERMARKET', 'Date: 25/10/2026 14:30', 'Total: 890'];
    assert.equal(parseReceiptDate(lines), '2026-10-25');
  });

  it('parses DD-MM-YYYY date', () => {
    const lines = ['INDIAN OIL PETROL PUMP', 'TXN DATE: 28-10-2026', 'AMT: 500'];
    assert.equal(parseReceiptDate(lines), '2026-10-28');
  });

  it('parses DD Month YYYY date', () => {
    const lines = ['BLUE TOKAI ROASTERS', '26 Oct 2026', 'Total: ₹340.00'];
    assert.equal(parseReceiptDate(lines), '2026-10-26');
  });

  it('parses ISO YYYY-MM-DD date', () => {
    const lines = ['BILL RECEIPT', '2026-10-30', 'Total: 99.00'];
    assert.equal(parseReceiptDate(lines), '2026-10-30');
  });

  it('ignores future dates', () => {
    const lines = ['STORE RECEIPT', 'Date: 15/12/2099', 'Total: 100'];
    assert.equal(parseReceiptDate(lines), null);
  });
});

describe('receiptParser: merchant extraction', () => {
  it('identifies shop name and skips tax headers', () => {
    const lines = [
      'TAX INVOICE',
      'ORIGINAL FOR RECIPIENT',
      'GSTIN: 27AAAAA0000A1Z5',
      'STARBUCKS COFFEE',
      'Bandra West, Mumbai',
      'Date: 24/10/2026',
    ];
    assert.equal(parseReceiptMerchant(lines), 'STARBUCKS COFFEE');
  });

  it('skips welcome and thank you notes at top', () => {
    const lines = [
      'WELCOME TO',
      'APOLLO PHARMACY',
      'PH: 022-26401234',
      'Date: 25/10/2026',
    ];
    assert.equal(parseReceiptMerchant(lines), 'APOLLO PHARMACY');
  });
});

describe('receiptParser: full receipt integration', () => {
  const userCategories = [
    { id: 1, name: 'Food' },
    { id: 2, name: 'Transport' },
    { id: 3, name: 'Healthcare' },
    { id: 4, name: 'Shopping' },
  ];

  it('parses complete supermarket receipt', () => {
    const text = `
      TAX INVOICE
      DMART READY
      Andheri East, Mumbai
      GSTIN: 27AABBD1234F1Z8
      Date: 27/10/2026
      Time: 18:42
      --------------------------------
      1 Aashirvaad Atta 5kg    240.00
      1 Fortune Sunlite Oil 1L 145.00
      1 Tata Salt 1kg           28.00
      --------------------------------
      SUB TOTAL: 413.00
      DISCOUNT:   13.00
      GRAND TOTAL: ₹400.00
      PAID BY: UPI
      Thank you for shopping with us!
    `;
    const res = parseReceiptText(text, userCategories);
    assert.equal(res.merchant, 'DMART READY');
    assert.equal(res.amount, 400.00);
    assert.equal(res.date, '2026-10-27');
    assert.equal(res.categoryName, 'Food');
    assert.equal(res.fieldsDetected.amount, true);
    assert.equal(res.fieldsDetected.date, true);
    assert.equal(res.fieldsDetected.merchant, true);
  });

  it('parses complete cafe / restaurant receipt', () => {
    const text = `
      CAFE COFFEE DAY
      Connaught Place, New Delhi
      Ph: 011-23344556
      Date: 29-10-2026
      Bill No: 88412
      Cappuccino        180.00
      Chocolate Cookie   90.00
      TOTAL: 270.00
      CGST 2.5%           6.75
      SGST 2.5%           6.75
      NET PAYABLE: 283.50
    `;
    const res = parseReceiptText(text, userCategories);
    assert.equal(res.merchant, 'CAFE COFFEE DAY');
    assert.equal(res.amount, 283.50);
    assert.equal(res.date, '2026-10-29');
    assert.equal(res.categoryName, 'Food');
  });

  it('parses pharmacy receipt with healthcare category', () => {
    const text = `
      RETAIL BILL
      MEDPLUS PHARMACY
      Indiranagar, Bangalore
      Date: 28 Oct 2026
      Prescription Rx: 4410
      Azithromycin 500mg   120.00
      Vitamin C Chewable    60.00
      TOTAL AMOUNT: 180.00
      CASH RECEIVED: 200.00
      CHANGE: 20.00
    `;
    const res = parseReceiptText(text, userCategories);
    assert.equal(res.merchant, 'MEDPLUS PHARMACY');
    assert.equal(res.amount, 180.00);
    assert.equal(res.date, '2026-10-28');
    assert.equal(res.categoryName, 'Healthcare');
  });

  it('handles empty or blank text gracefully', () => {
    const res = parseReceiptText('', userCategories);
    assert.equal(res.amount, null);
    assert.equal(res.date, null);
    assert.equal(res.merchant, null);
    assert.equal(res.categoryName, null);
    assert.equal(res.fieldsDetected.amount, false);
  });
});
