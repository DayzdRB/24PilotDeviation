'use strict';

const FORMULA_PREFIX = /^[=+\-@]/;

function cleanText(value, max = 5000) {
  if (value === undefined || value === null) return '';
  let text = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (text.length > max) text = text.slice(0, max);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return text;
}

function normalizePPDNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 6 ? digits : '';
}

function isSafeCaseId(value) {
  return /^PPD-\d{4}-\d{4}-\d{4}$/.test(String(value || ''));
}

function allowMethod(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    res.status(405).json({ error: 'method_not_allowed' });
    return false;
  }
  return true;
}

module.exports = { cleanText, normalizePPDNumber, isSafeCaseId, allowMethod };
