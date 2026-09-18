const test = require('node:test');
const assert = require('node:assert/strict');
const {
  handleIncomingMessage,
  getMainMenu,
  getHelpGuide,
  getClinicalNotice,
  formatEmergencyHospitals,
  formatPublicOxygen,
} = require('../services/botEngine');

test('Scenario 1 & Default: Main menu displays clinical safety warning and emergency options', async () => {
  const reply = await handleIncomingMessage({ fromPhone: '+2348011112222', text: 'MENU' });
  assert.match(reply, /EMERGENCY MEDICAL ASSISTANCE/i);
  assert.match(reply, /FIND EMERGENCY HOSPITAL/i);
  assert.match(reply, /DOCTOR-AUTHORIZED BLOOD SEARCH/i);
  assert.match(reply, /DONATE BLOOD/i);
  assert.match(reply, /prescription-only clinical procedure/i);
});

test('Scenario 9: Random queries like "I need blood" trigger Clinical Notice', async () => {
  const reply = await handleIncomingMessage({ fromPhone: '+2348011113333', text: 'I need blood' });
  assert.match(reply, /CLINICAL NOTICE/i);
  assert.match(reply, /controlled human biological tissue/i);
  assert.match(reply, /Reply \*DOCTOR\* to verify/i);
  assert.match(reply, /Doctor-Authorized Blood Search/i);
});

test('Scenario 3: Doctor flow requires PIN verification before granting stock access', async () => {
  const phone = '+2348099990001';
  // Step 1: Request doctor flow
  const prompt = await handleIncomingMessage({ fromPhone: phone, text: 'DOCTOR' });
  assert.match(prompt, /DOCTOR VERIFICATION/i);
  assert.match(prompt, /Doctor Access PIN/i);

  // Step 2: Enter invalid PIN
  const failed = await handleIncomingMessage({ fromPhone: phone, text: 'WRONG-PIN' });
  assert.match(failed, /VERIFICATION FAILED/i);

  // Step 3: Enter valid PIN DOC-2026
  await handleIncomingMessage({ fromPhone: phone, text: 'DOCTOR' });
  const verified = await handleIncomingMessage({ fromPhone: phone, text: 'DOC-2026' });
  assert.match(verified, /VERIFIED/i);
  assert.match(verified, /QUERY BLOOD STOCK/i);
  assert.match(verified, /INITIATE REQUISITION/i);
});

test('Scenario 4: Option 2 prompts for 5 clinical verification details', async () => {
  const phone = '+2348099990002';
  const reply = await handleIncomingMessage({ fromPhone: phone, text: '2' });
  assert.match(reply, /DOCTOR-AUTHORIZED BLOOD SEARCH/i);
  assert.match(reply, /hospital where patient is admitted/i);
  assert.match(reply, /attending doctor/i);
  assert.match(reply, /blood type needed/i);
});

test('Scenario 5: formatPublicOxygen shows public oxygen without exposing raw cylinder counts', () => {
  const mockOxygenData = [
    { name: 'Lagos University Teaching Hospital (LUTH)', contactPhone: '08012345000', coordinates: [3.3792, 6.5244] },
    { name: 'Babcock University Teaching Hospital', contactPhone: '08068272626' }
  ];
  const reply = formatPublicOxygen(mockOxygenData);
  assert.match(reply, /EMERGENCY OXYGEN AVAILABILITY/i);
  assert.match(reply, /prescription-only clinical procedure/i);
  assert.match(reply, /reply \*DOCTOR\* to query oxygen stock levels/i);
  // Ensure raw cylinder counts like "12 cylinders" or "full" are NOT shown to public
  assert.doesNotMatch(reply, /\d+ cylinders/i);
});

test('Scenario 6: Option 5 prompts for 11-digit NIN and preferred donation day', async () => {
  const phone = '+2348099990004';
  const reply = await handleIncomingMessage({ fromPhone: phone, text: '5' });
  assert.match(reply, /DONOR REGISTRATION/i);
  assert.match(reply, /NIN \(11 digits\)/i);
  assert.match(reply, /Preferred donation day/i);
});

test('Scenario 0: Help & Clinical Safety Notice emphasizes anti-self-medication', async () => {
  const phone = '+2348099990005';
  const reply = await handleIncomingMessage({ fromPhone: phone, text: '0' });
  assert.match(reply, /ANTI-SELF-MEDICATION ADVISORY/i);
  assert.match(reply, /controlled, prescription-only biological therapies/i);
  assert.match(reply, /NBSC & MDCN regulations/i);
});

test('Scenario 9b: Raw blood group query from public user triggers Clinical Notice & Section 53 warning', async () => {
  const phone = '+2348099990006';
  const replyO = await handleIncomingMessage({ fromPhone: phone, text: 'O-' });
  assert.match(replyO, /CLINICAL NOTICE/i);
  assert.match(replyO, /National Health Act 2014, Sec 53/i);
  assert.match(replyO, /Reply \*DOCTOR\* to verify/i);

  const replyNeed = await handleIncomingMessage({ fromPhone: phone, text: 'I need O+ blood' });
  assert.match(replyNeed, /CLINICAL NOTICE/i);
  assert.match(replyNeed, /controlled human biological tissue/i);
});

test('Scenario 1: formatEmergencyHospitals displays emergency directions and NO blood inventory', () => {
  const mockHospitals = [
    { name: 'OSUTH', contactPhone: '08012345678', distance: '4.2', coordinates: [4.5418, 7.7827] },
    { name: 'LUTH', contactPhone: '08012345000', distance: '12.5', coordinates: [3.3792, 6.5244] },
  ];
  const reply = formatEmergencyHospitals(mockHospitals, 7.78, 4.54);
  assert.match(reply, /NEAREST EMERGENCY HOSPITALS/i);
  assert.match(reply, /Emergency: 08012345678/i);
  assert.match(reply, /Directions: https:\/\/www.google.com\/maps/i);
  assert.match(reply, /Do NOT search for blood yourself/i);
  assert.doesNotMatch(reply, /\d+ unit\(s\)/i);
});

