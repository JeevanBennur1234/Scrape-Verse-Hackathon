# Mandi Portal Vetting — Scratch Doc (Step 1)

Vetted by fetching raw HTML of each page on 2026-08-21. This list replaces every
`example.in` placeholder in `packages/backend/src/collectors/mandi-registry.ts`.

---

## FINAL PICKS

### 1. Karnataka HOPCOMS — Mysore (Today Rate)
- **URL:** http://hopcomsmysore.karnataka.gov.in/TodayRate.aspx
- **Render:** Server-rendered Telerik RadGrid — column headers + grid schema ARE in View Source.
  Data rows bind after a District postback (District dropdown → MYSORE) → flag "render JS / interaction".
- **No login / CAPTCHA / paywall.** Public page. Date label rendered server-side ("Today's Rate (21-Aug-2026)").
- **Fields (exact, from grid schema):**
  - `ItemCode` → header "CODE"
  - `ItemName` → header "NAME"
  - `RegionalItemName` → header "REGIONAL NAME" (Kannada)
  - `OutletSellingRate` → header "RATE"
  - date from `lblTodayRate` label
- **Caveat:** These are HOPCOMS outlet *retail selling* rates (₹/kg-ish), not wholesale mandi arrivals.

### 2. Karnataka HOPCOMS — Bangalore (Fruits & Vegetables)
- **URL:** https://hopcoms.karnataka.gov.in/CropRates.aspx
- **Render:** Page shell is in View Source but the rate grid (`grdRates`) is EMPTY in raw HTML —
  populated via ASP.NET AJAX (ToolkitScriptManager) → flag "render JS".
- **No login / CAPTCHA / paywall.**
- **Fields:** search box targets grid `grdRates`; visible labels: `lblItemRates` ("Item Rates on:"),
  `lblDate`. Column headers only appear after JS render — confirm exact names in browser DevTools
  during collector creation.

### 3. Punjab Mandi Board (PSAMB) — Daily Price/Arrival
- **URL:** https://emandikaran-pb.in/Home/MandiArrival
- **Render:** AngularJS SPA (`ng-app="aarthiModule"`) — table body is client-rendered → flag "render JS".
  JSON API behind it (see `/App/ArrivalReport/Factories/MandiArrivalFactory.js`) — may be callable directly.
- **No login / CAPTCHA / paywall** on this public report page (Sign In buttons are for other services).
- **Fields (exact, from Angular template):**
  - `Sr.No.` (index)
  - `DistrictName` → "District"
  - `BranchName` → "Market Committee" (= market)
  - `CommodityName` → "Commodity Name"
  - `EntryDate` → "Date"
  - `Quantity` → "Quantity" (arrival)
  - `Minprice` → "Min Price"
  - `MaxPrice` → "Max Price"
  - `ModalPrice` → "Modal Price"
- Filters: Price/Arrival/Both, Commodity, District, Market Committee, Date From/To.

### 4. MP e-Mandi Board (MP State Agricultural Marketing Board)
- **URLs:**
  - Dashboard: https://eanugya.mp.gov.in/Inward_Quote.aspx
  - Direct modal-rate report: https://eanugya.mp.gov.in/Public/BBY_MRateRPTDayWise.aspx
- **⚠️ CAPTCHA:** BOTH pages gate the report behind an image CAPTCHA (`/Handler/GCaptcha.ashx`
  + required `txtCapcha` input). Bright Data can solve it, but must be flagged at creation.
- **Render:** Report tables (`MandiWiseTable`, `tblrecordWritebody`) are empty in View Source and
  filled via AJAX POST to `/Public/BBY_MRateRPTDayWise.aspx/BBY_GetFarmerData` (returns JSON,
  field `ModalRate` confirmed in payload) → flag "render JS".
- **No login wall** for the public report; logins exist only for mandi/trader roles.
- **Fields (headers are Hindi):**
  - सं.क्र. = sr_no
  - मंडी का नाम = mandi_name (market)
  - कुल आवक(टन में) = total_arrival_tonnes
  - न्यूनतम दर (रूपये प्रति क्विंटल) = min_price (₹/quintal)
  - उच्चतम दर (रूपये प्रति क्विंटल) = max_price
  - मॉडल दर (रूपये प्रति क्विंटल) = modal_price

---

## REJECTED / FALLBACK NOTES

- **Agmarknet daily report** (https://agmarknet.gov.in/daily-price-and-arrival-report):
  has its own CAPTCHA + heavy ASP.NET postback UI. Clean official alternative =
  data.gov.in "Current Daily Price of Various Commodities from Various Markets (Mandi)"
  API (free API key, JSON/CSV). Good national fallback if a state portal breaks.
- **emandikaran-pb.in/Home/MandiArrival default view** shows "No Records Found!" until filters
  are submitted — expected behavior, not a blocker.
- **Third-party mirrors** (kisandeals, farmer.in, commoditymarketlive, etc.): convenient HTML
  tables but NOT primary sources — avoid for the registry.

## COLLECTOR CREATION LOG (Step 3-4 results, 2026-08-21)

| Collector ID | Portal | Status |
|---|---|---|
| `c_mt2mhs6s2i4ww8hntx` | Mumbai APMC Bajarbhav (veg) | ✅ **WORKS** — 56 real rows in `mumbai-run.json` (2 MB). Fields: report_date, commodity_name, arrival_qty, min_price, max_price, avg_price. Quirk: template navigates to dated archive page (Aug 3) instead of today's `/daily-bajarbhav-dates/veg` → heal candidate. NOTE: re-trigger returned "Collector disabled" 403 — needs enabling in dashboard. |
| `c_mt2ku77p2ejeogg2g8` | Punjab PSAMB MandiArrival | ❌ Dead — Bright Data AI could not generate template (confirmed by email from Bright Data). AngularJS SPA too complex for auto-generation. |
| `c_mt2k81py2jb5dcu8ku` | Punjab PSAMB (1st attempt) | ❌ Dead half-built — delete in dashboard |
| `c_mt2k7dc223wwau0k5f` | HOPCOMS Mysore | ❌ Dead — `.gov.in` domain blocked pending KYC (https://brightdata.com/cp/kyc) |

### Blockers discovered
1. **`.gov.in` domains require Bright Data KYC** — fill https://brightdata.com/cp/kyc to unlock HOPCOMS/MP/Agmarknet.
2. **AngularJS/filter-driven SPAs fail AI generation** (Punjab).
3. **AI generation is slow** (10-30+ min); CLI polling output should always be redirected to a file.

### Revised final portal lineup
1. **Mumbai APMC Bajarbhav** — https://apmcmumbai.org/bajarbhav/daily-bajarbhav-dates/veg — ✅ working collector `c_mt2mhs6s2i4ww8hntx`
   (same site also has fruit/dhanya/masala/turbhe onion-potato markets — can spawn sibling collectors cheaply)
2. **MSAMB (Maharashtra State Agri Marketing Board)** — https://www.msamb.com/ApmcDetail/APMCPriceInformation — state-wide arrivals & prices, `.com` domain, TO VET
3. **HOPCOMS Mysore** — http://hopcomsmysore.karnataka.gov.in/TodayRate.aspx — blocked until KYC
4. **MP e-Mandi** — https://eanugya.mp.gov.in/Public/BBY_MRateRPTDayWise.aspx — blocked until KYC (+ has CAPTCHA)

## REGISTRY MAPPING (for mandi-registry.ts)

| collectorId | name | state | portalUrl | expectedFields |
|---|---|---|---|---|
| collector_hopcoms_mysore | HOPCOMS Mysore Today Rate | Karnataka | http://hopcomsmysore.karnataka.gov.in/TodayRate.aspx | itemCode, itemName, regionalItemName, outletSellingRate, date |
| collector_hopcoms_bengaluru | HOPCOMS Bengaluru F&V Rates | Karnataka | https://hopcoms.karnataka.gov.in/CropRates.aspx | commodity, rate, date |
| collector_punjab_psamb | Punjab Mandi Board Daily Price/Arrival | Punjab | https://emandikaran-pb.in/Home/MandiArrival | district, marketCommittee, commodity, entryDate, quantity, minPrice, maxPrice, modalPrice |
| collector_mp_emandi | MP e-Mandi Daily Arrivals/Rates | Madhya Pradesh | https://eanugya.mp.gov.in/Public/BBY_MRateRPTDayWise.aspx | mandiName, totalArrivalTonnes, minPrice, maxPrice, modalPrice |
