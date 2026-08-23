# Bright Data Scraper Studio Integration & CLI Reference

MandiPulse utilizes the `@brightdata/cli` package to orchestrate custom scrapers generated via Scraper Studio. These scrapers use natural language prompts to auto-generate javascript code that runs on Bright Data's cloud infrastructure.

## Setup & Authentication

Before running any commands, make sure your API token is set in your environment variables:

```bash
# Set environment variable
export BRIGHTDATA_API_TOKEN="your_brightdata_token_here"
```

To verify your credentials and check current budget info:
```bash
npx bdata budget
```

---

## 1. Creating a Scraper (Natural Language Prompting)
You can create a custom scraper using a natural language prompt. Bright Data Scraper Studio will analyze the URL and the description, then auto-generate extraction rules.

**Command Syntax:**
```bash
npx bdata scraper create <url> "<description>" --name "<scraper_name>"
```

**Example for MandiPulse:**
```bash
npx bdata scraper create https://www.commodityonline.com/mandi-prices/maharashtra/mumbai "Extract a list of commodities, their market name, min price, max price, modal price, and the report date. Output a JSON array containing objects with keys: commodity, market, min_price, max_price, modal_price, and report_date." --name "commodity_online_mumbai"
```

**Output:**
This will return a unique Collector ID (e.g. `c_mt364sxr1jxad1qpuy`). Save this ID in `packages/backend/src/collectors/mandi-registry.ts`.

---

## 2. Running a Scraper
Trigger a scrape run using your Collector ID and get the latest extracted data in JSON format.

**Command Syntax:**
```bash
npx bdata scraper run <collector_id> <url> -o <output_file_path> --pretty
```

**Example:**
```bash
npx bdata scraper run c_mt364sxr1jxad1qpuy https://www.commodityonline.com/mandi-prices/maharashtra/mumbai -o run-output.json --pretty
```

---

## 3. Healing a Scraper (Self-Healing on Schema Drift)
If the target website updates its DOM or layout, the scraper might return nulls or miss fields. To fix this, you run the `heal` command with a diagnostic description of the failure. Bright Data's AI will self-heal the scraper and return a preview of corrected results.

**Command Syntax:**
```bash
npx bdata scraper heal <collector_id> "<diagnosis_prompt>" --url <optional_target_url>
```

**Example for MandiPulse:**
```bash
npx bdata scraper heal c_mt364sxr1jxad1qpuy "The target webpage changed the date element class. The report date selector is now in the header heading 'Mandi Prices as of DD-MM-YYYY' instead of the footer. Extract the date from that heading and assign it to report_date."
```

---

## 4. Approving a Heal
Once a scraper has been healed and the preview output has been graded and passed, you must approve the healed version to deploy it to production.

**Command Syntax:**
```bash
npx bdata scraper approve <collector_id>
```

To reject a failed heal attempt and revert:
```bash
npx bdata scraper approve <collector_id> --reject
```
