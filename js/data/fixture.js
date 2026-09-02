// Small, entirely synthetic fixture for local development and degraded-mode UI.
// These values are invented test data and must never be interpreted as source evidence.
export const DEMO_APPFOLLOW_TABS = [
  {
    period: 'July 2026',
    csv: `App,Store,GEO,Start,Week 1,Week 2,Finish
IQ Option,GooglePlay,Viet Nam,4.080,4.090,4.100,4.110
IQ Option,GooglePlay,"Venezuela, Bolivarian Republic of",4.140,4.150,4.160,4.170
IQ Option,GooglePlay,Brazil,4.290,4.300,4.310,4.310`,
  },
  {
    period: 'August 2026',
    csv: `App,Store,GEO,Start,Week 1,Week 2
IQ Option,GooglePlay,Viet Nam,4.110,4.120,4.130
IQ Option,GooglePlay,"Venezuela, Bolivarian Republic of",4.170,4.180,4.190
IQ Option,GooglePlay,Brazil,4.310,4.320,4.330`,
  },
];

export const DEMO_POPUP_RAW_CSV = `brand_name,platform_type,country_name,user_segment,show_users,close_users,accept_users,decline_users,rated_users,stars_1,stars_2,stars_3,stars_4,stars_5,avg_stars
IQ Option,android,Vietnam,core,120,30,66,24,12,1,1,2,3,5,3.83
IQ Option,android,Vietnam,side,40,12,20,8,4,0,1,0,1,2,4.00
IQ Option,android,Venezuela,core,90,20,50,20,9,1,1,1,2,4,3.67
IQ Option,android,Brazil,core,200,50,110,40,20,2,2,3,5,8,3.75
IQ Option,android,Exampleland,demo,10,2,5,3,1,0,0,0,1,0,4.00`;

export const DEMO_POPUP_RATES_CSV = `brand_name,country_name,platform_type,1 star,2 stars,3 stars,4 stars,5 stars
IQ Option,Vietnam Total,android,1,2,2,4,7
,Venezuela Total,android,1,1,1,2,4
,Brazil Total,android,2,2,3,5,8`;

export const DEMO_POPUP_DAILY_CSV = `event_date,brand_name,country_name,platform_type,users_redirected_to_store
2026-07-29,IQ Option,Vietnam,android,8
2026-07-30,IQ Option,Vietnam,android,11
2026-07-31,IQ Option,Vietnam,android,9
2026-07-29,IQ Option,Venezuela,android,5
2026-07-30,IQ Option,Venezuela,android,7
2026-07-31,IQ Option,Venezuela,android,6
2026-07-29,IQ Option,Brazil,android,15
2026-07-30,IQ Option,Brazil,android,18
2026-07-31,IQ Option,Brazil,android,17`;

export const DEMO_POPUP_SUMMARY_ROWS = [
  ['Brand', 'Platform type', 'User Segment', 'Country', 'Saw Popup ', 'Closed Popup', '% Closed', 'Enjoyed App', '% Enjoyed', "Didn't enjoy app", "% Didn't", "Rated among Didn't enjoy app", '% Rated', '1 star', '2 stars', '3 stars', '4 stars', '5 stars'],
  ['IQ Option', 'android Total', '', '', '450', '112', '', '246', '', '92', '', '45', '', '4', '5', '6', '11', '19'],
];

export const DEMO_TICKET_SUMMARY = [
  { brand: 'IQ Option', country: 'Vietnam', segment: 'demo', ticketCount: 8, ratedCount: 6, lowScoreCount: 2, averageStar: 3.5, firstAt: '2026-07-01', lastAt: '2026-07-31', languages: [{ language: 'vi', count: 8 }] },
  { brand: 'IQ Option', country: 'Brazil', segment: 'demo', ticketCount: 12, ratedCount: 10, lowScoreCount: 3, averageStar: 3.7, firstAt: '2026-07-01', lastAt: '2026-07-31', languages: [{ language: 'pt', count: 12 }] },
];

export const DEMO_VOLUME_CSV = `Package,Country,Weekly Downloads,As Of Date,Fetched At
com.iqoption,VN,2500,2026-07-31,2026-08-01
com.iqoption,VE,900,2026-07-31,2026-08-01
com.iqoption,BR,12000,2026-07-31,2026-08-01`;

export const DEMO_CAMPAIGN_TRACKER = {
  connected: false,
  registryConnected: false,
  generatedAt: '2026-08-01T00:00:00.000Z',
  productionCampaigns: [],
  participantRows: 0,
  submissionRows: 0,
  excludedTestParticipants: 0,
  excludedTestSubmissions: 0,
  unassignedParticipants: 0,
  unassignedSubmissions: 0,
  campaignRegistryRows: 0,
  containsPersonalData: false,
  retentionDays: 90,
};

export const DEMO_SNAPSHOT_METADATA = {
  generatedAt: '2026-08-01T00:00:00.000Z',
  rawRows: 5,
  countryRateRows: 3,
  dailyRedirectRows: 9,
  feedbackTicketRowsAggregated: 20,
  containsPersonalData: false,
  synthetic: true,
};
