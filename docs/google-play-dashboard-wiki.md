# Google Play Ratings & Campaign Console

Updated: 20 October 2026

## Purpose and access

The console helps ORM and Growth Operations prioritize country/store ratings, inspect popup and feedback signals, plan campaigns across several countries, and review screenshot evidence.

Open [Google Play Ratings & Campaign Console](https://gp-dash.pages.dev/). Sign in through the normal company access flow. Use **Home** to return to the ORM dashboard home.

This guide is self-contained Markdown for Confluence. Copy its contents into your page; it does not require image attachments. Control names in bold match the dashboard.

## Quick workflow

1. Confirm the top bar says **Live private Sheets · server refreshed**. Synthetic demo figures are invented and must not be used for decisions.
2. Read the source freshness banner and note the rating observation, popup coverage and download cutoff dates.
3. Select the brand, store, AppFollow period, target and minimum weekly downloads.
4. Review low-rated countries in the attention queue, then select a row to inspect its history and supporting signals.
5. Choose **Plan a multi-country campaign** in the forecast section, or **Launch campaign** in Campaigns.
6. Select the countries that belong to one campaign. Review their individual rating requirements and combined email plan.
7. Upload one audience CSV containing a `USERID` and a `COUNTRY` for each participant. Check the country counts before preparing.
8. Choose **Check eligibility & prepare**, save the mailing and exclusions files, and send through your normal mailing process.
9. Monitor the campaign and its country breakdown. Review screenshots in **Screenshot review & reward eligibility**.

Preparing a campaign creates secure links and registers eligible participants. It does not send emails or grant rewards.

## Navigation and filters

The navigation links jump to **Overview**, **Countries**, **Forecast**, **Campaigns**, **Review** and **Data quality**.

| Control | Use |
| --- | --- |
| **Brand** | Choose the app brand. Available stores and countries update with it. |
| **Store / platform** | Choose Google Play/Android or another supported store. |
| **Country** | Limit the country analysis to one country, or choose **All countries**. This is separate from selecting countries for a new campaign. |
| **AppFollow period** | Choose the reporting month. Each country uses its latest available non-empty observation up to that period. |
| **Target threshold** | Set the rating target used in the attention queue and country planner. The default is 4.20. |
| **Search country** | Search the attention queue by country name or code. |
| **Minimum weekly downloads** | Focus the attention queue and overview rating/popup metrics on countries with enough volume. The default is 500+. Set it to **All** to include missing-volume countries. |
| **Reset defaults** | Restore the default brand, store, all countries, target and volume threshold, and use the latest available AppFollow period. |

Campaign country choices use the current brand/store and are independent of the attention queue's country, search and volume filters. Selecting several campaign countries does not change or combine their store ratings.

## Reading the dashboard

### Overview and attention queue

- **Countries below target** counts the displayed, volume-qualified countries below your threshold.
- **Unweighted mean rating** is a simple average of the displayed country ratings. It is not a weighted global store rating.
- **Displayed AppFollow period** identifies the rating observation being shown. A country can have an earlier last observation than the latest source period.
- **Popup store redirects** counts acceptances that sent users toward a store.
- **Popup acceptance rate** is store redirects divided by users shown the popup.
- **Active campaigns** counts registry records with active status. A campaign covering several countries remains one campaign.
- **Data freshness** flags source cutoffs and mismatched periods.

The attention queue is ordered from the lowest rating upward. Compare **Rating / Δ**, **Gap**, **Weekly downloads**, popup activity and campaign status before deciding what needs action.

Weekly downloads may be an exact seven-day value or an approximate month-to-date run rate. Estimates are marked `≈`. Raising the volume filter excludes countries whose volume is below the threshold or unknown.

### Country detail

Select a country row to see its rating trend, popup funnel, in-product sentiment, aggregated feedback and campaign funnel.

Country campaign funnels use participants and submissions attributed to that country. Records without reliable country attribution remain visible in the campaign's **Unknown / unassigned** row. Country-level emails sent, deliveries and rewards granted are unavailable unless those measures are separately supplied; the dashboard does not divide combined counts among countries.

Keep these signals distinct:

| Signal | What it establishes |
| --- | --- |
| AppFollow rating | The displayed rating for the country/store observation. |
| Popup acceptance | A redirect to the store, not a submitted rating. |
| Popup stars | In-product sentiment, not external-store review stars. |
| Submitted screenshot | Evidence received for review. |
| Approved screenshot | Evidence accepted for this reward workflow, not automatically a verified external-store rating. |

## Rating target and email planning

### One country

Select a row and open **Rating target & email plan**. Review the current rating, target and downloads in the last 30 days.

The source provides month-to-date installs, so the default 30-day download value is an estimate:

```text
D = round(month-to-date installs ÷ elapsed source-month days × 30)
X = D × 0.03
```

`X` is an assumed country rating count. The actual country rating count is not provided by the source. Replace the estimated downloads with a known rolling 30-day total when available, or choose **Use source estimate** to restore it.

The five-star requirement is:

```text
Additional five-star ratings = ceil(X × (target − current rating) ÷ (5 − target))
```

The result is zero if the country already meets the target. A rating below 5 cannot reach exactly 5 with a finite number of additional five-star ratings. This is a simple-average planning estimate, not a guarantee of the rating Google Play will display.

The independent email rule is:

```text
Planned emails = ceil(X ÷ (0.01 × 0.8))
               = ceil(D × 3.75)
```

Changing the rating target does not change the email plan. The email formula is download-based; it does not calculate the emails needed to close the rating gap.

### Several countries in one campaign

Choose **Plan a multi-country campaign** or **Launch campaign**. Search and select up to **26 countries**. Selected countries appear as removable chips; use **Clear selection** to start again.

The country plan shows each country's current rating, editable 30-day downloads, five-star requirement and planned emails. Adjust **Target rating** in this dialog to compare the selected countries against one target. This planning target is separate from the main page threshold.

The totals sum the independently rounded country plans. There is no blended campaign rating. A country already above target contributes zero additional five-star ratings, while its email plan still follows the independent download formula.

If a country's required inputs are missing or its target is unreachable, the total is labelled **partial** and states how many country plans are unavailable. A dash is not zero.

## Preparing a country-tracked campaign

### 1. Set campaign details

Choose one campaign name and one campaign ID for all selected countries. The suggested ID changes with the selection; you may enter a custom ID.

Campaign IDs use letters, numbers, hyphens and underscores, with a maximum of 64 characters. IDs containing `test` or `smoke` as separate words are reserved. Choose valid start and end dates, with the end on or after the start.

### 2. Prepare one combined audience CSV

For a multi-country campaign, include one `USERID` and one `COUNTRY` per row:

```csv
USERID,COUNTRY
10001,BR
10002,CL
10003,BR
```

Use the participant's campaign country from your audience export. Two-letter ISO country codes are recommended. The dashboard also recognizes its supported country-name aliases. `USERID` and `COUNTRY` can appear in either order and alongside other columns.

For a single-country campaign, a CSV containing only `USERID` is supported: the selected country is assigned to every row. If a `COUNTRY` column is supplied, it must agree with that selection.

The dashboard checks the entire file before preparation:

- Every row in a multi-country audience needs a country from the selected campaign countries.
- A USERID repeated with the same country is a duplicate; the service reports the excluded duplicate row.
- A USERID repeated with different countries blocks preparation. Correct the source file first.
- Missing, unknown or unselected countries block preparation. They are not silently discarded.
- Changing selected countries revalidates an already loaded file.
- A preparation request may contain up to 5,000 input rows, including duplicates.

Check the displayed unique-user and country counts before proceeding. The CSV remains in browser memory until you explicitly prepare the campaign. Selecting countries does not fetch or filter an audience for you.

### 3. Review the invitation and link settings

The generated campaign message lists all selected countries. Keep participation, support and reward eligibility independent of whether a participant leaves a rating, its sentiment or its star value.

Leave **Rotate secure links** off for a normal preparation or retry. Rotation deliberately replaces links for eligible users already registered to that campaign and should only be used when replacements are intended.

### 4. Check eligibility and prepare

Choose **Check eligibility & prepare**. The form is locked while the request is pending.

The campaign service checks global participation and existing invitations before creating links. A participant's country is saved with the campaign assignment. An existing participant cannot be silently assigned a different country within the same campaign; resolve the source discrepancy first.

The result reports input rows, mailing links created and excluded rows. Download and keep both files private:

| File | Columns and use |
| --- | --- |
| Mailing CSV | `USERID,COUNTRY,UPLOAD_URL` — eligible participants and their personalized secure links. |
| Exclusions CSV | `USERID,COUNTRY,REASON` — rows not included in this preparation, with the reason. |

Exclusions can include an invalid USERID, a duplicate input row, a blocked participation state, an active invitation to another campaign, or a link already issued for this campaign. The visible reason is authoritative; an exclusion is not permission to reset a participant or rotate a link.

If a request loses its response, retry with the same campaign details and CSV, leaving rotation off. The service retains preparation receipts to recover the same result. Do not create another campaign merely because the first response was delayed.

### 5. Send through the normal mailing process

Validate the downloaded file and use your normal mailing process to match USERIDs to recipients. Send each participant only their own `UPLOAD_URL`. Do not share one participant's link with another user or replace it with a generic uploader URL.

The dashboard does not send emails, choose recipients automatically or grant rewards. Link expiry and retention follow the configured service settings.

## Tracking users and submissions by country

Campaign records show combined totals and a **Campaign users and submissions by country** table. This keeps one campaign while separating its operational results.

| Metric | Interpretation |
| --- | --- |
| **Users** | Unique current participant assignments attributed to the country. Older registry audience totals without matching country records remain unassigned. |
| **Submitted** | Screenshot submission records with a submission timestamp. Retries can create multiple submission attempts; this is not a unique-user or verified-rating count. |
| **Pending** | Evidence awaiting review. |
| **Approved** | Evidence accepted by the reviewer. |
| **Rejected** | Evidence rejected or blocked in this workflow. |

Country is copied from the participant's campaign assignment when a submission is created. It is independent of the upload language and is not inferred from IP address, browser location or screenshot content. A later participant assignment change does not rewrite an existing submission's country.

### Older records and unknown countries

The dashboard uses an unambiguous single-country campaign to attribute older records that have no saved country. It does not distribute older multi-country records among the selected countries.

**Unknown / unassigned** includes records with no reliable country, values outside the campaign selection, and differences between registry totals and attributable tracker records. These counts remain part of the combined campaign totals. They are not equally split, guessed from language or hidden.

Historical audience totals can exceed the currently assigned participant rows, for example after users move to another campaign. The difference remains unassigned rather than being presented as a measured country audience. Existing participant and submission records are not rewritten merely by opening the dashboard.

## Screenshot review and rewards

Open **Screenshot review & reward eligibility** and select a campaign. Each pending card displays the USERID, submission time, saved campaign country, upload language and evidence preview.

Review the evidence without considering the rating value or sentiment. **Right Arrow** approves and **Left Arrow** rejects when a visible card is active; shortcuts pause while you type notes.

- **Approve for reward** records acceptance and reward eligibility. The participant is blocked from future campaign preparation under the existing global participation rules.
- **Reject & allow retry** records rejection and allows another upload through the active link, subject to expiry and the service's checks.
- **Undo last decision** returns the latest decision to pending and reverses its counters. Country attribution is preserved.

The next card appears while the save completes. A failed save restores the card and notes for correction. Use **Refresh queue** to fetch the latest protected review state.

The **Download approved USERID CSV** action remains campaign-wide and is available after all pending submissions in that campaign are reviewed. It contains approved USERIDs for your separate reward process; downloading does not grant a reward. Country breakdowns and review cards provide the country context.

## Internal test cohorts

Choose **Test cohort (TEST)** for an internal upload-flow pilot. TEST must be selected by itself; selecting a production country replaces TEST, and selecting TEST clears production countries.

Internal test campaigns appear separately and do not contribute to production country ratings or campaign KPIs. They still use the service's global participation checks. A pilot participant may therefore be ineligible for a later campaign until their state is reviewed. Do not assume TEST disables eligibility rules.

## Source freshness and interpretation

| Source | Expected pattern and limits |
| --- | --- |
| AppFollow ratings | Weekly, normally Friday. Use the displayed observation label and available period. |
| Popup snapshot | Manually refreshed monthly; raw funnel rows may remain undated. |
| Daily popup redirects | Use the displayed last covered date. Renamed monthly export tabs are discovered by their schema. |
| Download volume | Use the displayed source date. Weekly and 30-day values may be estimates from month-to-date installs. |
| Campaign tracker | Operational source with a short server cache, usually up to about 15 minutes for analytics. The protected review queue can be refreshed separately. |

A workbook's modification date does not prove that its underlying observations are current. Sources with different cutoffs should not be described as synchronized.

The general analytics response contains country/campaign aggregates rather than participant identifiers, tokens, screenshots or review notes. Access-protected preparation and review screens expose only the operational data needed for those workflows. Keep mailing and exclusions files private.

## Troubleshooting

| Situation | Action |
| --- | --- |
| The top bar says synthetic demo | Use the protected production hostname and resolve access/source loading before making decisions. |
| A country is missing from the attention queue | Clear search, choose All countries and reduce the volume threshold. Set it to All to include missing volume. |
| A campaign country is missing from the picker | Confirm the selected brand/store has a country rating row. Campaign choices come from that scope. |
| Preparation is disabled after uploading | Read the file status. Check USERID detection, COUNTRY values, conflicting duplicates and selected countries. |
| The service says country tracking is not ready | Stop preparation and ask the system owner to check the uploader deployment. Do not use an older preparation path to bypass country validation. |
| A country change conflicts with an existing participant | Reconcile the audience export and campaign assignment. Do not rotate links to change country. |
| Preparation could not be confirmed | Retry the same details and CSV with rotation off. Preserve existing files and do not resend links until the result is confirmed. |
| A country total is partial or blank | Supply the missing download/rating inputs or change an unreachable target. Missing data is not zero. |
| Country results appear under Unknown / unassigned | The records lack reliable attribution or the registry total exceeds attributable tracker rows. Do not allocate these counts manually without evidence. |
| The country rating has not changed | Check the AppFollow observation and update cadence; ratings are not continuously refreshed. |
| A screenshot preview fails | Resolve the private evidence store's access issue, then use Retry preview. Do not approve evidence you cannot review. |
| The reward export is disabled | Finish pending reviews for the selected campaign. The export remains campaign-wide. |

Before sharing results, state the brand, store, countries, rating period, target, download assumptions and source cutoffs. Distinguish planned emails from sent emails, screenshot approvals from verified external ratings, and known country results from unknown coverage.
