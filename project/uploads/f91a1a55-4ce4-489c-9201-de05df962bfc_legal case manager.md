```markdown
# Pro Se Legal Case Manager – Complete Technical Blueprint (Final)
### *Prepared by Lead LegalTech Product Manager, Principal AI Systems Architect & Senior Android Engineer*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [High‑Level System Architecture](#2-high-level-system-architecture)
3. [Android Platform Integration (Extended)](#3-android-platform-integration-extended)
4. [Database Schema (Room + SQLCipher)](#4-database-schema-room--sqlcipher)
5. [Feature Set Summary](#5-feature-set-summary)
6. [Screen‑by‑Screen User Flow](#6-screen-by-screen-user-flow)
7. [AI Sub‑Agent System Prompts](#7-ai-sub-agent-system-prompts)
   - Agent A: Grounded RAG Enforcer
   - Agent B: Opposing Filing Auditor
   - Agent C: PDF Field Extractor
   - Agent D: Court Motion Drafter (enhanced)
   - Agent E: PII Redaction Assistant
8. [Enhanced Drafting Pipeline](#8-enhanced-drafting-pipeline)
   - Multi‑Stage Drafting Workflow
   - Few‑Shot Examples
   - Jurisdiction‑Specific Style Guides
9. [API Contracts & JSON Schemas](#9-api-contracts--json-schemas)
10. [Kotlin Architecture Interfaces](#10-kotlin-architecture-interfaces)
11. [Legal Compliance & Court Filing Workflow](#11-legal-compliance--court-filing-workflow)
12. [Infrastructure Resilience & Deployment](#12-infrastructure-resilience--deployment)
13. [Feature Matrix & Risk Assessment](#13-feature-matrix--risk-assessment)
14. [Conclusion](#14-conclusion)

---

## 1. Executive Summary

The **Pro Se Legal Case Manager** is an **Android‑native, privacy‑first** application that empowers self‑represented litigants with end‑to‑end litigation support. It combines:

- **On‑device intelligence** (camera scan, OCR, PII redaction, ruled‑line PDF rendering)
- **Self‑hosted cloud AI** (Gemini 3 Pro, PaddleOCR‑VL, Llama‑Embed‑Nemotron‑8B) on a free Oracle Cloud VM
- **Strict anti‑hallucination RAG** enforced by citation verification and human‑in‑the‑loop review
- **Full court‑filing compliance** (PDF/A, proof of service, fee waiver forms, PII redaction, UPL firewall)
- **Enhanced drafting pipeline** with multi‑stage generation, few‑shot examples, and jurisdiction‑specific style guides for unparalleled motion quality

The app operates **offline‑first** with graceful degradation when cloud services are unavailable. All personal data remains encrypted on‑device, and AI‑generated content is never relied upon without explicit user adoption.

---

## 2. High‑Level System Architecture

### 2.1 Android Client
- **UI:** Jetpack Compose, Material 3, Navigation Compose
- **DI:** Hilt
- **Local DB:** Room + SQLCipher (AES‑256, hardware‑backed Keystore)
- **Camera:** CameraX with ML Kit Document Scanner fallback
- **PDF Engine:** PdfiumAndroid + PdfDocument API
- **Background:** WorkManager, Foreground Services, `AlarmManager` (with permission handling)
- **ML:** ML Kit Text Recognition v2, TFLite runtime with NNAPI/GPU delegates
- **Security:** EncryptedSharedPreferences, EncryptedFile, Scoped Storage, FileProvider

### 2.2 Cloud Backend (Oracle Always Free VM)
- **OS:** Ubuntu 22.04 LTS (ARM Ampere A1, 24 GB RAM, 200 GB storage)
- **Orchestration:** Docker Compose
- **REST API:** FastAPI (Uvicorn/Gunicorn behind Caddy reverse proxy with Let’s Encrypt)
- **OCR:** PaddleOCR‑VL (via Hugging Face Transformers)
- **Embeddings:** Llama‑Embed‑Nemotron‑8B (INT8 quantized, ONNX)
- **Vector DB:** Qdrant Cloud free tier
- **RAG Framework:** Haystack
- **LLM:** Gemini 3 Pro (free tier) via Google AI Studio, proxied through backend
- **Deployment Portability:** Single `docker-compose.yml` can be redeployed to Render, Railway, or Hugging Face Spaces.

### 2.3 Offline Resilience
- **Health check** every 60 seconds.
- On failure → **Offline Local Mode**: all AI features disabled, local features (scanning, form filling, calendar, deadlines) remain fully functional.
- AI requests are **queued in WorkManager** and automatically executed when connectivity resumes.
- UI clearly displays offline status.

---

## 3. Android Platform Integration (Extended)

### 3.1 Deadline Notifications – Exact Alarm & DND Handling

**Android 14+ exact alarm permission revocation** is handled by:
1. Checking `canScheduleExactAlarms()` during case creation wizard.
2. If denied, launching `ACTION_REQUEST_SCHEDULE_EXACT_ALARM` with user education.
3. Fallback: **WorkManager** with `ExpeditedWorkRequest` and `setInitialDelay()` for high‑priority reminders.
4. **DND bypass:** If `ACCESS_NOTIFICATION_POLICY` is denied, the app uses **full‑screen intent** notifications (`USE_FULL_SCREEN_INTENT`) with a high‑importance channel to display during DND without changing user audio settings.

### 3.2 Encrypted Backup & Device Migration

**Problem:** Android Keystore keys are non‑exportable.

**Solution:** An **Encrypted Export & Restore Module** in Settings.  
- Creates `.plcmbackup` archive containing Room DB, `filesDir`, and metadata.  
- Archive encrypted with **AES‑256‑GCM** using a key derived from a **user‑defined passphrase** via **Argon2id**.  
- Restore on a new device by providing the passphrase.

**Interface:**
```kotlin
interface EncryptedBackupManager {
    suspend fun createBackup(passphrase: String, destinationUri: Uri): BackupResult
    suspend fun restoreBackup(sourceUri: Uri, passphrase: String): RestoreResult
}
```

3.3 PDF Rendering & 16 KB Page Alignment

All native libraries (libpdfiumandroid.so, libsqlcipher.so, TFLite) compiled with -Wl,-z,max-page-size=16384. Gradle task verifies ELF alignment.

· Tiled rendering: BitmapRegionDecoder loads only visible portions of template pages.
· Bitmap recycling and Glide caching for thumbnails.

3.4 Cloud API Rate‑Limiting & Circuit Breaker

OkHttp/Retrofit interceptor implements:

· Exponential backoff on 429/503.
· Circuit breaker: after 3 failures in 10 s, trips for 5 min; UI shows “AI temporarily unavailable”.
· Local request queue (Room) replays when circuit closes.

---

4. Database Schema (Room + SQLCipher)

All JSON columns include a "version": 1 field; explicit Migration classes handle schema changes.

Table Purpose Key Fields
cases Central case record case_uuid, case_number, state, county, court_name, judge_name, case_type, current_stage, fee_waiver_granted
parties Plaintiff/Defendant/ThirdParty party_uuid, case_id, name, role, contact_info (JSON), service_methods (JSON)
documents Ingested files doc_uuid, case_id, file_uri, document_type, doc_date, ocr_text, ocr_confidence, pii_redaction_report_uri, embedding_vector_id, extracted_fields (JSON), is_opposition
legal_corpus Ingested statutes/rules state, county, title, chapter, section, text, category, rule_hierarchy_level (1=local, 2=state, 3=federal), is_active
vector_chunks Embedding references legal_corpus_id, chunk_text, qdrant_point_id, jurisdiction
deadlines Automatic calculations case_id, title, trigger_event, trigger_date, due_date, rule_reference, status, related_service_deadline_id, is_service_deadline
pdf_templates Template registry template_name, form_type, category, original_file_hash, parsed_blank_count, is_pdfa_compliant
template_field_mappings Fillable field coordinates template_id, field_id, page_num, bounding_box (JSON), line_height, baseline_y_offset, max_lines, global_key_link
legal_arguments Opposing filing analysis filing_document_id, allegation_text, weakness_score, strategy_notes, statute_grounding_links (JSON)
pii_redactions Redaction log document_id, field_detected, original_text, redacted_text, location_bbox (JSON), rule_cited
proof_of_service Service forms main_document_id, generated_form_uri, service_method, service_date, filed
fee_waiver In Forma Pauperis data case_id, income_data (JSON), state_thresholds_used, generated_motion_uri, proposed_order_uri, status
offline_request_queue AI queries during offline request_body, endpoint, created_at
app_backup_metadata Backup tracking backup_date, file_hash

All tables encrypted with SQLCipher; master key stored in Android Keystore.

---

5. Feature Set Summary

MVP (Must‑Have)

1. Smart Document Intake & Metadata Extraction – OCR + handwriting, auto‑categorization, low‑confidence correction UI.
2. Chronological Case Timeline & Smart Organization – date‑sorted feed, folder tree, full‑text search.
3. Automated Deadline Calculator & Calendar Sync – jurisdiction‑specific rules, weekend/holiday adjustment, push to system calendar.
4. Grounded Legal Q&A (Anti‑Hallucination) – RAG pipeline with citation verification, no outside knowledge.
5. Basic PDF Form Filler (AcroForm + manual mapping) – auto‑populate from case data, export flattened PDFs.

Phase 2 (Advanced)

6. Precision Ruled‑Line Paragraph Engine – dynamic font sizing, text wrapping over physical court form lines.
7. Opposing Filing Auditor & Defense Builder – deep analysis of opponent’s arguments with weakness scoring.
8. One‑Tap Motion Drafting – full legal documents formatted per local rules, grounded in case facts.
9. Evidence Management & Exhibit List Generator – auto‑labeled exhibits, exhibit cover sheets.
10. Pro Se Litigation Stage Tracker – visual progress bar, procedural nudges, plain‑language guidance.

Deployment Essentials Integrated into MVP

· PDF/A Compliance & E‑Filing Validation
· Proof of Service Engine
· Automated PII/PHI Redaction
· UPL Firewall (Adoption Step + Watermark)
· Fee Waiver (In Forma Pauperis) Workflow
· Encrypted Backup & Restore
· Exact Alarm Permission Handling & DND Fallback
· Circuit Breaker & Offline Queue

---

6. Screen‑by‑Screen User Flow

Case Creation Wizard:
Jurisdiction → Details → Topics & Ingestion → Fee Waiver Check (optional, with income input and auto‑generation of forms).

Master Case Dashboard:
Timeline / Folder toggle, FAB with “Scan” / “Import”. New “Fee Waiver” status badge.

Document Detail & OCR Verification:
Split‑screen: image preview + extracted fields with confidence indicators. PII redaction prompt appears if sensitive identifiers are detected, offering automatic redaction with manual override.

Stage Progress Tracker & Deadline Calendar:
Visual litigation bar. Deadlines list includes service deadlines alongside filing deadlines. “Add Proof of Service” button triggers generation of the appropriate form.

PDF Template Studio:
Visual template overlaid with detected fields. Ruled‑line editor with live preview. PDF/A validation button and E‑Filing preview (stamp area reservation, embedded OCR layer).

AI Co‑Counsel Studio:

· Opposing Auditor: Carousel of filings, highlighted allegations and weaknesses, “Suggest Defense” buttons.
· Drafting Workbench: Structured prompt builder, draft preview, multi‑stage drafting pipeline execution, adoption dialog before export.

Settings:
Encrypted Backup creation/restore, Notification/Alarm Permission status, manual offline mode toggle.

---

7. AI Sub‑Agent System Prompts

All prompts are run server‑side and use {{dynamic_placeholders}}. Only the drafting prompt has been enhanced; others remain unchanged.

Agent A: Grounded RAG Enforcer

```
You are an authoritative legal research assistant operating within a highly constrained knowledge boundary. 
Your sole knowledge source is the set of EXCERPTS provided below. You MUST NOT use any outside knowledge, 
legal training, or general reasoning about the law.

RULES:
- Answer the USER QUESTION using ONLY the EXCERPTS.
- For every factual or legal statement, provide a PINPOINT CITATION in brackets, using the exact format 
  from the excerpt's [Source] tag. Example: [Wash. Rev. Code § 4.16.080].
- If the EXCERPTS contain the necessary information, answer completely and concisely.
- If the EXCERPTS do not contain sufficient information to answer the question even partially, 
  respond with exactly the system code ERR_OUT_OF_BOUNDS_LEGAL_CORPUS followed by a brief explanation 
  of what title, chapter, or section appears to be missing (e.g., "Missing: Rules of Civil Procedure 
  regarding default judgment").
- Never speculate, paraphrase law not present in the excerpts, or use your own understanding.
- If the user asks about court deadlines, calculate the exact date if the trigger date is provided in the excerpts.
- Do not advise on strategy; only state what the law requires.

EXCERPTS:
{{#each retrieved_chunks}}
[Source: {{source_ref}}] {{chunk_text}}
{{/each}}

USER QUESTION: {{user_query}}

YOUR ANSWER:
```

Agent B: Opposing Filing Auditor

```
You are a sharp‑eyed litigation analyst assisting a self‑represented litigant. 
You will be given the FULL TEXT of an opposing party's legal filing and, optionally, 
the relevant LOCAL COURT RULES and STATUTES.

Perform the following analysis and return a STRICTLY STRUCTURED JSON object (described below). 
Do not include any text outside the JSON.

1. CLAIMS AND ALLEGATIONS: Extract every distinct legal claim or factual allegation made by the opposing party. 
   For each, list "allegation" and "type" (claim or factual_allegation).
2. PROCEDURAL REQUIREMENTS ANALYSIS: Identify any missing procedural prerequisites under the provided rules/statutes 
   (e.g., failure to state a claim, lack of verification, improper service). For each, specify the relevant citation.
3. FACTUAL CONTRADICTIONS: Note any internal contradictions within the filing.
4. ARGUMENT STRENGTH ASSESSMENT: Rate the overall legal strength (1=very weak, 10=extremely strong).
5. ACTIONABLE RESPONSE OPTIONS: Suggest 2‑4 concrete response strategies grounded in the provided rules/statutes.

OUTPUT JSON STRUCTURE:
{
  "claims_allegations": [{"allegation": string, "type": string}],
  "procedural_gaps": [{"description": string, "rule_citation": string}],
  "factual_contradictions": [string],
  "argument_strength_score": integer,
  "response_options": [{"title": string, "legal_basis": string, "suggested_text": string}]
}

If the provided context does not contain the necessary local rules, still complete the analysis but 
mark each gap with "rule_citation": "NOT PROVIDED". Never invent a rule.

FILING TEXT:
{{filing_text}}

RELEVANT RULES AND STATUTES:
{{retrieved_legal_chunks}}
```

Agent C: PDF Field Extractor

```
You are a document layout analyst specialized in court forms. You receive the OCR text and 
bounding box data for a single page of a PDF form.

TASK: Identify all fillable areas and classify them as SINGLE_LINE or MULTI_LINE_RULED.

For each area, return an object with:
- "field_id": a unique string
- "type": "SINGLE_LINE" or "MULTI_LINE_RULED"
- "bounding_box": { "left": float, "top": float, "width": float, "height": float } in points (origin top-left)
- "label": any text label near the field
- "suggested_global_key": from ["party_plaintiff_name", "party_defendant_name", "case_number", "court_name", "judge_name", "filing_date", "case_type", "other"]

For MULTI_LINE_RULED fields, additionally provide:
- "baseline_y_offset": Y distance from bounding_box.top to first baseline
- "line_height": average vertical distance between baselines
- "max_lines": estimated number of physical lines

CONTEXT: 
OCR Text and Layout: {{ocr_text_with_bboxes}}

RETURN ONLY A VALID JSON ARRAY with no other text.
```

Agent D: Court Motion Drafter (Enhanced)

```
You are a meticulous legal drafting assistant. You will produce a complete first draft of a legal motion 
or pleading for a self‑represented litigant.

RULES:
- The document must follow this structure exactly:
  1. COURT CAPTION (court name, case number, parties)
  2. TITLE OF THE MOTION/PLEADING
  3. STATEMENT OF FACTS (concise, derived only from the provided case context)
  4. LEGAL ARGUMENT & AUTHORITIES (each point must cite a specific statute or rule from the 
     provided LEGAL CORPUS, using pinpoint citation format)
  5. PRAYER FOR RELIEF (what the court is asked to do)
  6. RESPECTFULLY SUBMITTED with signature line and date
  7. CERTIFICATE OF SERVICE (if indicated)

- You MUST NOT use any legal authority that is not explicitly present in the provided LEGAL CORPUS. 
  If you lack authority for a necessary argument, note in the text that legal research is needed.
- Use formal legal language. Keep the draft ready for filing with proper formatting.
- The output must be a JSON object with two fields:
  "title": the motion title
  "body": the full plain‑text body of the document, with line breaks and section headings.

CASE CONTEXT:
Court: {{court_name}}
Case Number: {{case_number}}
Parties: Plaintiff {{plaintiff_name}} vs. Defendant {{defendant_name}}
Summary of Facts: {{facts_summary}}
Motion Type: {{motion_type}}

LEGAL CORPUS:
{{retrieved_legal_chunks}}

RETURN ONLY THE JSON OBJECT, no preamble.
```

Agent E: PII Redaction Assistant

Used only when ambiguity requires LLM confirmation; otherwise rule‑based.

---

8. Enhanced Drafting Pipeline

To elevate the quality of generated motions, pleadings, and fee waiver forms, the drafting subsystem employs a three‑stage iterative process, along with few‑shot examples and jurisdiction‑specific style guides.

8.1 Multi‑Stage Drafting Workflow

Instead of a single prompt, the backend executes the following sequence for each drafting request:

1. Outline Generation
   · Prompt: “Generate a structured outline with the legal arguments and citations you will use, based solely on the provided case facts and legal corpus. Return as JSON with sections array.”
   · The LLM returns a JSON outline containing argument headings, sub‑points, and intended citations.
   · The outline is verified: all cited statutes must exist in the active corpus; if not, the outline is rejected and regenerated.
2. Full Draft Generation
   · Prompt: The approved outline is injected into the drafting prompt along with the full context. The model is instructed: “Follow the outline precisely; write the full motion using only the provided authorities. Do not deviate or add arguments not in the outline.”
   · The output is a plain‑text body of the motion.
3. Review & Revision
   · The generated draft is fed back into the same model with a critique prompt:
          “You are a senior litigation partner. Critique the following draft for clarity, legal accuracy, formatting, and citation correctness. Then produce a revised version that fixes all identified issues.”
   · The final revised draft is returned to the user.

This three‑stage loop dramatically improves the coherence, persuasive strength, and citation accuracy of the final document, effectively turning a general‑purpose LLM into a specialized legal drafter.

8.2 Few‑Shot Examples

Two to three high‑quality examples of well‑drafted motions (with placeholders) are stored per jurisdiction and included in the system prompt during both the outline and drafting stages. Example structure:

```
EXAMPLE MOTION TO DISMISS (California):
[Court Caption Placeholder]
NOTICE OF MOTION AND MOTION TO DISMISS
...
STATEMENT OF FACTS: (Concise, neutral summary)
LEGAL ARGUMENT:
A. Plaintiff Fails to State a Claim Upon Which Relief Can Be Granted
   Under California Code of Civil Procedure § 430.10(e), a complaint must be dismissed if it does not state facts sufficient to constitute a cause of action. Here, ...
...
PRAYER FOR RELIEF: Defendant respectfully requests that the Court dismiss Plaintiff's Complaint with prejudice.
[Signature Block Placeholder]
```

The examples are stored as JSON in legal_corpus (or a dedicated drafting_examples table) and keyed by jurisdiction and motion type. They condition the model to adopt the exact tone, formatting, and argument structure expected by local courts.

8.3 Jurisdiction‑Specific Style Guides

In addition to few‑shot examples, a detailed style guide is appended to the system prompt. This guide is a text block derived from local court rules and conventions. For example:

```
[STYLE GUIDE – California Superior Court, County of Los Angeles]
- All documents must be on 28‑line pleading paper.
- Paragraphs must be numbered consecutively.
- Double‑spaced text; single‑spaced for footnotes and block quotes.
- Font: Times New Roman, 12pt minimum.
- Margins: 1.5 inches left, 1 inch all others.
- Case numbers and party names must appear in the caption exactly as on the complaint.
- Citations must use California Style Manual format.
- Signature block must include printed name, address, phone, and email of self‑represented litigant.
```

The style guide is fetched from the legal_corpus table (tagged with category = "STYLE_GUIDE") and inserted into the prompt before the drafting instructions.

Together, the multi‑stage process, few‑shot examples, and style guide ensure that generated documents are not only legally sound but also ready for filing with minimal user editing.

---

9. API Contracts & JSON Schemas

9.1 DocumentMetadataExtractionSchema.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DocumentMetadataExtraction",
  "type": "object",
  "required": ["doc_uuid", "extraction_date", "parties", "doc_date", "document_type"],
  "properties": {
    "doc_uuid": { "type": "string", "format": "uuid" },
    "extraction_date": { "type": "string", "format": "date-time" },
    "parties": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "role"],
        "properties": {
          "name": { "type": "string" },
          "role": { "type": "string", "enum": ["Plaintiff", "Defendant", "ThirdParty", "Unknown"] },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    },
    "case_number": { "type": "string" },
    "court_name": { "type": "string" },
    "judge_name": { "type": "string" },
    "doc_date": { "type": "string", "format": "date" },
    "document_type": { "type": "string", "enum": ["Pleading", "Motion", "Order", "Exhibit", "Correspondence", "Other"] },
    "low_confidence_flags": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "field": { "type": "string" },
          "reason": { "type": "string" },
          "bounding_box": {
            "type": "object",
            "properties": {
              "left": { "type": "number" },
              "top": { "type": "number" },
              "width": { "type": "number" },
              "height": { "type": "number" }
            }
          }
        }
      }
    }
  }
}
```

9.2 TemplateFieldMappingSchema.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "TemplateFieldMapping",
  "type": "object",
  "required": ["template_id", "page_num", "fields"],
  "properties": {
    "template_id": { "type": "string" },
    "page_num": { "type": "integer" },
    "fields": {
      "type": "array",
      "items": {
        "oneOf": [
          {
            "type": "object",
            "required": ["field_id", "type", "bounding_box", "suggested_global_key"],
            "properties": {
              "field_id": { "type": "string" },
              "type": { "type": "string", "enum": ["SINGLE_LINE"] },
              "bounding_box": {
                "type": "object",
                "required": ["left", "top", "width", "height"],
                "properties": {
                  "left": { "type": "number" },
                  "top": { "type": "number" },
                  "width": { "type": "number" },
                  "height": { "type": "number" }
                }
              },
              "label": { "type": "string" },
              "suggested_global_key": { "type": "string" }
            }
          },
          {
            "type": "object",
            "required": ["field_id", "type", "bounding_box", "baseline_y_offset", "line_height", "max_lines"],
            "properties": {
              "field_id": { "type": "string" },
              "type": { "type": "string", "enum": ["MULTI_LINE_RULED"] },
              "bounding_box": {
                "type": "object",
                "required": ["left", "top", "width", "height"],
                "properties": {
                  "left": { "type": "number" },
                  "top": { "type": "number" },
                  "width": { "type": "number" },
                  "height": { "type": "number" }
                }
              },
              "label": { "type": "string" },
              "suggested_global_key": { "type": "string" },
              "baseline_y_offset": { "type": "number" },
              "line_height": { "type": "number" },
              "max_lines": { "type": "integer" }
            }
          }
        ]
      }
    }
  }
}
```

9.3 CourtListenerSearchContract.json

Request

```json
{
  "jurisdiction": "ca",
  "docket_number": "22-1234",
  "keywords": "summary judgment standard",
  "date_range": { "start": "2023-01-01", "end": "2024-12-31" },
  "page": 1
}
```

Response

```json
{
  "count": 42,
  "results": [
    {
      "id": 987654,
      "case_name": "Smith v. Jones",
      "court": "California Court of Appeal, Second District",
      "date_filed": "2024-05-10",
      "citations": ["15 Cal.App.5th 1234"],
      "summary": "The court held that...",
      "opinion_url": "https://www.courtlistener.com/opinion/987654/smith-v-jones/"
    }
  ]
}
```

9.4 RAGGroundedQueryContract.json

Request

```json
{
  "query_id": "uuid",
  "case_id": "uuid",
  "user_query": "When is the deadline to file an answer after service?",
  "context_chunk_ids": ["chunk_001", "chunk_002"]
}
```

Response

```json
{
  "query_id": "uuid",
  "answer_text": "Under California Code of Civil Procedure § 412.20(a)(3), the answer must be filed within 30 days after service.",
  "source_citations": [
    {
      "citation": "Cal. Code Civ. Proc. § 412.20(a)(3)",
      "chunk_id": "chunk_001",
      "text_excerpt": "(a)(3) The defendant shall serve and file an answer within 30 days after the service of the summons."
    }
  ],
  "boundary_met": true,
  "recommended_next_steps": ["If you have already been served, note the date of service to calculate the precise deadline."]
}
```

9.5 DraftingRequest.json (New)

Request

```json
{
  "case_id": "uuid",
  "motion_type": "MOTION_TO_DISMISS",
  "facts_summary": "Plaintiff alleges breach of contract but failed to attach the contract...",
  "jurisdiction": "CA",
  "county": "Los Angeles"
}
```

Response (Streaming)

```json
{
  "draft_id": "uuid",
  "title": "Notice of Motion and Motion to Dismiss",
  "body": "[Full plain‑text motion]",
  "outline_used": {...},
  "revision_log": "Critique: ... ; Changes: ..."
}
```

9.6 PIIRedactionReport.json, ProofOfServiceRequest.json, FeeWaiverIntake.json

(Defined in previous blueprint; unchanged.)

---

10. Kotlin Architecture Interfaces

Key interfaces for the Android application, bound via Hilt.

10.1 RuledLineCanvasRenderer.kt

```kotlin
interface RuledLineCanvasRenderer {
    suspend fun drawRuledText(
        canvas: Canvas,
        text: String,
        fieldMapping: MultiLineRuledField,
        paintStyle: TextPaintSpec
    ): LayoutResult

    data class MultiLineRuledField(
        val left: Float, val top: Float, val width: Float,
        val lineBaselines: List<Float>,
        val minFontSize: Float = 8f, val maxFontSize: Float = 14f
    )
    data class TextPaintSpec(val typeface: Typeface, val color: Int, val alignment: Layout.Alignment = Layout.Alignment.ALIGN_NORMAL)
    data class LayoutResult(val fontSizeUsed: Float, val lineCount: Int)
}
```

10.2 GroundedRagRepository.kt

```kotlin
interface GroundedRagRepository {
    suspend fun indexLegalChunk(caseId: String, chunkText: String, sourceRef: String, jurisdiction: String): String
    suspend fun searchRelevantChunks(caseId: String, query: String, topK: Int = 5): List<RetrievedChunk>
    data class RetrievedChunk(val chunkId: String, val text: String, val sourceRef: String, val score: Float)
}
```

10.3 DeadlineCalculationEngine.kt

```kotlin
interface DeadlineCalculationEngine {
    suspend fun calculateDeadlines(caseId: String, trigger: TriggerEvent, triggerDate: Long): List<Deadline>
    enum class TriggerEvent { SERVICE_OF_SUMMONS, FILING_OF_COMPLAINT, FILING_OF_ANSWER, FILING_OF_MOTION, COURT_ORDER, DISCOVERY_REQUEST }
    data class Deadline(val title: String, val description: String, val dueDate: Long, val ruleCitation: String, val isWeekendAdjusted: Boolean, val calendarSyncId: String? = null)
}
```

10.4 EnhancedDraftingPipeline.kt (New)

```kotlin
interface EnhancedDraftingPipeline {
    suspend fun generateDraft(request: DraftingRequest): DraftingResult

    data class DraftingRequest(
        val caseId: String,
        val motionType: String,
        val factsSummary: String,
        val jurisdiction: String,
        val county: String?
    )

    data class DraftingResult(
        val draftId: String,
        val title: String,
        val body: String,
        val outline: LegalOutline,
        val revisionNotes: String
    )

    data class LegalOutline(val sections: List<OutlineSection>)
    data class OutlineSection(val heading: String, val points: List<String>, val citedStatutes: List<String>)
}
```

Implementation in EnhancedDraftingPipelineImpl manages the three‑stage process and integrates few‑shot examples and style guides from the local legal_corpus.

10.5 Additional Interfaces

· PiiRedactionScanner, PdfComplianceValidator, ProofOfServiceGenerator, FeeWaiverEngine, EncryptedBackupManager, DeadlineScheduler, ApiCircuitBreaker as previously defined.

---

11. Legal Compliance & Court Filing Workflow

11.1 PDF/A & E‑Filing

· Validator checks for embedded fonts, no scripts, metadata.
· Option to reserve 2‑inch top‑right stamp area, embed OCR text layer.
· Convert to PDF/A‑1b using PDFBox before export.

11.2 Proof of Service Engine

· Extracts opposing party contact info.
· Generates state‑compliant Proof of Service form (Agent D).
· Auto‑fills serving party, documents, date/method.
· Adds related service deadline (+3 days for mail) linked to filing deadline.

11.3 PII Redaction

· Automatic scan before export or share.
· Redacts SSNs, DOBs, minor names, financial accounts.
· Report saved; user can manually adjust.

11.4 UPL Firewall

· Adoption step: Full‑screen overlay with checkbox before export.
· Watermark: “Working Draft – Prepared by Self‑Represented Litigant” until adopted.
· Permanent disclaimer banner on AI screens.

---

12. Infrastructure Resilience & Deployment

12.1 Graceful Degradation

· Health check → offline mode on failure.
· WorkManager queues AI queries; local features unaffected.

12.2 Portable Backend Container

· Single docker-compose.yml for all services.
· Deployable to Oracle VM, Render, Railway, Hugging Face Spaces.

12.3 16 KB Page Alignment

· All native libs compiled with -Wl,-z,max-page-size=16384.
· Gradle verification task.

---

13. Feature Matrix & Risk Assessment

Feature Phase User Value Tech Complexity Primary Risk Mitigation
Smart Document Intake & OCR MVP Critical Medium Handwriting inaccuracy Confidence‑based correction UI
Chronological Timeline MVP High Low Large document sets Pagination, thumbnail caching
Automated Deadline Calculator MVP Critical Medium Wrong rule for niche jurisdiction Manual override, hierarchy engine
Grounded Legal Q&A MVP Critical High Hallucination Citation verification, strict prompts
Basic PDF Form Filler MVP High Medium Non‑standard templates Manual bounding box mapping
Precision Ruled‑Line Engine P2 High High Irregular template spacing User offset adjustments, extensive test suite
Opposing Filing Auditor P2 High High Missing key legal issues Human review, per‑finding confidence
One‑Tap Motion Drafting P2 High High UPL risk Adoption step, watermark, enhanced pipeline
Evidence Management P2 Medium Medium User mislabeling Guided workflows
Litigation Stage Tracker P2 High Medium Misdetection Manual override
PDF/A & E‑Filing Compliance MVP Critical Medium Non‑compliant PDFs Integrated validator, PDF/A conversion
Proof of Service Engine MVP Critical Medium Outdated form templates Updated via rule ingestion
PII Redaction MVP Critical Medium Over‑redaction Manual review before finalization
UPL Firewall MVP Critical Low Inadequate user understanding Explicit adoption + prominent disclaimer
Fee Waiver Integration MVP High Medium Out‑dated income thresholds Regular app updates with state data
Encrypted Backup & Restore MVP High Medium User forgets passphrase Clear warnings; no recovery without passphrase
Exact Alarm & DND Handling MVP High Low Permission denied Fallback to WorkManager + full‑screen intents
API Circuit Breaker MVP High Low 429/503 storms Immediate offline fallback, request queuing
Schema Migration MVP Critical Medium Data loss on update Explicit, tested migration paths; JSON versioning
Enhanced Drafting Pipeline P2 High Medium Increased LLM call count Caching outlines; efficient context reuse

---

14. Conclusion

This blueprint defines a fully production‑ready, legally compliant, and financially accessible Android application for self‑represented litigants. Every layer—from native camera capture and encrypted local storage to the multi‑stage AI drafting pipeline and court e‑filing validation—has been designed with privacy, accuracy, and user empowerment in mind. The enhanced drafting workflow, jurisdiction‑specific style guides, and few‑shot examples elevate the application from a simple form‑filler to a genuine litigation partner, while the rigorous anti‑hallucination, UPL firewall, and PII redaction mechanisms keep users safe and on the right side of the law. The entire system can be built and operated using only free‑tier services, making justice accessible to all.

```