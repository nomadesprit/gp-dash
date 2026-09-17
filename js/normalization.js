const COUNTRY_CODES = new Map(Object.entries({
  'Algeria':'DZ','Angola':'AO','Argentina':'AR','Austria':'AT','Azerbaijan':'AZ',
  'Australia':'AU','Mauritania':'MR',
  'Bahrain':'BH','Bangladesh':'BD','Bolivia':'BO','Brazil':'BR','Chile':'CL',
  'Colombia':'CO','Costa Rica':'CR','Dominican Republic':'DO','Ecuador':'EC',
  'Egypt':'EG','El Salvador':'SV','Georgia':'GE','Guatemala':'GT','Honduras':'HN',
  'India':'IN','Indonesia':'ID','Jamaica':'JM','Kazakhstan':'KZ','Kenya':'KE',
  'Malaysia':'MY','Mexico':'MX','Morocco':'MA','Nicaragua':'NI','Nigeria':'NG',
  'Oman':'OM','Pakistan':'PK','Panama':'PA','Paraguay':'PY','Peru':'PE',
  'Philippines':'PH','Saudi Arabia':'SA','Singapore':'SG','South Africa':'ZA',
  'Thailand':'TH','Turkey':'TR','United Arab Emirates':'AE','Uruguay':'UY',
  'Venezuela':'VE','Vietnam':'VN','Yemen':'YE','Viet Nam':'VN',
  'Venezuela, Bolivarian Republic of':'VE','Bolivia, Plurinational State of':'BO',
  'Türkiye':'TR','Korea, Republic of':'KR','South Korea':'KR','Ivory Coast':'CI',
  "Côte d'Ivoire":'CI','Lao People’s Democratic Republic':'LA','Laos':'LA',
  'Tanzania, United Republic of':'TZ','Tanzania':'TZ','Russian Federation':'RU',
  'Russia':'RU','Taiwan, Province of China':'TW','Taiwan':'TW','Hong Kong':'HK',
  'Qatar':'QA','Kuwait':'KW','Lebanon':'LB','Sri Lanka':'LK','Cambodia':'KH',
  'Mozambique':'MZ','Mauritius':'MU','Somalia':'SO','Zimbabwe':'ZW','Serbia':'RS',
  'France':'FR','Germany':'DE','Italy':'IT','Portugal':'PT','Spain':'ES',
  'Romania':'RO','Poland':'PL','Ukraine':'UA','Ghana':'GH','Cameroon':'CM',
  'Botswana':'BW','Burkina Faso':'BF','Namibia':'NA','Nepal':'NP','Uganda':'UG',
  'Fiji':'FJ','Belize':'BZ','Bahamas':'BS','Andorra':'AD','Iceland':'IS',
  'Netherlands':'NL','New Zealand':'NZ','Switzerland':'CH','Barbados':'BB',
  'Armenia':'AM','Belarus':'BY','Belgium':'BE','Bulgaria':'BG','Cyprus':'CY',
  'Denmark':'DK','Czechia':'CZ','Czech Republic':'CZ','Slovakia':'SK',
  'Albania':'AL','Antigua and Barbuda':'AG','Benin':'BJ','Brunei Darussalam':'BN',
  'Central Africa':'CF','Central African Republic':'CF','Congo':'CG',
  'Cook Islands':'CK','Dominica':'DM','Guinea':'GN','Guyana':'GY','Ireland':'IE',
  'Japan':'JP','Jersey':'JE','Jordan':'JO','Kyrgyzstan':'KG','Latvia':'LV',
  'Liberia':'LR','Macau':'MO','Macao':'MO','Macedonia':'MK','North Macedonia':'MK',
  'Madagascar':'MG','Maldives':'MV','Moldova':'MD','Mongolia':'MN',
  'Netherlands Antilles':'AN','Niger':'NE','Norway':'NO','Papua New Guinea':'PG',
  'Rwanda':'RW','ST Helena':'SH','Saint Helena':'SH','Sao Tome and Principe':'ST',
  'São Tomé and Príncipe':'ST','Senegal':'SN','Seychelles':'SC',
  'Swaziland':'SZ','Eswatini':'SZ','Sweden':'SE','Togo':'TG',
  'Trinidad and Tobago':'TT','Tunisia':'TN','Uzbekistan':'UZ','Zambia':'ZM',
  'Anguilla':'AI','Chad':'TD','Croatia':'HR','Democratic Republic of the Congo':'CD',
  'Iraq':'IQ','Lesotho':'LS','Malawi':'MW','Saint Kitts and Nevis':'KN',
  'Turks and Caicos Islands':'TC','Ethiopia':'ET',
}));

const DISPLAY = new Intl.DisplayNames(['en'], { type: 'region' });

export function normalizeCountry(value, unmapped = null) {
  const raw = String(value ?? '').trim();
  if (raw.toUpperCase() === 'TEST') return 'TEST';
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const code = COUNTRY_CODES.get(raw);
  if (!code && raw && unmapped) unmapped.add(raw);
  return code || null;
}

export function countryName(code) {
  if (!code) return 'Unmapped country';
  if (code === 'TEST') return 'Test cohort';
  try { return DISPLAY.of(code) || code; } catch { return code; }
}

export function normalizeStore(value) {
  const key = String(value ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (['googleplay', 'android', 'playstore'].includes(key)) return 'GooglePlay';
  if (['appstore', 'ios', 'appleappstore'].includes(key)) return 'AppStore';
  return value ? String(value).trim() : null;
}

export function platformForStore(store) {
  return normalizeStore(store) === 'GooglePlay' ? 'android' : 'ios';
}
