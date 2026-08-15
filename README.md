# 24Pilot Deviation

**24Pilot Deviation (24PD)** is an unofficial Possible Pilot Deviation reporting portal built for the ATC24 / PTFS community. It recreates the *workflow and feeling* of a pilot-deviation interaction while staying explicitly within an online flight-simulation context.

> 24Pilot Deviation is not affiliated with or operated by the FAA, Roblox, PTFS, or ATC24. Reports have no real-world legal or regulatory authority.

## Implemented in v1

- Responsive dark aviation-operations UI
- Home, Live Aircraft, File PPD, Respond, and Public Reports views
- 24Data aircraft feed through a cached server-side Vercel Function
- Live aircraft filters and detail drawer
- Multi-step ATC report wizard with incident-specific fields
- Automatic UTC/Zulu display
- Six-digit spoken PPD number plus canonical case ID
- “Advise when ready to copy a number” controller handoff screen
- Pilot lookup, online contact, and structured response workflow
- Google Sheets persistence through server-side functions
- Local browser fallback when Sheets is not yet configured
- Sanitized public-report endpoint
- Formula-injection protection for user text written to Sheets
- Mock 24Data mode

## Architecture

```text
Browser (HTML/CSS/JS)
   ├── /api/aircraft ──> 24Data (server-side only, cached)
   └── /api/reports/* ──> Google Sheets API
                            ├── Reports
                            ├── ATCReports
                            ├── PilotResponses
                            ├── PublicReports
                            └── AuditLog
```

24Data is never called directly from browser JavaScript. Live aircraft are not continuously copied into Google Sheets; only an intentionally selected aircraft snapshot is included when ATC creates a report.

## Google Sheets setup

Create a spreadsheet named **24Pilot Deviation Database** and create five tabs with these exact first-row headers.

### Reports
`CaseID | PPDNumber | Status | Callsign | PilotUsername | AircraftType | IncidentType | Airport | Airspace | ControllerPosition | OccurredAt | CreatedAt | UpdatedAt | PilotResponseReceived | Public | Disposition`

### ATCReports
`ReportID | CaseID | ATCUsername | Instruction | ObservedAction | Narrative | AssignedAltitude | ObservedAltitude | AssignedHeading | ObservedHeading | AssignedRunway | ObservedRunway | EvidenceURL | SubmittedAt`

### PilotResponses
`ResponseID | CaseID | PilotUsername | UnderstoodInstruction | Narrative | AttemptedCompliance | Emergency | TechnicalIssue | TechnicalDetails | AdditionalInformation | SubmittedAt`

### PublicReports
`CaseID | Callsign | AircraftType | IncidentType | Location | Date | Status | Disposition | Summary | PublishedAt`

### AuditLog
`EventID | CaseID | Event | Actor | Metadata | CreatedAt`

## Google service account

1. Create or choose a Google Cloud project and enable the Google Sheets API.
2. Create a service account and key.
3. Share the **24Pilot Deviation Database** spreadsheet with the service-account email as an editor.
4. Add these values in Vercel Project Settings → Environment Variables:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
GOOGLE_SHEET_ID
```

Never commit service-account JSON, tokens, or private keys to GitHub.

## Development

```bash
npm install
vercel dev
```

Optional environment variable:

```text
USE_MOCK_24DATA=true
```

When enabled, `/api/aircraft` serves fictional development aircraft.

## 24Data retention

The aircraft adapter is server-side and cached. Do not build a permanent historical database of every aircraft or user observed in the live feed. Identifying 24Data-derived information must be removed or anonymized when required by the 24Data retention terms.

## Public reports

The public endpoint reads only the `PublicReports` worksheet. It never publishes ATC internal narratives, raw pilot-response records, audit logs, credentials, or contact metadata automatically.

## Future work

- Moderation/review dashboard
- Authenticated ATC/pilot identities and access tokens
- Real telephone/IVR integration
- Public aircraft/callsign report API
- Automated anonymization/retention workflow
- Optional Discord OAuth

Before adding monetization, review the current 24Data terms. This version is intended as a free community application.
