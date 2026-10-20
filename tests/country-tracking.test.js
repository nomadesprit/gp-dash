import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCampaignRecords } from '../js/adapters/campaigns.js';
import { extractAudience } from '../js/adapters/csv.js';
import { normalizeAudience, attributedCountry } from '../js/campaign-countries.js';
import { summarizeCampaignTracker } from '../functions/lib/server-data.js';
import { buildReviewSnapshot, planReviewDecision, planReviewUndo, PARTICIPANT_COLUMNS, SUBMISSION_COLUMNS } from '../functions/lib/reviews.js';
import { onRequestPost } from '../functions/api/campaigns/prepare.js';
const row=(columns,record)=>columns.map(key=>record[key]??'');

test('combined CSV binds COUNTRY to its USERID even when columns are reordered and duplicate rows exist',()=>{
 const result=extractAudience('COUNTRY,Note,USERID\nBR,"quoted,note",10001\nCL,other,10002\nBR,duplicate,10001',['CL','BR'],normalizeAudience);
 assert.deepEqual(result.audience,[{userId:'10001',country:'BR'},{userId:'10002',country:'CL'},{userId:'10001',country:'BR'}]);
 assert.equal(result.ids.length,2);
 assert.equal(extractAudience('USERID\n10001',['BR'],normalizeAudience).audience[0].country,'BR');
});
test('invalid country imports cannot prepare a mixed audience or silently use only its valid rows',()=>{
 for(const csv of ['USERID\n10001','USERID,COUNTRY\n10001,','USERID,COUNTRY\n10001,MX','USERID,COUNTRY\n10001,BR\n10001,CL','USERID,COUNTRY,GEO\n10001,BR,BR'])assert.throws(()=>extractAudience(csv,['BR','CL'],normalizeAudience));
 assert.equal(attributedCountry('', 'BR,CL'),'UNKNOWN');
 assert.equal(attributedCountry('', 'BR'),'BR');
 assert.equal(attributedCountry('MX', 'BR'),'UNKNOWN');
});
test('country aggregates preserve unknown coverage and reconcile to one overall campaign total without IDs',()=>{
 const result=summarizeCampaignTracker({
  registryRows:[['campaign_id','name','brand','store','country','audience_size'],['latam','LATAM','Example','GooglePlay','BR,CL',4]],
  participantRanges:[[['user_id','status','current_campaign_id'],['secret-a','eligible','latam'],['secret-b','eligible','latam'],['secret-b','eligible','latam']],[['brand','country'],['Example','BR'],['Example','CL'],['Example','BR']],[['updated_at'],['2026-10-20'],['2026-10-20'],['2026-10-01']]],
  submissionRanges:[[['campaign_id'],['latam'],['latam'],['latam']],[['status'],['successful'],['pending_verification'],['rejected']],[['selected_language'],['es'],['pt'],['en']],[['submitted_at','reviewed_at'],['2026-10-20'],['2026-10-20'],['2026-10-20']],[['retention_deleted_at']],[['country'],['BR'],['CL'],['']]],
 });
 assert.equal(result.campaigns.length,1);const campaign=result.campaigns[0];
 assert.deepEqual(campaign.country_breakdown.map(r=>[r.countryCode,r.audience_size,r.evidence_submissions,r.approved,r.pending_review,r.rejected]),[['BR',1,1,1,0,0],['CL',1,1,0,1,0],['UNKNOWN',2,1,0,0,1]]);
 for(const key of ['audience_size','evidence_submissions','pending_review','approved','rejected'])assert.equal(campaign.country_breakdown.reduce((n,r)=>n+r[key],0),campaign[key]);
 assert.equal(JSON.stringify(result).includes('secret-'),false);
});
test('review and undo preserve participant country, brand, immutable submission country and reward audit columns',()=>{
 const snapshot=buildReviewSnapshot({participantRows:[row(PARTICIPANT_COLUMNS,{user_id:'synthetic',status:'pending_verification',current_campaign_id:'latam',token_hash:'hash',brand:'Example',country:'BR'})],submissionRows:[row(SUBMISSION_COLUMNS,{submission_id:'s1',user_id:'synthetic',campaign_id:'latam',token_hash:'hash',status:'pending_verification',country:'CL'})],registryRows:[['latam','LATAM','Example','GooglePlay','BR,CL']]});
 assert.equal(snapshot.items[0].country,'CL');
 const plan=planReviewDecision(snapshot,{reviewId:'s1',decision:'approve',reviewerEmail:'synthetic@example.invalid'});
 assert.equal(plan.participantValues[11],'Example');assert.equal(plan.participantValues[12],'BR');assert.equal(plan.submissionValues[17],'CL');assert.equal(plan.submissionValues[15],'yes');
 assert.match(plan.submissionRange,/:R/);assert.match(plan.participantRange,/:M/);
 const reviewed=buildReviewSnapshot({participantRows:[plan.participantValues],submissionRows:[plan.submissionValues],registryRows:[['latam','LATAM','Example','GooglePlay','BR,CL']]});
 const undo=planReviewUndo(reviewed,{reviewId:'s1',reviewerEmail:'synthetic@example.invalid'});assert.equal(undo.submissionValues[17],'CL');assert.equal(undo.participantValues[12],'BR');
});
test('proxy fails closed against an uploader lacking country tracking before it can create invitations',async()=>{
 const prior=globalThis.fetch;let writes=0;
 globalThis.fetch=async(url,opts)=>{if(opts.method==='POST')writes++;return Response.json({ok:true});};
 try{const response=await onRequestPost({request:new Request('https://gp-dash.pages.dev/api/campaigns/prepare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({campaign:{campaignId:'latam',name:'LATAM',brand:'Example',store:'GooglePlay',country:'BR,CL'},userIds:['synthetic'],audience:[{userId:'synthetic',country:'BR'}]})}),env:{UPLOADER_ADMIN_API_KEY:'synthetic-only'}});assert.equal(response.status,503);assert.equal(writes,0);}finally{globalThis.fetch=prior;}
});


test('immediate preparation results cannot report fewer users than the attributed rows',()=>{
 const {records}=normalizeCampaignRecords([{country:'BR,CL',brand:'Example',store:'GooglePlay',audience_size:0,country_breakdown:[{countryCode:'BR',audience_size:1},{countryCode:'CL',audience_size:1}]}]);
 assert.equal(records[0].audience_size,2);
});
